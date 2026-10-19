import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { auth, assertSameOrigin, readJsonLimited } from "@/lib/server/auth";
import { errorResponse, AppError } from "@/lib/server/errors";
import { storeArtifact, readArtifact } from "@/lib/server/astra-store";
import { bossPlanSchema, normalizeBoss, packetText, type BossPlan } from "@/lib/boss";
export const runtime="nodejs";
const command=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("prepare"),plan:bossPlanSchema}),
 z.object({operation:z.literal("select"),run:z.string().uuid(),selected:z.array(z.number().int().min(1).max(7)).min(1).max(7)}),
 z.object({operation:z.literal("confirm"),run:z.string().uuid(),challenge:z.string().uuid(),confirmation:z.literal("GO")}),
 z.object({operation:z.literal("none"),run:z.string().uuid()}),
 z.object({operation:z.literal("report"),run:z.string().uuid(),report:z.string().min(1).max(20000)}),
]);
type Saved={owner:string;plan:BossPlan;hash:string;createdAt:string};
export async function POST(request:Request){try{
 const principal=await auth.resolve(request);assertSameOrigin(request);const input=command.parse(await readJsonLimited(request));
 if(input.operation==="prepare"){
 const run=randomUUID(),plan=normalizeBoss(input.plan),hash=createHash("sha256").update(JSON.stringify(plan)).digest("hex");
 await storeArtifact(`boss/${principal.id}/${run}/plan.json`,JSON.stringify({owner:principal.id,plan,hash,createdAt:new Date().toISOString()}));return Response.json({run,hash});}
 const saved=await readArtifact<Saved>(`boss/${principal.id}/${input.run}/plan.json`);
 if(saved.owner!==principal.id)throw new AppError("FORBIDDEN","This packet belongs to another owner.",403);
 if(input.operation==="report"){
 if(!/^RUN: .+$/m.test(input.report)||!/^STATUS: (DONE|PARTIAL|BLOCKED|FAILED)\s*$/m.test(input.report)||!["COMPLETED STEPS:","OUTPUTS:","BLOCKERS:","NEXT:"].every(field=>input.report.includes(field))||!input.report.includes(`RUN: ${input.run}/`))throw new AppError("BAD_REPORT","Use the report template with this packet run ID.",400);
 await storeArtifact(`boss/${principal.id}/${input.run}/report-${randomUUID()}.json`,JSON.stringify({report:input.report,status:"reported_unverified",at:new Date().toISOString()}));return Response.json({status:"reported_unverified",notice:"Report saved. Completion is not verified until its evidence is checked."});}
 if(input.operation==="none"){await storeArtifact(`boss/${principal.id}/${input.run}/closed.json`,JSON.stringify({status:"complete_without_action",at:new Date().toISOString()}));return Response.json({status:"complete_without_action"});}
 // Closure is an immutable object. A missing object is permitted; other failures fail closed.
 const {storageSettings}=await import("@/lib/server/astra-store");const {origin,key}=storageSettings();
 const closed=await fetch(`${origin}/storage/v1/object/authenticated/astra-assets/boss/${principal.id}/${input.run}/closed.json`,{headers:{apikey:key,Authorization:`Bearer ${key}`},cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(closed.ok)throw new AppError("CLOSED","This run was closed without action. Prepare a new packet version.",409);
 const missing=await closed.json().catch(()=>({}));
 if(!(closed.status===404||((closed.status===400)&&["NoSuchKey","not_found"].includes(missing.code))))throw new AppError("STORAGE_ERROR","Could not verify the packet status.",502);
 let selected:number[];
 if(input.operation==="confirm"){
 const approval=await readArtifact<{selected:number[];hash:string}>(`boss/${principal.id}/${input.run}/approval-${input.challenge}.json`);
 if(approval.hash!==saved.hash)throw new AppError("STALE_APPROVAL","The packet changed; select it again.",409);selected=approval.selected;
 }else selected=[...new Set(input.selected)];
 const options=selected.map(id=>{const option=saved.plan.options.find(o=>o.id===id);if(!option)throw new AppError("BAD_OPTION","Unknown option.",400);return option;});
 if(input.operation==="select"&&options.some(o=>o.risk>=2)){
 const challenge=randomUUID();await storeArtifact(`boss/${principal.id}/${input.run}/approval-${challenge}.json`,JSON.stringify({selected,hash:saved.hash,at:new Date().toISOString()}));
 return Response.json({status:"awaiting_go",challenge,consequences:options.filter(o=>o.risk>=2).map(o=>`${o.id}: ${o.action}. ${o.risk===3?"Chris only; cannot delegate this action.":"May communicate externally or change an account."}`)});}
 const packets=options.map(o=>({id:o.id,executor:o.executor,blocked:o.needs.length>0,needs:o.needs,text:packetText(o,input.run)}));
 const receipt=input.operation==="confirm"?input.challenge:randomUUID();
 await storeArtifact(`boss/${principal.id}/${input.run}/release-${receipt}.json`,JSON.stringify({hash:saved.hash,selected,status:"released_for_manual_review",packets,at:new Date().toISOString()}));
 return Response.json({status:"released_for_manual_review",packets,hash:saved.hash,notice:"No task was sent or executed. Connections require verification before execution; reports are not proof of completion."});
 }catch(error){return errorResponse(error instanceof z.ZodError?new AppError("BAD_PACKET","The packet is incomplete or invalid. Edit it before release.",400):error);}}
