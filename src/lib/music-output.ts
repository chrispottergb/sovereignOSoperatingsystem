import {z} from 'zod';
export const libraryThreshold=90;
export const outputReport=z.object({
 artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
 validator:z.string().trim().min(1).max(100),version:z.string().trim().min(1).max(100),
 structure:z.enum(['met','unmet','unverified']),continuity:z.enum(['met','unmet','unverified']),
 structureEvidence:z.string().trim().min(1).max(2000),continuityEvidence:z.string().trim().min(1).max(2000),
 checks:z.array(z.object({id:z.string().max(30),verdict:z.enum(['met','unmet','unverified']),evidence:z.string().trim().min(1).max(2000)}).strict()).min(1).max(40),
 summary:z.string().trim().min(1).max(3000),
}).strict();
export type OutputReport=z.infer<typeof outputReport>;
export type OutputReview={job_id:string;status:'running'|'approved'|'below_threshold'|'unverifiable'|'failed';score:number|null;artifact_sha256:string;protocol_sha256:string;rubric_sha256:string;report?:OutputReport;error?:string;created_at:string};
export function scoreOutput(raw:unknown,requirements:string[],sha:string){
 const report=outputReport.parse(raw);
 const expected=requirements.map((_,i)=>'qll-'+(i+1));
 if(!expected.length||report.artifactSha256!==sha||report.checks.length!==expected.length||new Set(report.checks.map(c=>c.id)).size!==expected.length||report.checks.some(c=>!expected.includes(c.id)))throw Error('Output evidence does not match the saved artifact and complete rubric.');
 const matched=report.checks.filter(c=>c.verdict==='met').length;
 const score=100*matched/expected.length;
 // Never round a result up into eligibility. Unknown checks stay in the denominator.
 const eligible=matched*100>=expected.length*libraryThreshold&&report.structure==='met'&&report.continuity==='met';
 const status=eligible?'approved':report.structure==='unverified'||report.continuity==='unverified'||report.checks.some(c=>c.verdict==='unverified')?'unverifiable':'below_threshold';
 return {report,score,status} as const;
}
