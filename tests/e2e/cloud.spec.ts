import {test,expect} from '@playwright/test';
test('shows truthful cloud readiness and allows pausing dispatch without enabling builds',async({page})=>{
 let enabled=true;
 await page.route('**/api/cloud-worker',async route=>{
  if(route.request().method()==='POST'){enabled=route.request().postDataJSON().enabled;await route.fulfill({json:{ok:true}});return;}
  await route.fulfill({json:{configured:true,enabled,online:true,lastSeen:new Date().toISOString(),dailySteps:24,stepsReservedToday:1,dispatches:[]}});
 });
 await page.goto('/cloud');
 await expect(page.getByRole('heading',{name:'Cloud execution',exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toContainText('Worker checked in');
 await expect(page.getByRole('heading',{name:'Cloud code builds · setup required'})).toBeVisible();
 await page.getByRole('button',{name:'Pause background execution'}).click();
 await expect(page.getByRole('status')).toContainText('Paused');
 await expect(page.getByRole('button',{name:'Enable background execution'})).toBeVisible();
});
test('queues a cloud build with the selected coding engine when configured',async({page})=>{
 await page.route('**/api/orchestra',route=>route.fulfill({json:{runs:[],connectors:[],cloudBuildsReady:true}}));
 let submitted:Record<string,unknown>|undefined;
 await page.route('**/api/local-build',async route=>{
  if(route.request().method()==='POST'){submitted=route.request().postDataJSON();await route.fulfill({json:{id:'12345678-1234-4234-9234-123456789abc'}});return;}
  await route.fulfill({json:{jobs:[],runners:[],cloudEnabled:true}});
 });
 await page.goto('/orchestra');await page.getByLabel('Your request').fill('Build a calculator with tests');
 await page.getByLabel('Task',{exact:true}).selectOption('build');
 await page.getByLabel('Build with',{exact:true}).selectOption('claude-code');
 await page.getByLabel('Run in',{exact:true}).selectOption('cloud');
 await page.getByRole('button',{name:'Run workflow',exact:true}).click();
 await expect.poll(()=>submitted?.environment).toBe('cloud');expect(submitted?.builder).toBe('claude-code');
});
