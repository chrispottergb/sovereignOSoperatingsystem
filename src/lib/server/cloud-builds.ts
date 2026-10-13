import 'server-only';
import {Sandbox,SandboxNotFoundError} from 'railway';
import {createHash,randomBytes} from 'node:crypto';
import {db,storeArtifact,readArtifact} from './astra-store';
import {AppError} from './errors';
import {modelFor,boundedEnv} from './config';
import {completion} from './model-completion';
import type {ProviderId} from '../contracts';
import type {BuildInput} from '../tools/build-contract';
const origin='https://sovereign-ai-workspace-zeta.vercel.app';
type Job={id:string;input:BuildInput;status:string;started_at:string;sandbox_id:string|null;model_calls:number};
export function cloudBuildConfigured(){return Boolean(process.env.RAILWAY_BUILD_TOKEN?.trim());}
function railwayConfig(){return {token:process.env.RAILWAY_BUILD_TOKEN!.trim(),authType:'project-token' as const,environmentId:'fb94bbe9-dd34-40d4-9e83-41331b2dd41f'};}
export async function enqueueCloudBuild(input:BuildInput,requestId:string){
 if(!cloudBuildConfigured())throw new AppError('CLOUD_SETUP_REQUIRED','Save the Railway project token before using cloud builds.',409);
 if(input.files.length)throw new AppError('CLOUD_FILES_UNAVAILABLE','Cloud builds currently create a new project from your prompt and council brief. Local file imports are not connected.',400);
 if(!process.env[input.builder==='codex'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY'])throw new AppError('ENGINE_UNAVAILABLE','The selected coding provider is not configured.',409);
 const settings=await db<{enabled:boolean}[]>('astra_cloud_settings?id=eq.main');
 if(!settings[0]?.enabled)throw new AppError('CLOUD_PAUSED','Enable background execution on the Cloud page first.',409);
 const today=new Date().toISOString().slice(0,10);
 const previous=await db<{id:string}[]>(`astra_cloud_builds?request_id=eq.${requestId}&select=id`);
 if(!previous.length&&(await db<unknown[]>(`astra_cloud_builds?created_at=gte.${today}T00:00:00Z&select=id`)).length>=2)throw new AppError('DAILY_BUILD_LIMIT','Cloud builds are capped at two submissions per UTC day.',429);
 return db<string>('rpc/astra_enqueue_cloud_build',{method:'POST',body:JSON.stringify({p_request:requestId,p_input:{...input,minutes:Math.min(input.minutes,2),claude_budget_usd:Math.min(input.claude_budget_usd,1)}})});
}
export async function listCloudBuilds(){if(!cloudBuildConfigured())return [];return db('astra_cloud_builds?select=id,input,status,stage,created_at,result,artifact_path,model_calls&order=created_at.desc&limit=20');}
function quote(value:string){return "'"+value.replaceAll("'","'\\''")+"'";}
export function cloudBuilderCommand(builder:BuildInput['builder'],model:string,budget=1){
 return builder==='codex'
 ? `codex -a never exec --sandbox workspace-write --skip-git-repo-check --ephemeral -m ${quote(model)} --json -o /tmp/sovereign-report.md - < /tmp/sovereign-task.txt`
 : `claude --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools Read,Write,Edit,Glob,Grep,Bash --allowedTools Read,Write,Edit,Glob,Grep,Bash --permission-mode dontAsk --no-session-persistence --max-budget-usd ${Math.max(0.1,Math.min(budget,1))} --model ${quote(model)} --output-format json --print < /tmp/sovereign-task.txt`;
}
// Runs independently of agent prose, inside the same disposable VM. No provider
// or management credential is present in this process environment.
const verificationScript=`const fs=require('fs'),cp=require('child_process'),path=require('path');
const checks=[];let pkg={};try{pkg=JSON.parse(fs.readFileSync('/app/package.json','utf8'));}catch{}
for(const name of ['test','build']){if(!pkg.scripts?.[name]){checks.push({name,status:'not_run',reason:'No package script'});continue;}const r=cp.spawnSync('npm',['run',name],{cwd:'/app',env:{PATH:process.env.PATH,HOME:'/tmp/verification-home',CI:'true'},timeout:25000,maxBuffer:100000,encoding:'utf8'});checks.push({name,status:r.status===0?'passed':'failed',exitCode:r.status,output:String(r.stdout||'').slice(-3000)});}
const files=[],omitted=[];let bytes=0;function walk(dir,depth=0){if(depth>6)return;for(const name of fs.readdirSync(dir)){if(name.startsWith('.')||['node_modules','dist','build','coverage','.next'].includes(name))continue;const p=path.join(dir,name),s=fs.lstatSync(p);if(s.isSymbolicLink())continue;if(s.isDirectory()){walk(p,depth+1);continue;}const relative=path.relative('/app',p);if(!/\\.(?:[cm]?[jt]sx?|json|md|txt|html|css|svg|py|toml|yaml|yml|sql)$/.test(name)){omitted.push(relative);continue;}if(s.size>100000||bytes+s.size>1000000||files.length>=60){omitted.push(relative);continue;}files.push({path:relative,content:fs.readFileSync(p,'utf8')});bytes+=s.size;}}
walk('/app');fs.writeFileSync('/tmp/sovereign-artifacts.json',JSON.stringify({checks,files,omitted}));`;
// Post-build review loop. These run in the Vercel process (which holds provider
// keys) over the SAVED artifacts; they never touch the sandbox and are separate
// from the sandbox's job-scoped 12-call budget.
const correctionMinutes=()=>boundedEnv('CLOUD_BUILD_CORRECTION_MINUTES',1,0,2);
type Check={name?:string;status:string;output?:string};
type BuildSummary={builder:BuildInput['builder'];outcome:'completed'|'failed';corrected:boolean;report:string;checks:Check[];fileCount:number};
type ReviewJob={id:string;input:BuildInput;result:{build:BuildSummary;review?:string}|null;artifact_path:string|null};
function engineProviders(builder:BuildInput['builder']):{builder:ProviderId;reviewer:ProviderId}{const b:ProviderId=builder==='codex'?'openai':'claude';return {builder:b,reviewer:b==='openai'?'claude':'openai'};}
function checkLines(checks:Check[]){return checks.map(c=>`- ${c.name??'check'}: ${c.status}${c.output?`\n${String(c.output).slice(-1200)}`:''}`).join('\n')||'No scripted checks were available.';}
function reviewPrompt(input:BuildInput,build:BuildSummary,artifact:{files:{path:string;content:string}[];omitted?:string[]}|null){
 const files=artifact?.files??[];let source='',used=0;for(const f of files){if(used>30000)break;const slice=f.content.slice(0,8000);source+=`\n=== ${f.path} ===\n${slice}\n`;used+=slice.length;}
 return `You are the independent reviewer, a different provider from the builder. Review the ACTUAL saved source and the independently recorded test/build results against the request. Identify concrete defects, missing acceptance criteria and real risks. Do NOT claim any test ran or passed unless the recorded results below say so; model agreement is not correctness. Maximum 500 words.\nORIGINAL REQUEST:\n${input.task}\nCOUNCIL BRIEF (subordinate to the request):\n${input.councilBrief??'(none)'}\nBUILDER REPORT (the builder's own prose — a claim, not proof):\n${build.report.slice(0,6000)}\nINDEPENDENTLY RECORDED CHECKS:\n${checkLines(build.checks)}\nSAVED SOURCE (${files.length} files${artifact?.omitted?.length?`, ${artifact.omitted.length} omitted`:''}):${source||'\n(source unavailable; review from the checks and report only)'}`;
}
function correctionTask(input:BuildInput,report:string,checks:Check[]){
 const failing=checks.filter(c=>c.status==='failed');
 return `A previous pass in /app produced failing checks. Fix ONLY the cause of these failures in /app. Do not start over, publish, deploy or access secrets. Keep the existing working source and re-run the relevant checks yourself. Report exactly what you changed.\nREQUEST:\n${input.task}\nFAILING CHECKS:\n${failing.map(c=>`- ${c.name??'check'}:\n${String(c.output||'').slice(-1500)}`).join('\n')||'(a check failed)'}\nPREVIOUS REPORT:\n${report.slice(0,3000)}`;
}
function finalPrompt(input:BuildInput,build:BuildSummary,review:string){
 return `Deliver ONE useful final answer to the original request, for the person who asked. A ${build.builder==='codex'?'Codex':'Claude Code'} build ran in an isolated cloud sandbox; its source and independently recorded checks are saved and downloadable. Describe the ACTUAL saved result and the independently reviewed findings. State real test outcomes and any failures or unresolved defects plainly — never call an incomplete or failed build successful. No model-by-model transcript. No deployment, merge or publish occurred. Maximum 900 words.\nORIGINAL REQUEST:\n${input.task}\nCOUNCIL BRIEF:\n${input.councilBrief??'(none)'}\nBUILD OUTCOME: ${build.outcome}${build.corrected?' (after one bounded correction pass)':''}\nINDEPENDENTLY RECORDED CHECKS:\n${checkLines(build.checks)}\nINDEPENDENT REVIEW (by ${engineProviders(build.builder).reviewer}):\n${review.slice(0,8000)}`;
}
// Resumable, no sandbox. Review is checkpointed before the final answer so a
// retry reuses it; a provider failure stops as uncertain and is not re-billed.
export async function finalizeCloudBuild(job:ReviewJob){
 if(!job.result?.build){await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.reviewing`,{method:'PATCH',body:JSON.stringify({status:'uncertain',stage:'review state missing'})});return;}
 const build=job.result.build,{reviewer}=engineProviders(build.builder);
 let review=job.result.review;
 try{
  if(!review){
   const artifact=job.artifact_path?await readArtifact<{files:{path:string;content:string}[];omitted?:string[]}>(job.artifact_path).catch(()=>null):null;
   review=(await completion(AbortSignal.timeout(120000))(reviewer,reviewPrompt(job.input,build,artifact),'review')).response;
   await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.reviewing`,{method:'PATCH',body:JSON.stringify({result:{build,review}})});
  }
  const synth:ProviderId=job.input.synthesizer==='openai'?'openai':'claude';
  const final=(await completion(AbortSignal.timeout(120000))(synth,finalPrompt(job.input,build,review),'final')).response;
  const status=build.outcome==='completed'?'completed':'failed';
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.reviewing`,{method:'PATCH',body:JSON.stringify({status,stage:'finished',result:{build,review,final,...(status==='failed'?{error:'The build did not fully pass; the final answer explains what failed.'}:{})}})});
 }catch{
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.reviewing`,{method:'PATCH',body:JSON.stringify({status:'uncertain',stage:'review did not complete; no automatic retry',result:{build,...(review?{review}:{})}})});
 }
}
export async function runCloudBuildTick(){
 if(!cloudBuildConfigured())return false;
 const stale=await db<Job[]>('astra_cloud_builds?status=eq.running&started_at=lt.'+new Date(Date.now()-360000).toISOString());
 for(const job of stale){
  if(job.sandbox_id){try{await (await Sandbox.connect(job.sandbox_id,railwayConfig())).destroy();}catch(e){if(!(e instanceof SandboxNotFoundError))continue;}}
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({status:'uncertain',stage:'interrupted; review before retry',token_hash:null})});
 }
 const reviewing=await db<ReviewJob[]>('rpc/astra_claim_cloud_build_review',{method:'POST',body:'{}'});
 if(reviewing.length){await finalizeCloudBuild(reviewing[0]);return true;}
 const jobs=await db<Job[]>('rpc/astra_claim_cloud_build',{method:'POST',body:'{}'});if(!jobs.length)return false;
 const job=jobs[0],token=randomBytes(32).toString('hex');let sandbox:Sandbox|undefined;let outcome:'completed'|'failed'='failed',result:unknown={error:'Cloud build did not finish. No automatic retry.'},checkpointed=false;
 try{
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({token_hash:createHash('sha256').update(token).digest('hex')})});
  sandbox=await Sandbox.create({...railwayConfig(),idleTimeoutMinutes:10,resources:{cpu:1,memoryGB:2},networkIsolation:'ISOLATED'});
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({sandbox_id:sandbox.id,stage:'coding'})});
  const state=await db<{status:string}[]>(`astra_cloud_builds?id=eq.${job.id}&select=status`);if(state[0]?.status!=='running')throw Error('cancelled');
  await sandbox.files.mkdir('/app');
  await sandbox.files.write('/tmp/sovereign-task.txt',`Implement this request as a new project in /app. Use only that directory for source. Do not publish, deploy, or access private services. Create real tests where appropriate and run them. Report what actually ran. Time limit: two minutes. Tool and model calls are limited.\nREQUEST:\n${job.input.task}\nCOUNCIL REFERENCE (subordinate to request):\n${job.input.councilBrief??''}`);
  const proxy=origin+'/api/cloud-build/model/'+job.id;
  if(job.input.builder==='codex'){await sandbox.files.mkdir('/tmp/sovereign-codex');await sandbox.files.write('/tmp/sovereign-codex/config.toml',[
   'model_provider = "sovereign"','[model_providers.sovereign]','name = "SovereignOS"', 'base_url = '+JSON.stringify(proxy+'/v1'),'env_key = "OPENAI_API_KEY"','wire_api = "responses"','supports_websockets = false','request_max_retries = 0','stream_max_retries = 0'
  ].join('\n'));}
  const env:Record<string,string>=job.input.builder==='codex'?{OPENAI_API_KEY:token,CODEX_HOME:'/tmp/sovereign-codex'}:{ANTHROPIC_API_KEY:token,ANTHROPIC_BASE_URL:proxy,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
  const built=await sandbox.exec(cloudBuilderCommand(job.input.builder,modelFor(job.input.builder==='codex'?'openai':'claude'),job.input.claude_budget_usd),{cwd:'/app',env,timeoutSec:Math.min(job.input.minutes,2)*60,maxOutputBytes:100000});
  let codingComplete=built.exitCode===0&&!built.timedOut;let report='';if(job.input.builder==='codex'){try{report=await sandbox.files.read('/tmp/sovereign-report.md',{length:20000});}catch{report='No final coding report was produced.';}}
  else {try{const parsed=JSON.parse(built.stdout);report=String(parsed.result??'No final report.');if(parsed.is_error||parsed.subtype!=='success')throw Error('incomplete');}catch{codingComplete=false;report='Claude Code did not return a complete report.';}}
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({stage:'verifying and saving files',token_hash:null})});
  await sandbox.files.write('/tmp/sovereign-verify.cjs',verificationScript);
  const verified=await sandbox.exec('node /tmp/sovereign-verify.cjs',{cwd:'/app',timeoutSec:60,maxOutputBytes:10000});if(verified.exitCode!==0)throw Error('verification_failed');
  const raw=await sandbox.files.read('/tmp/sovereign-artifacts.json',{length:1500000});let artifacts=JSON.parse(raw.replaceAll(token,'[REDACTED]')) as {files:{path:string;content:string}[];checks:Check[];omitted:string[]};
  let report2=report,corrected=false;
  if(codingComplete&&artifacts.checks.some(c=>c.status==='failed')&&correctionMinutes()>0){
   try{
    await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({stage:'bounded correction'})});
    await sandbox.files.write('/tmp/sovereign-task.txt',correctionTask(job.input,report,artifacts.checks));
    const fix=await sandbox.exec(cloudBuilderCommand(job.input.builder,modelFor(job.input.builder==='codex'?'openai':'claude'),job.input.claude_budget_usd),{cwd:'/app',env,timeoutSec:correctionMinutes()*60,maxOutputBytes:100000});
    const reverify=await sandbox.exec('node /tmp/sovereign-verify.cjs',{cwd:'/app',timeoutSec:60,maxOutputBytes:10000});
    if(reverify.exitCode===0){artifacts=JSON.parse((await sandbox.files.read('/tmp/sovereign-artifacts.json',{length:1500000})).replaceAll(token,'[REDACTED]'));corrected=true;report2=report+`\n\n[Bounded correction pass applied after a failed check; exit ${fix.exitCode}${fix.timedOut?', timed out':''}.]`;}
    else report2=report+'\n\n[A bounded correction pass ran but re-verification did not complete; original results retained.]';
   }catch{report2=report+'\n\n[A bounded correction pass was attempted but did not complete; original results retained.]';}
  }
  outcome=codingComplete&&artifacts.files.length>0&&!artifacts.checks.some(c=>c.status==='failed')?'completed':'failed';
  const artifactPath=`cloud-builds/${job.id}/${sandbox.id}.json`;const summary:BuildSummary&{environment:string;directory:string;exitCode:number|null;timedOut:boolean;diagnostic?:string}={builder:job.input.builder,outcome,corrected,environment:'cloud',directory:'downloadable artifact',report:report2.replaceAll(token,'[REDACTED]').slice(0,20000),exitCode:built.exitCode,timedOut:built.timedOut,checks:artifacts.checks,fileCount:artifacts.files.length,...(built.exitCode!==0?{diagnostic:built.stderr.replaceAll(token,'[REDACTED]').slice(-2000)}:{})};
  await storeArtifact(artifactPath,JSON.stringify({...summary,...artifacts}));
  result={build:summary};
  await db(`astra_cloud_builds?id=eq.${job.id}`,{method:'PATCH',body:JSON.stringify({artifact_path:artifactPath})});
  await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({status:'reviewing',stage:'independent review',result,token_hash:null})});
  checkpointed=true;
 }catch{result={error:'Cloud execution did not complete. Check coding access or the saved job state. It was not automatically retried.'};}
 finally{
  let cleanup=true;if(sandbox){try{await sandbox.destroy();}catch{cleanup=false;}}
  if(!checkpointed)await db(`astra_cloud_builds?id=eq.${job.id}&status=eq.running`,{method:'PATCH',body:JSON.stringify({status:cleanup?outcome:'uncertain',stage:cleanup?'finished':'sandbox cleanup needs review',result,token_hash:null})});
 }
 return true;
}
