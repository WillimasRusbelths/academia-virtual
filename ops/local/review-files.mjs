import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
// Revisión local: nunca imprime contenido ni valores privados, solo rutas y contadores.
const files = [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'], {encoding:'utf8'}).split('\0').filter(Boolean))];
const tracked = execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0');
const secrets=[];
for (const f of ['.env','.env.test']) if(existsSync(f)) {
  for (const value of Object.values(parseEnv(readFileSync(f,'utf8')))) {
    if(value.length>=12) secrets.push(value);
    try {const u=new URL(value);if(u.password.length>=8)secrets.push(u.password,decodeURIComponent(u.password));}catch{}
  }
}
const findings=[];
const decoder=new TextDecoder('utf-8',{fatal:true});
for(const f of files){
  if(/(^|\/)(node_modules|\.cache|\.npm|dist|generated|test-results)(\/|$)/.test(f)
    || (/(^|\/)\.env(?:\.|$)/.test(f) && !f.endsWith('.example')))
    findings.push({file:f,kind:'local/temporary candidate'});
  const bytes=readFileSync(f);
  let s;try{s=decoder.decode(bytes);}catch{continue;}
  if(secrets.some(secret=>s.includes(secret))) findings.push({file:f,kind:'matches local secret'});
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b/.test(s))
    findings.push({file:f,kind:'credential pattern'});
}
console.log(JSON.stringify({candidateFiles:files.length,trackedLocalEnv:tracked.filter(f=>/^\.env(?:\.|$)/.test(f)&&!f.endsWith('.example')),findings},null,2));
if(findings.length)process.exitCode=1;
