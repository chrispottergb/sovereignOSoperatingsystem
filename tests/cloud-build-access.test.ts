import {it,expect,vi,afterEach} from 'vitest';
import {verifyCloudBuildAccess} from '../src/lib/server/cloud-build-access';
afterEach(()=>vi.unstubAllEnvs());
it('does not call Railway without a configured token',async()=>{vi.stubEnv('RAILWAY_BUILD_TOKEN','');const request=vi.fn();expect(await verifyCloudBuildAccess(request)).toMatchObject({configured:false,authorized:false});expect(request).not.toHaveBeenCalled();});
it('verifies a scoped read without leaking credentials or sandbox identifiers',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','private-test-token');const request=vi.fn().mockResolvedValue(Response.json({data:{sandboxes:{edges:[{node:{id:'private-id'}}]}}}));
 expect(await verifyCloudBuildAccess(request)).toEqual({configured:true,authorized:true,reason:'verified'});
 expect(request.mock.calls[0][1].headers['project-access-token']).toBe('private-test-token');
 expect(JSON.parse(request.mock.calls[0][1].body).variables.environmentId).toBe('fb94bbe9-dd34-40d4-9e83-41331b2dd41f');
});
it('never treats a GraphQL permission failure as authorization',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','private-test-token');const request=vi.fn().mockResolvedValue(Response.json({errors:[{message:'Not Authorized'}]}));
 expect(await verifyCloudBuildAccess(request)).toEqual({configured:true,authorized:false,reason:'access_not_verified'});
});
