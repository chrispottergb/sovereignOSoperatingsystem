import {z} from 'zod';
export const attachmentTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',mp3:'audio/mpeg',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json'} as const;
export const attachmentAccept=Object.keys(attachmentTypes).map(v=>'.'+v).join(',');
export const attachmentSchema=z.object({id:z.string().uuid(),name:z.string().min(1).max(180),mime:z.string().max(120),size:z.number().int().positive().max(25_000_000)});
export type Attachment=z.infer<typeof attachmentSchema>;
export const attachmentBriefSchema=z.object({files:z.array(attachmentSchema).max(4),text:z.string().max(16000),model:z.string(),usage:z.object({inputTokens:z.number().optional(),outputTokens:z.number().optional()}),elapsedMs:z.number()});
export type AttachmentBrief=z.infer<typeof attachmentBriefSchema>;
export function attachmentMime(name:string){const extension=name.toLowerCase().split('.').pop()||'';return attachmentTypes[extension as keyof typeof attachmentTypes];}
export function isTextAttachment(mime:string){return mime.startsWith('text/')||mime==='application/json'||mime===attachmentTypes.docx;}
