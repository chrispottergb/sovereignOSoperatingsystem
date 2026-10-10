import {test,expect} from '@playwright/test';
test('one council answer hands off to shared music, retains request IDs and shows saved audio',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{providers:['openai','claude','perplexity','grok'].map(id=>({id,name:id,model:'test',configured:true})),authenticated:true,authRequired:false,demoEnabled:false}}));
 await page.route('**/api/council-context',r=>r.fulfill({json:{evidence:'Music is available through the shared panel.'}}));
 await page.route('**/api/generate',r=>r.fulfill({contentType:'text/event-stream',body:[{type:'start',model:'test',requestId:'r',demo:false},{type:'delta',text:'A gentle instrumental arrangement with piano.'},{type:'done',elapsedMs:1,finishReason:'stop'}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')}));
 const id='12345678-1234-4234-9234-123456789abc';let enabled=false;const jobs:unknown[]=[];const requests:Record<string,unknown>[]=[];
 await page.route('**/api/specialists*',async r=>{
  if(r.request().method()==='POST'){const b=r.request().postDataJSON();if(b.action==='toggle')enabled=b.enabled;if(b.action==='generate_music'){requests.push(b.input);if(!jobs.length)jobs.push({id,status:'completed',stage:'Audio saved',input:b.input,artifact_sha256:'abc',provenance:{model:'test fixture'}});}return r.fulfill({json:{id,ok:true}});}
  return r.fulfill({json:{configured:true,enabled,runnerOnline:true,jobs}});
 });
 await page.goto('/');await page.getByLabel('Your prompt').fill('Compose quiet instrumental piano music');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByText('Create music from this conversation',{exact:true})).toBeVisible();await page.getByText('Create music from this conversation',{exact:true}).click();
 const generate=page.getByRole('button',{name:'Generate music locally',exact:true});await expect(generate).toBeDisabled();
 await page.getByRole('button',{name:'Enable music for all four models'}).click();await expect(generate).toBeEnabled();await generate.click();
 await expect(page.getByRole('link',{name:'Download music'})).toHaveAttribute('href','/api/specialists/audio?id='+id);
 await expect(page.getByText('Music · completed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check / recover this request'}).click();expect(requests).toHaveLength(2);expect(requests[0].requestId).toBe(requests[1].requestId);expect(requests[0].environment).toBe('local');
 await expect(page.getByText('Generation completed. No brain effects, acoustic measurements or therapeutic benefits have been verified.')).toBeVisible();
});
