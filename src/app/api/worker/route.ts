import {after} from "next/server";
import {constantEqual} from "@/lib/server/auth";
import {workerTick} from "@/lib/server/bot-worker";
export const maxDuration=300;
export async function POST(request:Request){
 const secret=process.env.WORKER_SECRET;
 if(!secret||!constantEqual(request.headers.get("authorization")||"",`Bearer ${secret}`))return new Response(null,{status:401});
 after(async()=>{try{await workerTick();}catch{console.error("Bot worker could not complete its tick; durable records preserved.");}});
 return Response.json({accepted:true});
}
