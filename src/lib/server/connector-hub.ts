import "server-only";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {db} from "./astra-store";
import {AppError} from "./errors";
import {connectorInput,type ConnectorRow} from "../bots";
function encryptionKey(){const key=process.env.CONNECTOR_ENCRYPTION_KEY;if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new AppError("CONNECTOR_CONFIG","Connector encryption is not configured.",503);return Buffer.from(key,"hex");}
export function seal(text:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);const data=Buffer.concat([cipher.update(text,"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString("base64url")).join(".");}
export function unseal(text:string){const [iv,tag,data]=text.split(".").map(v=>Buffer.from(v,"base64url"));const cipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8");}
async function remote(url:string,init:RequestInit={}){const r=await fetch(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AppError("CONNECTOR_ACCESS","The platform rejected the connection. Check permissions, account ID and token.",502);return r.json();}
const graph=()=>`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||"v25.0"}`;
async function meta(c:ConnectorRow,path:string){return remote(`${graph()}/${path}`,{headers:{Authorization:`Bearer ${unseal(c.encrypted_credentials!)}`}});}
export async function testConnector(c:ConnectorRow) {
 if(c.provider==="snapshot")return {health:"ready",snapshot:c.config.snapshot||""};
 if(c.provider==="telegram") {
  const token=unseal(c.encrypted_credentials!);if(!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw new AppError("BAD_TOKEN","Invalid Telegram token format.",400);
  const r=await remote(`https://api.telegram.org/bot${token}/getMe`);if(!r.ok)throw new AppError("CONNECTOR_ACCESS","Telegram rejected the token.",502);
  return {health:"ready",botName:r.result.username};
 }
 const r=await meta(c,`${c.config.accountId}?fields=id,name,instagram_business_account`);
 return {health:"ready",accountName:r.name,instagramId:r.instagram_business_account?.id||""};
}
export async function saveConnector(value:unknown){
 const p=connectorInput.safeParse(value);if(!p.success)throw new AppError("VALIDATION","Check the connector fields.",400);const v=p.data;
 if(v.provider!=="snapshot"&&!v.token)throw new AppError("TOKEN_REQUIRED","Enter the platform token in this secure form.",400);
 if(v.provider==="meta"&&!/^\d+$/.test(v.accountId))throw new AppError("ACCOUNT_REQUIRED","Enter the numeric Facebook Page ID.",400);
 if(v.provider==="telegram"&&!/^-?\d+$|^@[A-Za-z0-9_]+$/.test(v.accountId))throw new AppError("ACCOUNT_REQUIRED","Enter a Telegram chat ID or channel username.",400);
 const c={provider:v.provider,label:v.label,enabled:true,permissions:["read",...(v.provider==="telegram"?["send"]:[])],config:{accountId:v.accountId,snapshot:v.snapshot},encrypted_credentials:v.token?seal(v.token):undefined} as ConnectorRow;
 const health=await testConnector(c);c.config={...c.config,...health,checkedAt:new Date().toISOString()};
 const rows=await db<ConnectorRow[]>("astra_connectors",{method:"POST",body:JSON.stringify(c)});return rows[0].id;
}
export async function connectorSnapshot(ids:string[]){
 if(!ids.length)return {status:"No account data selected. Do not invent private metrics."};
 const rows=await db<ConnectorRow[]>(`astra_connectors?id=in.(${ids.join(",")})&enabled=eq.true`);
 const result:Record<string,unknown>={collectedAt:new Date().toISOString()};
 for(const c of rows)try {
  if(c.provider==="snapshot") result[c.id]={label:c.label,source:"Owner-supplied, not independently verified",data:c.config.snapshot};
  else if(c.provider==="meta") {const posts=await meta(c,`${c.config.accountId}/posts?fields=id,message,created_time,permalink_url&limit=10`);const instagram=c.config.instagramId?await meta(c,`${c.config.instagramId}/media?fields=id,caption,timestamp,permalink,like_count,comments_count&limit=10`):null;result[c.id]={label:c.label,posts:posts.data,instagram:instagram?.data,limitations:"Recent content snapshot; not reach, impressions or conversion analytics."};}
  else result[c.id]={label:c.label,status:"Telegram delivery configured; no message history access"};
 }catch{result[c.id]={label:c.label,status:"Unavailable: platform access failed. Do not infer metrics."};}
 for(const id of ids) if(!rows.some(c=>c.id===id))result[id]={status:"Disabled or unavailable"};
 return result;
}
export async function sendTelegram(c:ConnectorRow,text:string){
 if(c.provider!=="telegram"||!c.enabled||!c.permissions.includes("send"))throw new AppError("FORBIDDEN","This connector cannot send messages.",403);
 const result=await remote(`https://api.telegram.org/bot${unseal(c.encrypted_credentials!)}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:c.config.accountId,text})});
 if(!result.ok)throw new AppError("SEND_FAILED","Telegram did not confirm delivery.",502);return {messageId:result.result.message_id};
}
