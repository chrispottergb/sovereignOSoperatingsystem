import {test,expect} from '@playwright/test';
test('recovers a failed Gemini without repeating five completed answers',async({page})=>{
 const ids=['openai','claude','perplexity','grok','gemini','muse'];let finals=0;const phases:string[]=[];
 await page.route('**/api/config',r=>r.fulfill({json:{providers:ids.map(id=>({id,name:id,configured:true,model:'fixture'})),authenticated:true,authRequired:false,demoEnabled:false}}));
 await page.route('**/api/council-context',r=>r.fulfill({json:{evidence:'Shared evidence'}}));
 await page.route('**/api/generate',r=>{const input=r.request().postDataJSON();phases.push(input.reviewPhase);if(input.provider==='gemini')return r.fulfill({status:502,json:{error:{message:'Gemini unavailable'}}});return r.fulfill({contentType:'text/event-stream',body:[{type:'start',model:'fixture',requestId:'test',demo:false},{type:'delta',text:input.reviewPhase==='resolve'?'Use the verified plan. First, implement the parser.':'A usable contribution'},{type:'done',finishReason:'stop',elapsedMs:1}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});});
 await page.goto('/');await page.getByLabel('Auto specialist orchestration').uncheck();await page.getByLabel('API spending').selectOption('economy');await page.getByLabel('Your prompt').fill('Design a parser');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByText(/Paused before cross-review: Gemini/)).toBeVisible();expect(phases).toHaveLength(6);
 await page.getByRole('button',{name:'Finish with 5 available models — omit unavailable models'}).click();
 await expect(page.getByRole('heading',{name:'Final outcome',exact:true})).toBeVisible();await expect(page.getByText(/not a full six-model result/)).toBeVisible();expect(phases).toHaveLength(12);
});
