import {test,expect} from "@playwright/test";
test("one combined answer follows hidden peer review",async({page})=>{
 await page.goto("/");
 await expect(page.getByRole("button",{name:"Send prompt"})).toBeDisabled();
 await page.locator("textarea").first().fill("Build a practical social campaign for a neighborhood bakery.");
 await page.getByRole("button",{name:"Send prompt"}).click();
 await expect(page.getByRole("article",{name:"SovereignOS response"})).toBeVisible({timeout:40000});
 await expect(page.getByRole("article",{name:"OpenAI research brief response"})).not.toBeVisible();
 await expect(page.getByText("Approve proposal & generate final plan")).not.toBeVisible();
 await expect(page.getByText("Final outcome ready",{exact:true})).toBeVisible();
});
