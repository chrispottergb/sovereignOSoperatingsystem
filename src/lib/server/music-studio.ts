import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {db,storageReady} from './astra-store';
import {AppError} from './errors';
import {completion} from './model-completion';
import {providerConfig} from './config';
import {queueMusic} from './specialists';
import {defaultStudioConfig,studioConfig,musicBrief,evaluationOutput,challengeOutput,validationOutput,evaluatorPrompt,challengerPrompt,validatorPrompt,decodeModelJson,type StudioConfig,type StudioRun} from '../music-studio';
export async function musicStudioState(){
 if(!storageReady())return {configured:false,config:defaultStudioConfig,revision:null,runs:[],setup:'Music Studio needs the Supabase migrations before settings can be saved.'};
 try{const [rows,runs]=await Promise.all([db<{config:StudioConfig;revision:string}[]>('astra_music_config?id=eq.main'),db<StudioRun[]>('astra_music_runs?order=created_at.desc&limit=15')]);return {configured:true,config:rows[0]?.config||defaultStudioConfig,revision:rows[0]?.revision||null,runs,setup:null};}
 catch{return {configured:false,config:defaultStudioConfig,revision:null,runs:[],setup:'Music Studio storage is unavailable. Apply the music studio migration and check connectivity.'};}
}
export async function saveMusicConfig(raw:unknown){const parsed=studioConfig.safeParse(raw);if(!parsed.success)throw new AppError('VALIDATION',parsed.error.issues[0]?.message||'Invalid studio settings.',400);const revision=randomUUID();await db('astra_music_config?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',config:parsed.data,revision,updated_at:new Date().toISOString()})});return {revision};}
async function configForEvaluation(){const [row]=await db<{config:StudioConfig;revision:string}[]>('astra_music_config?id=eq.main');if(!row)throw new AppError('PROTOCOL_REQUIRED','Save the authoritative QLL protocol and version first.',409);const config=studioConfig.parse(row.config);if(!config.protocolText.trim()||!config.protocolVersion.trim())throw new AppError('PROTOCOL_REQUIRED','QLL protocol text and a version are required. No substitute protocol is supplied.',409);return {...row,config};}
function available(provider:string){if(!providerConfig().some(p=>p.id===provider&&p.configured))throw new AppError('PROVIDER_UNAVAILABLE','The selected evaluator or validator is not configured on this server.',409);}
export async function evaluateMusic(id:string,raw:unknown,signal:AbortSignal){
 const brief=musicBrief.parse(raw),{config,revision}=await configForEvaluation();
 if(!config.targets.some(t=>t.id===brief.targetId))throw new AppError('MODEL_REQUIRED','Select a registered music model.',400);
 available(config.evaluator);available(config.challenger);available(config.validator);
 const reserved=await db<StudioRun[]>('astra_music_runs?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id,status:'evaluating',brief,config,revision,protocol_sha256:createHash('sha256').update(config.protocolText).digest('hex')})});
 if(!reserved.length){const [old]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}`);if(!old||old.revision!==revision||JSON.stringify(musicBrief.parse(old.brief))!==JSON.stringify(brief))throw new AppError('REQUEST_CONFLICT','This request ID belongs to another brief or protocol version.',409);return old;}
 try{const result=await completion(signal)(config.evaluator,evaluatorPrompt(config,brief),'answer');const evaluation=evaluationOutput.parse(decodeModelJson(result.response));const [saved]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}&status=eq.evaluating`,{method:'PATCH',body:JSON.stringify({status:'evaluated',evaluation,usage:{evaluator:{model:result.model,tokens:result.tokens}}})});return saved;}
 catch{await db(`astra_music_runs?id=eq.${id}&status=eq.evaluating`,{method:'PATCH',body:JSON.stringify({status:'failed',error:'Evaluation was not completed or its structured output was invalid. No generation was started.'})});throw new AppError('EVALUATION_FAILED','Evaluation was not confirmed. Check the saved run before trying a new request.',502);}
}
export async function challengeMusic(id:string,signal:AbortSignal){
 const [run]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}`);if(!run?.evaluation)throw new AppError('EVALUATION_REQUIRED','Complete evaluation first.',409);
 if(run.status!=='evaluated')return run;
 const current=await configForEvaluation();if(run.revision!==current.revision)throw new AppError('STALE_PROTOCOL','Settings changed. Evaluate a fresh brief.',409);
 available(run.config.challenger);
 const claim=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}&status=eq.evaluated`,{method:'PATCH',body:JSON.stringify({status:'challenging'})});if(!claim.length)throw new AppError('ALREADY_CHALLENGING','Challenge is already underway.',409);
 try{const result=await completion(signal)(run.config.challenger,challengerPrompt(run.config,run.brief,run.evaluation),'revise');const challenge=challengeOutput.parse(decodeModelJson(result.response));const [saved]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}&status=eq.challenging`,{method:'PATCH',body:JSON.stringify({status:'challenged',challenge,usage:{...(run.usage as object||{}),challenger:{model:result.model,tokens:result.tokens}}})});return saved;}
 catch{await db(`astra_music_runs?id=eq.${id}&status=eq.challenging`,{method:'PATCH',body:JSON.stringify({status:'failed',error:'The challenger did not return a complete valid revision. No generation was started.'})});throw new AppError('CHALLENGE_FAILED','Challenge was not confirmed. Check the saved run before starting another.',502);}
}
export async function validateMusic(id:string,signal:AbortSignal){
 const [run]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}`);if(!run?.evaluation||!run.challenge)throw new AppError('CHALLENGE_REQUIRED','Complete the evaluator and challenger stages first.',409);
 if(run.status!=='challenged')return run;
 const current=await configForEvaluation();if(run.revision!==current.revision)throw new AppError('STALE_PROTOCOL','Settings changed. Evaluate a new brief before validation.',409);
 available(run.config.validator);
 const claim=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}&status=eq.challenged`,{method:'PATCH',body:JSON.stringify({status:'validating'})});if(!claim.length)throw new AppError('ALREADY_VALIDATING','Validation is already underway.',409);
 try{const result=await completion(signal)(run.config.validator,validatorPrompt(run.config,run.brief,run.evaluation,run.challenge),'review');const validation=validationOutput.parse(decodeModelJson(result.response));const [saved]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}&status=eq.validating`,{method:'PATCH',body:JSON.stringify({status:validation.passed?'passed':'rejected',validation,usage:{...(run.usage as object||{}),validator:{model:result.model,tokens:result.tokens}}})});return saved;}
 catch{await db(`astra_music_runs?id=eq.${id}&status=eq.validating`,{method:'PATCH',body:JSON.stringify({status:'failed',error:'Validation failed or returned invalid structured output. No generation was started.'})});throw new AppError('VALIDATION_FAILED','Validation was not confirmed. No music generation was started.',502);}
}
export async function generateValidatedMusic(id:string){
 const [run]=await db<StudioRun[]>(`astra_music_runs?id=eq.${id}`);
 if(!run||run.status!=='passed'||!run.validation?.passed||!run.evaluation||!run.challenge)throw new AppError('VALIDATION_REQUIRED','This brief has not passed all three review stages.',409);
 const current=await configForEvaluation();if(run.revision!==current.revision)throw new AppError('STALE_PROTOCOL','Studio settings changed. Evaluate and validate a fresh brief.',409);
 if(run.brief.targetId!=='ace-step-1.5')throw new AppError('ADAPTER_REQUIRED','This model is registered for prompt preparation; its generation adapter is not connected yet.',409);
 const job=await queueMusic({requestId:run.id,sourceTurnId:run.id,evaluationId:run.id,prompt:run.challenge.revision.prompt,lyrics:run.challenge.revision.lyrics,seconds:run.brief.seconds,bpm:run.brief.bpm,seed:run.brief.seed,keyScale:run.brief.key==='Auto'?'':run.brief.key,environment:'local'});
 await db(`astra_music_runs?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({job_id:job.id})});return job;
}
