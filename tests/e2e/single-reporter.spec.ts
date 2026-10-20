import {test,expect} from '@playwright/test';
test('directed report goes only to requested model then Boss',async({page})=>{
 const calls:{provider:string;reviewPhase:string}[]=[];let extras=0;
 await page.route('**/api/config',r=>r.fulfill({json:{providers:['openai','claude','perplexity','grok','gemini','muse'].map(id=>({id,name:id,configured:['grok','claude'].includes(id),model:'fixture'})),authenticated:true,authRequired:false,demoEnabled:false}}));
 await page.route('**/api/council-context',r=>r.fulfill({json:{evidence:''}}));
 await page.route('**/api/symbiosis',r=>{extras++;return r.fulfill({status:500});});
 await page.route('**/api/generate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({contentType:'text/event-stream',body:[{type:'start',model:'fixture'},{type:'delta',text:input.reviewPhase==='resolve'?'Boss recommends the concrete next step.':'Requested model private report.'},{type:'done',finishReason:'stop',elapsedMs:1}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});});
 await page.goto('/');await page.getByLabel('Your prompt').fill('Grok, report on the project');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Final outcome',exact:true})).toBeVisible();expect(calls.map(c=>c.provider+':'+c.reviewPhase)).toEqual(['grok:research','claude:resolve']);expect(extras).toBe(0);await expect(page.getByText('Requested model private report.',{exact:true})).not.toBeVisible();await expect(page.getByRole('article',{name:'SovereignOS response'})).toContainText('Boss recommends');
});
