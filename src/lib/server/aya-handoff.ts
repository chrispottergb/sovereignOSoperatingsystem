import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ayaInput,ayaBody} from '../aya-handoff';
import {AppError} from './errors';
export async function handoffToAya(raw:unknown,send:typeof fetch=fetch){
 const input=ayaInput.parse(raw),key=process.env.RESEND_API_KEY?.trim(),from=process.env.AYA_FROM_EMAIL?.trim();
 if(!key||!from||!z.string().email().safeParse(from).success)throw new AppError('AYA_CONFIG','Configure RESEND_API_KEY and AYA_FROM_EMAIL before sending.',503);
 let response:Response;
 try{response=await send('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({from,to:['drpotterbeatz@gmail.com'],reply_to:'drpotterbeatz@gmail.com',subject:'[FOR AYA] '+input.task_name,text:ayaBody(input)})});}
 catch{throw new AppError('AYA_SEND_UNCERTAIN','Email submission is uncertain. Check Resend and the inbox before another call; no automatic retry was made.',502);}
 if(!response.ok){await response.body?.cancel();throw new AppError('AYA_SEND_REJECTED',response.status===403?'Resend rejected the sender or recipient. The resend.dev test sender can only email the Resend account owner; otherwise verify a sender domain.':'Resend rejected the email (HTTP '+response.status+'). No automatic retry was made.',502);}
 let data:unknown;try{data=await response.json();}catch{throw new AppError('AYA_SEND_UNCERTAIN','Resend returned an unreadable confirmation. Check the inbox before retrying.',502);}
 if(!z.object({id:z.string().min(1)}).safeParse(data).success)throw new AppError('AYA_SEND_UNCERTAIN','Resend did not return an email identifier. Check the inbox before retrying.',502);
 return {status:'submitted' as const};
}
