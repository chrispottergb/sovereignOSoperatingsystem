// Railway cron: */5 * * * *. One invocation, no permanent polling process.
// Only this scoped credential leaves Vercel; no provider or database keys.
const endpoint='https://sovereign-ai-workspace-zeta.vercel.app/api/cloud-worker';
export async function dispatch(env=process.env,request=fetch){
 if(!env.CLOUD_WORKER_SECRET)throw Error('Cloud worker credential is missing.');
 const response=await request(endpoint,{method:'POST',redirect:'error',
  headers:{Authorization:'Bearer '+env.CLOUD_WORKER_SECRET,'Content-Type':'application/json'},
  body:JSON.stringify({action:env.CLOUD_PROBE_ONLY==='true'?'probe':'tick'}),signal:AbortSignal.timeout(270000)});
 if(!response.ok)throw Error('Cloud dispatch failed with HTTP '+response.status+'. No automatic retry.');
 const result=await response.json();
 if(result.ok!==true)throw Error('Cloud dispatcher did not confirm completion.');
 return {ok:true,probe:result.probe===true,dispatched:result.dispatched===true};
}
if(process.env.RAILWAY_SERVICE_ID){
 try{console.log(JSON.stringify(await dispatch()));}catch{console.error('Cloud dispatcher failed; inspect durable status in SovereignOS.');process.exitCode=1;}
}
