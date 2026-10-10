import { describe,it,expect } from "vitest";
import { laneIds,planWorkflow } from "../src/lib/astra";
describe("Astra workflow isolation",()=>{
 it("all workflows have unique steps and only depend on prior steps",()=>{
  for(const lane of laneIds) for(const depth of ["quick","standard","deep"] as const) {
   const seen=new Set<string>();
   for(const step of planWorkflow(lane,depth)) {
    expect(seen.has(step.id)).toBe(false);
    for(const dep of step.depends) expect(seen.has(dep)).toBe(true);
    seen.add(step.id);
   }
  }
 });
 it("decision drafts cannot see peer drafts",()=>{
  const steps=planWorkflow("decision","standard");
  for(const step of steps.filter(s=>s.stage==="draft")) {
   for(const id of step.depends) expect(steps.find(s=>s.id===id)?.stage).toBe("ground");
  }
 });
 it("assigns synthesis to Claude and final red-team audit to OpenAI",()=>{
  const steps=planWorkflow("decision","deep");
  expect(steps.find(s=>s.id==="synthesis")?.provider).toBe("claude");
  expect(steps.filter(s=>s.stage==="audit").every(s=>s.provider==="openai")).toBe(true);
  expect(steps.filter(s=>s.stage==="revision")).toHaveLength(1);
 });
 it("never assigns a peer critique to its draft author",()=>{
  const steps=planWorkflow("decision","standard");
  for(const step of steps.filter(s=>s.stage==="critique")) {
   for(const id of step.depends) expect(steps.find(s=>s.id===id)?.provider).not.toBe(step.provider);
  }
 });
});
