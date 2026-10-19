import {it,expect} from "vitest";
import {parseBoss,normalizeBoss,bossPlanSchema,packetText,bossProtocol} from "../src/lib/boss";
export const option={id:1,action:"Draft the proposal",executor:"GROK BOT" as const,risk:1,category:"private_draft" as const,needs:[],doneWhen:"Draft exists",packets:[{executor:"GROK BOT" as const,objective:"Write a draft",context:["Private project"],steps:["Write the draft"],inputs:"Exact brief",constraints:[],approvalGates:"Chris selects"}]};
it("keeps a deliverable while hiding incomplete or malformed packets",()=>{expect(parseBoss("Finished answer\n```boss-actions\n{" )).toEqual({deliverable:"Finished answer",plan:null});expect(parseBoss("Answer\n```boss-actions\nwrong\n```" ).plan).toBeNull();});
it("accepts a complete menu and preserves the full input in released packets",()=>{const result=parseBoss("Answer\n```boss-actions\n"+JSON.stringify({options:[option]})+"\n```");expect(result.plan?.options).toHaveLength(1);expect(packetText(option,"run")).toContain("INPUTS PROVIDED: Exact brief");});
it("forces public posts and money to Chris, even if a model assigns low risk",()=>{for(const category of ["money","public_post","legal","family","irreversible"] as const){const normalized=normalizeBoss({options:[{...option,category,risk:0}]}).options[0];expect(normalized.risk).toBe(3);expect(normalized.executor).toBe("CHRIS ONLY");}});
it("requires GO for external messaging even with a low model risk",()=>{expect(normalizeBoss({options:[{...option,category:"external_message",risk:0}]}).options[0].risk).toBe(2);});
it("rejects duplicate numbers and ambiguous BOTH ownership",()=>{expect(bossPlanSchema.safeParse({options:[option,option]}).success).toBe(false);expect(bossPlanSchema.safeParse({options:[{...option,executor:"BOTH"}]}).success).toBe(false);});
it("requires all six contributors and separates Aya from the Muse API",()=>{expect(bossProtocol).toContain("Gemini and Muse");expect(bossProtocol).toContain("NOT the Muse council API");expect(bossProtocol).toContain("Selection is not execution");});

it("normalizes array inputs and assigns Chris-only packets to Chris, preserving referenced source text",()=>{
 const raw={options:[{...option,executor:"CHRIS ONLY",packets:[{...option.packets[0],executor:"MUSE",inputs:["The prompt in PART A"]}]}]};
 const parsed=parseBoss("Complete prompt here\n```boss-actions\n"+JSON.stringify(raw)+"\n```");expect(parsed.plan?.options[0].packets[0].executor).toBe("CHRIS ONLY");expect(parsed.plan?.options[0].packets[0].inputs).toContain("Complete prompt here");
});
it("normalization is idempotent across parse and prepare",()=>{const plan=normalizeBoss({options:[{...option,category:"money"}]});expect(normalizeBoss(plan)).toEqual(plan);});
it("rejects overlong expanded inputs instead of retaining a partially validated plan",()=>{const raw={options:[{...option,packets:[{...option.packets[0],inputs:"See above"}]}]};expect(parseBoss("x".repeat(60000)+"\n```boss-actions\n"+JSON.stringify(raw)+"\n```").plan).toBeNull();});
