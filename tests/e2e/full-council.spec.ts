import {test,expect} from '@playwright/test';
test('full council shares evidence, corrects four answers and hands the final deliverable to the chosen local builder',async({page})=>{
 const calls:{provider:string;reviewPhase:string;sharedEvidence:string;sources?:{provider:string}[];critiques?:unknown[];revisions?:unknown[]}[]=[];
 await page.route('**/api/config',r=>r.fulfill({json:{providers:['openai','claude','perplexity','grok'].map(id=>({id,name:id,model:'test-model',configured:true})),authenticated:true,authRequired:false,demoEnabled:false}}));
 let snapshots=0;await page.route('**/api/council-context',r=>{snapshots++;return r.fulfill({json:{evidence:'Shared project snapshot'}});});
 await page.route('**/api/generate',r=>{const input=r.request().postDataJSON();calls.push(input);const text=input.reviewPhase==='resolve'?'Complete corroborated code deliverable':'Contribution '+input.provider;return r.fulfill({contentType:'text/event-stream',body:[{type:'start',model:'test',requestId:'r',demo:false},{type:'delta',text},{type:'done',elapsedMs:1,finishReason:'stop'}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});});
 await page.route('**/api/local-build',r=>{if(r.request().method()==='POST'){const v=r.request().postDataJSON();expect(v.councilBrief).toBe('Complete corroborated code deliverable');expect(v.builder).toBe('claude-code');expect(v.environment).toBe('local');expect(v.synthesizer).toBe('openai');return r.fulfill({json:{id:'job1'}});}return r.fulfill({json:{jobs:[{id:'job1',status:'queued'}]}});});
 await page.goto('/');await page.getByLabel('Final editor').selectOption('openai');await page.getByLabel('Your prompt').fill('Build a working notes app');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByRole('article',{name:'SovereignOS response'})).toContainText('Complete corroborated code deliverable');
 expect(snapshots).toBe(1);expect(calls).toHaveLength(13);expect(calls.every(c=>c.sharedEvidence==='Shared project snapshot')).toBe(true);
 for(const c of calls.filter(c=>c.reviewPhase==='critique')){expect(c.sources).toHaveLength(3);expect(c.sources!.some(s=>s.provider===c.provider)).toBe(false);}
 for(const c of calls.filter(c=>c.reviewPhase==='refine')){expect(c.sources).toHaveLength(4);expect(c.critiques).toHaveLength(4);}
 expect(calls.at(-1)).toMatchObject({provider:'openai',reviewPhase:'resolve'});expect(calls.at(-1)!.revisions).toHaveLength(4);
 await page.getByText('Build this result with Codex or Claude Code',{exact:true}).click();await page.getByRole('button',{name:'Build locally from this answer'}).click();await expect(page.getByText('queued · queued',{exact:true})).toBeVisible();
});
