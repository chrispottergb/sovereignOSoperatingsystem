import {describe,it,expect} from "vitest";
import {orchestraInput,orchestraPlan,classify} from "../src/lib/orchestra/plan";
const input=(builder:"codex"|"claude-code")=>orchestraInput.parse({prompt:"Build a scheduling app",builder,requestId:"00000000-0000-4000-8000-000000000001"});
describe("orchestra task hierarchy",()=>{
 it("honors the chosen coding engine and uses another provider to review",()=>{for(const builder of ["codex","claude-code"] as const){const {intent,steps}=orchestraPlan(input(builder));expect(intent).toBe("build");const build=steps.find(s=>s.id==="build")!;expect(build.executor).toBe(builder);expect(steps.find(s=>s.id==="independent-review")?.provider).not.toBe(build.provider);expect(steps.find(s=>s.id==="resolution")?.provider).toBe("openai");expect(steps.at(-1)?.provider).toBe("claude");}});
 it("does not dispatch code execution for a writing task",()=>{const plan=orchestraPlan({...input("codex"),intent:"writing"});expect(plan.steps.some(s=>s.executor)).toBe(false);});
 it("keeps explicit intent above inferred intent",()=>{expect(orchestraPlan({...input("codex"),intent:"research"}).intent).toBe("research");expect(classify("Write a launch campaign")).toBe("campaign");});
 it("enforces a dependency graph with no forward edges",()=>{for(const builder of ["codex","claude-code"] as const){const seen=new Set<string>();for(const s of orchestraPlan(input(builder)).steps){expect(seen.has(s.id)).toBe(false);for(const d of s.depends)expect(seen.has(d)).toBe(true);seen.add(s.id);}}});
 it("rejects arbitrary repository hosts and credentials",()=>{for(const repository of ["http://localhost/repo","https://user:token@github.com/a/b","https://github.com/a/b?token=secret","https://evil.test/a/b"]){expect(orchestraInput.safeParse({...input("codex"),repository}).success).toBe(false);}});
 it("bounds execution time and lets the owner skip unnecessary research",()=>{expect(orchestraInput.safeParse({...input("codex"),buildMinutes:999}).success).toBe(false);expect(orchestraPlan({...input("codex"),research:false}).steps.some(s=>s.id==="evidence")).toBe(false);});
});
