import {test,expect} from '@playwright/test';
test('shows a failed final editor and retries only that stage',async({page})=>{
 const ids=['openai','claude','perplexity','grok','gemini','muse'];let finals=0;const phases:string[]=[];
 await page.route('**/api/config',r=>r.fulfill({json:{providers:ids.map(id=>({id,name:id,configured:true,model:'fixture'})),authenticated:true,authRequired:false,demoEnabled:false}}));
 await page.route('**/api/council-context',r=>r.fulfill({json:{evidence:'Shared evidence'}}));
 await page.route('**/api/generate',r=>{const input=r.request().postDataJSON();phases.push(input.reviewPhase);if(input.reviewPhase==='resolve'&&++finals===1)return r.fulfill({status:502,json:{error:{message:'Final editor connection interrupted'}}});return r.fulfill({contentType:'text/event-stream',body:[{type:'start',model:'fixture',requestId:'test',demo:false},{type:'delta',text:input.reviewPhase==='resolve'?'Use the verified plan. First, implement the parser.':'A usable contribution'},{type:'done',finishReason:'stop',elapsedMs:1}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});});
 await page.route('**/api/boss/repair',r=>r.fulfill({json:{plan:{options:[]}}}));
 await page.goto('/');await page.getByLabel('Auto specialist orchestration').uncheck();await page.getByLabel('API spending').selectOption('economy');await page.getByLabel('Your prompt').fill('Design a parser');await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Final outcome needs attention'})).toBeVisible();await expect(page.getByRole('article',{name:'SovereignOS response'})).toContainText('Final editor connection interrupted');expect(phases).toHaveLength(13);
 await page.getByRole('button',{name:'Continue with saved work'}).click();await expect(page.getByRole('heading',{name:'Final outcome',exact:true})).toBeVisible();await expect(page.getByRole('article',{name:'SovereignOS response'})).toContainText('First, implement the parser');expect(phases).toHaveLength(14);expect(finals).toBe(2);await page.getByRole('button',{name:'Repair action menu · one paid model call'}).click();await expect(page.getByText('No execution is needed for this answer.')).toBeVisible();expect(phases).toHaveLength(14);await expect(page.getByRole('link',{name:'Jump to final outcome'})).toBeVisible();
});

