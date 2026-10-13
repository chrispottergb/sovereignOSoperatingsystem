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
