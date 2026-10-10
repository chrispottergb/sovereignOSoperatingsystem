import {test,expect} from '@playwright/test';
test('local build uses the chosen writer and cloud cannot be selected',async({page})=>{
 await page.route('**/api/orchestra',route=>route.fulfill({json:{runs:[],connectors:[],cloudBuildsReady:false}}));
 let queued=false;
 await page.route('**/api/local-build',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.builder).toBe('claude-code');expect(body.environment).toBe('local');expect(body.task).toBe('Build a notes app');queued=true;return route.fulfill({json:{id:'test-job'}});}return route.fulfill({json:{jobs:queued?[{id:'test-job',status:'queued',input:{task:'Build a notes app',builder:'claude-code'}}]:[],runners:[{last_seen:new Date().toISOString(),engines:{codex:true,'claude-code':true}}]}});});
 await page.goto('/orchestra');await expect(page.getByText(/Local runner: online/)).toBeVisible();await expect(page.getByLabel('Run in').locator('option[value="cloud"]')).toHaveJSProperty('disabled',true);await page.getByLabel('Your request').fill('Build a notes app');await page.getByLabel('Build with',{exact:true}).selectOption('claude-code');await page.getByRole('button',{name:'Run workflow',exact:true}).click();await expect(page.getByRole('region',{name:'Local build jobs'})).toContainText('Build a notes app');
});
