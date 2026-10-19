import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { storageSettings,storeArtifact,readArtifact } from "./astra-store";
import { AppError } from "./errors";
export const connectionSchema=z.object({executor:z.enum(["MUSE","GROK BOT"]),service:z.string().trim().min(1).max(100),status:z.enum(["CONNECTED","NOT CONNECTED","UNKNOWN"]),scope:z.string().max(200),account:z.string().max(200),notes:z.string().max(1000)});
export type Connection=z.infer<typeof connectionSchema>&{source:"Chris-reported";updatedAt:string;verifiedAt:null};
export async function connections(owner:string){
 const {origin,key}=storageSettings();const r=await fetch(`${origin}/storage/v1/object/list/astra-assets`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({prefix:`boss/${owner}/registry`,limit:100,sortBy:{column:"name",order:"desc"}}),cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new AppError("STORAGE_ERROR","Connection registry could not be read.",502);
 const rows=await r.json() as {name:string}[];const latest=new Map<string,Connection>();
 const files=rows.filter(row=>/^[0-9]+-[a-f0-9-]+\.json$/.test(row.name));
 const entries=await Promise.all(files.map(row=>readArtifact<Connection>(`boss/${owner}/registry/${row.name}`)));
 for(const entry of entries){const id=`${entry.executor}:${entry.service.toLowerCase()}`;if(!latest.has(id))latest.set(id,entry);}

 return [...latest.values()];
}
export async function recordConnection(owner:string,input:unknown){const entry={...connectionSchema.parse(input),source:"Chris-reported" as const,updatedAt:new Date().toISOString(),verifiedAt:null};await storeArtifact(`boss/${owner}/registry/${Date.now()}-${randomUUID()}.json`,JSON.stringify(entry));return entry;}
