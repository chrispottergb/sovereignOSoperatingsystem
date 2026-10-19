import {it,expect} from "vitest";
import {generateSchema,providerIds} from "../src/lib/contracts";
const members=providerIds.filter(id=>id!=="gemini");const sources=members.map(provider=>({provider,text:"Evidence",citations:[]}));
const base={provider:"claude",mode:"live",kind:"synthesis",reviewPhase:"resolve",prompt:"Create a plan",context:{projectName:"Test",notes:""},sources,critiques:sources,participants:members};
it("five-member final requires explicit opt-in",()=>{expect(generateSchema.safeParse(base).success).toBe(false);expect(generateSchema.safeParse({...base,allowPartialCouncil:true}).success).toBe(true);});
it("rejects substituted or missing reviews",()=>{expect(generateSchema.safeParse({...base,allowPartialCouncil:true,critiques:[...sources.slice(1),{provider:"gemini",text:"Fake",citations:[]}]}).success).toBe(false);expect(generateSchema.safeParse({...base,allowPartialCouncil:true,critiques:sources.slice(1)}).success).toBe(false);});
it("partial reviews still require every other participating model",()=>{expect(generateSchema.safeParse({...base,allowPartialCouncil:true,reviewPhase:"critique",sources:sources.filter(s=>s.provider!=="claude"),critiques:undefined}).success).toBe(true);});
