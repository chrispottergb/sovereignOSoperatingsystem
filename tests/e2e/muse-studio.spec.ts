import {test,expect} from '@playwright/test';
test('Muse options persist, pipeline shares outputs and metrics count actual usage',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{muse:{configured:true},authenticated:true}}));
 const calls: {input:{model:string;reasoning:string;prompt:string}}[]=[];
 await page.route('**/api/muse',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{model:'muse-spark-1.2',text:'Stage result '+calls.length,usage:{inputTokens:20,outputTokens:10},elapsedMs:1000}});});
 await page.goto('/muse');await page.getByLabel('Standard model').selectOption('muse-spark-1.2');await page.getByLabel('Reasoning depth').selectOption('medium');await page.getByLabel('Council routing').selectOption('auto');await page.getByLabel('Enable on-demand task pipeline').check();
 await page.reload();await expect(page.getByLabel('Standard model')).toHaveValue('muse-spark-1.2');await expect(page.getByLabel('Council routing')).toHaveValue('auto');await page.getByRole('combobox',{name:'Workflow',exact:true}).selectOption('pipeline');await page.getByLabel('Your task').fill('Design an offline notes app');await page.getByRole('button',{name:'Run Muse'}).click();
 await expect(page.getByRole('status')).toContainText('Task complete');expect(calls).toHaveLength(3);expect(calls[0].input).toMatchObject({model:'muse-spark-1.2',reasoning:'medium'});expect(calls[1].input.prompt).toContain('Stage result 1');expect(calls[2].input.prompt).toContain('Stage result 2');await expect(page.getByText('3/3',{exact:true})).toBeVisible();await expect(page.getByText('90',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed stage stops pipeline without retry',async({page})=>{
 await page.route('**/api/config',r=>r.fulfill({json:{muse:{configured:true},authenticated:true}}));let count=0;
 await page.route('**/api/muse',r=>{count++;return r.fulfill({status:502,json:{error:{message:'Meta limit reached'}}});});await page.goto('/muse');await page.getByLabel('Enable on-demand task pipeline').check();await page.getByRole('combobox',{name:'Workflow',exact:true}).selectOption('pipeline');await page.getByLabel('Your task').fill('Review a plan');await page.getByRole('button',{name:'Run Muse'}).click();await expect(page.getByRole('status')).toHaveText('Meta limit reached');expect(count).toBe(1);
});
