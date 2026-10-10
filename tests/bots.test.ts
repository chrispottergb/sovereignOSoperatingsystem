import {beforeEach,it,expect,vi} from "vitest";
import {botConfig,botPlan,connectorInput} from "../src/lib/bots";
import {seal,unseal} from "../src/lib/server/connector-hub";
beforeEach(()=>{vi.stubEnv("CONNECTOR_ENCRYPTION_KEY","a".repeat(64));});
it("routes Grok work through Astra resolution before Claude final review",()=>{
 const steps=botPlan();expect(steps.find(s=>s.id==="draft")?.provider).toBe("grok");
 expect(steps.find(s=>s.id==="resolution")?.provider).toBe("openai");
 expect(steps.at(-1)?.provider).toBe("claude");expect(steps.at(-1)?.depends).toContain("resolution");
});
it("independent reviewers do not see each other's reviews",()=>{
 for(const s of botPlan().filter(s=>s.stage==="critique"))expect(s.depends).toEqual(["evidence","draft"]);
});
it("rejects unbounded schedules, budgets and arbitrary connector types",()=>{
 expect(botConfig.safeParse({name:"x",purpose:"research",intervalHours:0}).success).toBe(false);
 expect(botConfig.safeParse({name:"x",purpose:"research",maxCalls:100}).success).toBe(false);
 expect(connectorInput.safeParse({provider:"http://localhost",label:"x"}).success).toBe(false);
});
it("stores credentials encrypted and rejects tampered ciphertext",()=>{
 const ciphertext=seal("test-token");expect(ciphertext).not.toContain("test-token");expect(unseal(ciphertext)).toBe("test-token");
 const parts=ciphertext.split(".");parts[1]=Buffer.alloc(16).toString("base64url");expect(()=>unseal(parts.join("."))).toThrow();
});
