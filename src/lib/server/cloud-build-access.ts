import 'server-only';
// Read-only probe: fixed project environment, no allocation and no secret output.
export async function verifyCloudBuildAccess(request:typeof fetch=fetch){
 const token=process.env.RAILWAY_BUILD_TOKEN?.trim();
 if(!token)return {configured:false,authorized:false,reason:'missing_token'};
 try{
  const response=await request('https://backboard.railway.com/graphql/v2',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'Content-Type':'application/json','project-access-token':token},
   body:JSON.stringify({query:'query($environmentId: String!) { sandboxes(environmentId: $environmentId, first: 1) { edges { node { id } } } }',variables:{environmentId:'fb94bbe9-dd34-40d4-9e83-41331b2dd41f'}}),
  });
  const data=await response.json();
  const authorized=response.ok&&!data.errors&&Array.isArray(data.data?.sandboxes?.edges);
  return {configured:true,authorized,reason:authorized?'verified':'access_not_verified'};
 }catch{return {configured:true,authorized:false,reason:'connection_failed'};}
}
