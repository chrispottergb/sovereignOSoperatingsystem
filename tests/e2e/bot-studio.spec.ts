import {test,expect} from "@playwright/test";
test("studio shows paused launch controls and secure connector setup",async({page})=>{
 const bots=[{id:"00000000-0000-4000-8000-000000000001",name:"Campaign helper",enabled:false,next_run_at:null,config:{name:"Campaign helper",purpose:"Draft a useful campaign",voice:"Clear",intervalHours:24,connectorIds:[],maxCalls:6,maxReportedTokens:60000}}];
 await page.route("**/api/studio",route=>route.fulfill({json:{configured:true,bots,runs:[],connectors:[],approvals:[],health:[{last_seen:new Date().toISOString()}]}}));
 await page.goto("/studio");
 await expect(page.getByText("Schedule paused",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Preview launch"}).click();
 await expect(page.getByRole("dialog",{name:"Launch preview"})).toContainText("No posts or messages will be sent");
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await page.getByRole("button",{name:"Connectors",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Master connector hub"})).toBeVisible();
 await page.getByLabel("Connection type").selectOption("meta");
 await expect(page.getByLabel("Page access token")).toHaveAttribute("type","password");
 await expect(page.getByText("Publishing is not enabled for Meta in this release.",{exact:false})).toBeVisible();
});
