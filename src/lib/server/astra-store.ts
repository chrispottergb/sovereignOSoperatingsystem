import "server-only";
import { AppError } from "./errors";

export function storageReady() { return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
export function storageSettings() {
  if (!storageReady()) throw new AppError("STORAGE_NOT_CONFIGURED", "Cloud storage is awaiting Supabase setup.", 503);
  const url = new URL(process.env.SUPABASE_URL!);
  if(url.protocol !== "https:") throw new AppError("STORAGE_CONFIG", "Cloud storage configuration is invalid.", 503);
  return { origin: url.origin, key: process.env.SUPABASE_SERVICE_ROLE_KEY! };
}
export async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {origin,key} = storageSettings();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    ...init, cache:"no-store", signal: init.signal ?? AbortSignal.timeout(20000),
    headers: { apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json", Prefer:"return=representation", ...init.headers },
  });
  if(!response.ok) throw new AppError("STORAGE_ERROR", "Cloud storage could not complete this operation.", 502);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
export async function storeArtifact(path:string, text:string) {
  const {origin,key} = storageSettings();
  if(!/^[a-zA-Z0-9_/-]+\.json$/.test(path) || path.includes("..")) throw new AppError("BAD_PATH","Invalid artifact path.",400);
  const response = await fetch(`${origin}/storage/v1/object/astra-assets/${path}`, {
    method:"POST", headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","x-upsert":"false"},
    body:text, signal:AbortSignal.timeout(20000),
  });
  if(!response.ok) throw new AppError("STORAGE_ERROR","The full result could not be saved. This step needs review.",502);
}
export async function readArtifact<T>(path:string):Promise<T> {
 const {origin,key}=storageSettings();
 if(!/^[a-zA-Z0-9_/-]+\.json$/.test(path)||path.includes("..")) throw new AppError("BAD_PATH","Invalid artifact path.",400);
 const r=await fetch(`${origin}/storage/v1/object/authenticated/astra-assets/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},cache:"no-store",signal:AbortSignal.timeout(20000)});
 if(!r.ok) throw new AppError("STORAGE_ERROR","Saved result could not be read.",502);
 return r.json();
}
