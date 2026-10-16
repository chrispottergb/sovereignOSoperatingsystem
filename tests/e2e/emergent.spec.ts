import {test,expect} from '@playwright/test';
test('prepares a brief and explicitly queues a shared review without an external build',async({page})=>{
 let reviews=0;const id='00000000-0000-4000-8000-000000000001';
 await page.route('**/api/emergent',async route=>{const input=route.request().postDataJSON();await route.fulfill({json:{id,input,packet:input.task+'\n'+input.councilBrief,status:'prepared',submitted:false}});});
 await page.route('**/api/orchestra',async route=>{reviews++;const body=route.request().postDataJSON();expect(body.input.intent).toBe('writing');expect(body.input.research).toBe(true);expect(body.input.prompt).toContain('DST transitions');await route.fulfill({json:{id}});});
 await page.goto('/emergent');await expect(page.getByText('Direct Emergent connection is not configured.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Run council review',exact:false})).toBeDisabled();
 await page.getByLabel('Original request',{exact:true}).fill('Build a calendar');await page.getByLabel('Acceptance checks').fill('Verify DST transitions');
 await page.getByRole('button',{name:'Save build brief'}).click();await expect(page.getByRole('button',{name:'Copy build brief'})).toBeVisible();
 await page.getByLabel('Build report',{exact:true}).fill('No tests were executed.');await page.getByRole('button',{name:'Run council review',exact:false}).click();
 await expect(page.getByText('Council review queued.',{exact:false})).toBeVisible();expect(reviews).toBe(1);
 await expect(page.getByRole('button',{name:'Run council review',exact:false})).toBeDisabled();
});
