import {z} from 'zod';

export const specialistRegistry = [
 {id:'ace-step-1.5',model:'ACE-Step/Ace-Step1.5',operation:'generate_music',license:'MIT',inputs:['text','lyrics'],outputs:['audio/mpeg'],hardware:'Local GPU worker; size depends on model configuration',implemented:true},
 {id:'flux-klein-4b',model:'black-forest-labs/FLUX.2-klein-4B',operation:'generate_image',license:'Apache-2.0',inputs:['text','image'],outputs:['image/png'],hardware:'GPU worker required',implemented:false},
 {id:'ltx-2.3',model:'Lightricks/LTX-2.3',operation:'generate_video',license:'LTX community terms',inputs:['text','image'],outputs:['video/mp4'],hardware:'GPU worker required',implemented:false},
 {id:'qwen-tts',model:'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice',operation:'generate_speech',license:'Apache-2.0',inputs:['text'],outputs:['audio/wav'],hardware:'Inference worker required',implemented:false},
 {id:'qwen-asr',model:'Qwen/Qwen3-ASR-0.6B',operation:'transcribe_audio',license:'See model card',inputs:['audio'],outputs:['text'],hardware:'Inference worker required',implemented:false},
 {id:'specter2',model:'allenai/specter2_base',operation:'search_papers',license:'Apache-2.0',inputs:['text'],outputs:['paper references'],hardware:'Paper index and retrieval adapter required',implemented:false},
 {id:'reve',model:'brain-bzh/reve-base',operation:'analyze_eeg',license:'REVE responsible-use terms',inputs:['EEG recording','electrode metadata','event timestamps'],outputs:['features','quality report'],hardware:'Validated preprocessing and task-specific evaluator required',implemented:false},
] as const;

export const musicShape = {
 requestId:z.string().uuid(),
 sourceTurnId:z.string().uuid().optional(),
 evaluationId:z.string().uuid().optional(),
 keyScale:z.string().trim().max(30).optional(),
 prompt:z.string().trim().min(3).max(4000),
 lyrics:z.string().max(4000).default(''),
 seconds:z.number().int().min(10).max(120).default(30),
 bpm:z.number().int().min(30).max(300).default(90),
 seed:z.number().int().min(0).max(2147483647).default(42),
 environment:z.enum(['local','cloud']).default('local'),
};
export const musicInput=z.object(musicShape).strict();
export type MusicInput=z.infer<typeof musicInput>;
export type SpecialistJob={id:string;request_id:string;input:MusicInput;status:'queued'|'running'|'completed'|'failed'|'uncertain'|'cancelled';stage:string;created_at:string;claim?:string;artifact_path?:string;artifact_sha256?:string;error?:string;provenance?:Record<string,unknown>};
export const maxAudioBytes=3_000_000;
export const specialistHelp={
 list_specialists:'List shared specialist capabilities and availability. No model execution.',
 generate_music:'Queue one local ACE-Step music job. Requires an enabled shared connector and live local worker. Returns a job ID, not audio. No cloud execution. Reuse requestId to avoid duplicate jobs.',
 read_specialist_job:'Read a specialist job and saved artifact metadata by UUID. Never infer brain effects from generated audio.',
};
