import {test,expect} from '@playwright/test';
test('redesigned workspace remains usable without horizontal overflow',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Your ambition/})).toBeVisible();
 await page.getByRole('button',{name:'Find the next move'}).click();
 await expect(page.getByLabel('Your prompt')).not.toBeEmpty();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`../../outputs/sovereign-design-${test.info().project.name}.png`,fullPage:true});
 await page.route('**/api/orchestra',r=>r.fulfill({json:{runs:[],connectors:[],cloudBuildsReady:false}}));
 await page.goto('/orchestra');
 await expect(page.getByLabel('Your request')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`../../outputs/orchestra-design-${test.info().project.name}.png`,fullPage:true});
});
