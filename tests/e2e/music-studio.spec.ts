import {test,expect} from '@playwright/test';
import {defaultStudioConfig,type StudioRun,type StudioConfig} from '../../src/lib/music-studio';
test('dedicated studio collects choices, runs three roles and gates music on validation',async({page})=>{
 let config:StudioConfig=structuredClone(defaultStudioConfig);const runs:StudioRun[]=[];const actions:string[]=[];
 const output={prompt:'A warm lo-fi piano song in A Minor',lyrics:'',rationale:'Matches the brief',protocolChecks:[{requirement:'Preserve wording',implementation:'No words changed'}],limitations:[]};
 await page.route('**/api/music-studio',async r=>{
  if(r.request().method()==='POST'){const b=r.request().postDataJSON();actions.push(b.action);if(b.action==='save')config=b.config;
   if(b.action==='evaluate'){expect(b.brief.genre).toContain('Lo-fi');expect(b.brief.key).toBe('A Minor');runs.push({id:b.id,status:'evaluated',brief:b.brief,config,revision:'revision',protocol_sha256:'fingerprint',evaluation:output});}
   if(b.action==='challenge'){runs[0].status='challenged';runs[0].challenge={assessment:'Checked against QLL',issues:[],revision:output};}
   if(b.action==='validate'){runs[0].status='passed';runs[0].validation={passed:true,issues:[],summary:'Text brief is ready'};}
   if(b.action==='generate')runs[0].job_id='music-job';return r.fulfill({json:{id:b.id||'music-job',revision:'revision'}});
  }
  return r.fulfill({json:{configured:true,config,revision:'revision',runs,setup:null,providers:['openai','claude','perplexity','grok'].map(id=>({id,name:id,model:'fixture',configured:true})),specialists:{configured:true,enabled:true,runnerOnline:true},jobs:[]}});
 });
 await page.goto('/music');await expect(page.getByRole('heading',{name:/Shape the sound/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create model prompt with QLL'})).toBeDisabled();
 await page.getByLabel('Your idea',{exact:true}).fill('Make a gentle piano track');await page.getByRole('button',{name:'Lo-fi',exact:true}).click();await page.getByLabel('Musical key').selectOption('A Minor');
 await expect(page.getByRole('button',{name:'Lo-fi',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('Version',{exact:true}).fill('test-v1');await page.getByLabel('Authoritative QLL protocol',{exact:true}).fill('Test-only protocol: preserve requested wording.');await page.getByRole('button',{name:'Save evaluator & model settings'}).click();
 await page.getByRole('button',{name:'Create model prompt with QLL'}).click();await expect(page.getByRole('button',{name:'Generate validated music'})).toHaveCount(0);
 await page.getByRole('button',{name:'Challenge and refine this prompt'}).click();await page.getByRole('button',{name:'Send to independent validator'}).click();await expect(page.getByRole('heading',{name:'Brief validation passed'})).toBeVisible();
 await page.getByRole('button',{name:'Generate validated music'}).click();expect(actions).toEqual(['save','evaluate','challenge','validate','generate']);
 await page.screenshot({path:'test-results/music-studio-'+test.info().project.name+'.png',fullPage:true});
});
test('allows model registration without falsely advertising an execution adapter',async({page})=>{
 await page.route('**/api/music-studio',r=>r.fulfill({json:{configured:true,config:defaultStudioConfig,revision:null,runs:[],setup:null,providers:[],specialists:{configured:true,enabled:false,runnerOnline:false},jobs:[]}}));
 await page.goto('/music');await page.getByLabel('Model display name',{exact:true}).fill('My experimental music model');await page.getByLabel('Hugging Face model reference',{exact:true}).fill('example/music-model');await page.getByRole('button',{name:'Add model to library'}).click();await expect(page.getByText('Registered · adapter needed',{exact:true})).toBeVisible();await expect(page.getByRole('option',{name:'My experimental music model · prompt preparation only'})).toHaveCount(1);
});
