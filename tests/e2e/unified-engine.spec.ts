import {test,expect} from '@playwright/test';
test('saved cooperative work survives reload, shows one final and holds execution for an exact approval',async({page})=>{
 let launches=0,executes=0,completed=false;
 const id='bd55cc33-e412-45b4-9148-fbd0c4d9a49a';
 const run={id,owner:'owner',input:{clientId:id,request:'Build a practical parser',context:'',editor:'claude',depth:'economy',maxCalls:14,maxInputCharacters:320000,projectId:'personal'},state:{version:1,eligible:['grok','claude','openai'],phase:'report',records:[],reviews:[],round:1,calls:2,inputCharacters:3000,warnings:[]},status:'queued',created_at:new Date().toISOString()};
 await page.route('**/api/config',r=>r.fulfill({json:{engine:{enabled:true,dailyCalls:64},huggingface:{configured:true},providers:['openai','claude','perplexity','grok','gemini','muse'].map(id=>({id,name:id,configured:true,model:'fixture'})),authenticated:true,authRequired:false,demoEnabled:false}}));
 await page.route('**/api/engine*',async r=>{
  if(r.request().url().includes('engine-actions')){const body=r.request().postDataJSON();if(body.action==='execute')executes++;return r.fulfill({json:{action:{id,kind:'save_artifact',status:body.action==='execute'?'completed':'prepared',payload:{final:'Concrete parser implementation and next choices'},content_hash:'a'.repeat(64),expires_at:new Date(Date.now()+60000).toISOString(),receipt:{savedAt:new Date().toISOString()}}}});}
  if(r.request().method()==='POST'){const body=r.request().postDataJSON();if(body.action==='launch'){launches++;run.input=body.input;}return r.fulfill({json:{run}});}
  const snapshot=completed?{...run,status:'complete',state:{...run.state,phase:'done',agreement:'accepted',final:'Concrete parser implementation and next choices.\n\nReview: Astra and Fable accepted this same revision.'}}:run;
  return r.fulfill({json:r.request().url().includes('?id=')?{run:snapshot}:{runs:[snapshot]}});
 });
 await page.goto('/');await page.getByLabel('Your prompt').fill('Build a practical parser');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByText('Saved engine · routing, reviews & execution choices',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('sovereign-os.workspace.v1')||'')).toContain('engineRunId');
 completed=true;await page.reload();await page.getByText('Saved engine runs',{exact:true}).click();await page.getByRole('button',{name:'Build a practical parser · complete',exact:true}).click();await expect(page.getByRole('heading',{name:'Final outcome',exact:true})).toBeVisible();await expect(page.getByRole('article',{name:'SovereignOS response'})).toContainText('Concrete parser implementation');expect(launches).toBe(1);expect(executes).toBe(0);
 await page.getByText('Saved engine · routing, reviews & execution choices',{exact:true}).click();await page.getByRole('button',{name:'Prepare saved artifact',exact:true}).click();await expect(page.getByRole('region',{name:'Exact action approval'})).toContainText('Concrete parser implementation');expect(executes).toBe(0);
 await page.getByRole('button',{name:'Approve this exact action',exact:true}).click();await expect(page.getByRole('link',{name:'Download saved outcome'})).toBeVisible();expect(executes).toBe(1);
});
