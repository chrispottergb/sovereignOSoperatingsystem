import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=path.resolve(__dirname,'..');
// Only load the existing local pairing secret. Do not copy provider keys from Vercel.
if(!process.env.WORKER_SECRET){const file=path.join(app,'.env.provision');if(fs.existsSync(file)){const pairing=parseEnv(fs.readFileSync(file,'utf8'));if(pairing.WORKER_SECRET)process.env.WORKER_SECRET=pairing.WORKER_SECRET;}}
if(process.env.WORKER_SECRET&&!process.env.SOVEREIGN_ORIGIN)process.env.SOVEREIGN_ORIGIN='https://sovereign-ai-workspace-zeta.vercel.app';
const runner=process.argv.includes('--runner');
const child=spawn(process.execPath,['--conditions=react-server','--import','tsx',runner?'scripts/local-runner.ts':'scripts/mcp-server.ts',...(process.argv.includes('--once')?['--once']:[])],{cwd:app,env:process.env,stdio:'inherit',windowsHide:true,shell:false});
child.on('error',()=>{process.stderr.write('Could not start local MCP service.\n');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
