import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, open, unlink, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const magic=Buffer.from('ACADBKP1');
/** Formato v1: magic(8), nonce(12), ciphertext, tag GCM(16). Clave binaria separada. */
export async function archive(mode,input,output,keyFile) {
  if(!['encrypt','decrypt'].includes(mode) || path.resolve(input)===path.resolve(output)
    || path.resolve(keyFile)===path.resolve(output)) throw new Error('Argumentos inválidos.');
  const key=await readFile(keyFile);if(key.length!==32)throw new Error('Clave inválida.');
  let created=false;
  try {
    const fd=await open(output,'wx',0o600);created=true;await fd.close();
    if(mode==='encrypt') {
      const header=Buffer.concat([magic,randomBytes(12)]);const cipher=createCipheriv('aes-256-gcm',key,header.subarray(8));
      cipher.setAAD(header);await readWriteHeader(output,header);
      await pipeline(createReadStream(input),cipher,createWriteStream(output,{flags:'a',mode:0o600}));
      const fd=await open(output,'a');try{await fd.write(cipher.getAuthTag());}finally{await fd.close();}
    } else {
      const info=await stat(input);if(info.size<36)throw new Error('Archivo inválido.');
      const fd=await open(input,'r');const header=Buffer.alloc(20),tag=Buffer.alloc(16);
      try {await fd.read(header,0,20,0);await fd.read(tag,0,16,info.size-16);}finally{await fd.close();}
      if(!header.subarray(0,8).equals(magic))throw new Error('Formato inválido.');
      const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(header);decipher.setAuthTag(tag);
      await pipeline(createReadStream(input,{start:20,end:info.size-17}),decipher,createWriteStream(output,{flags:'w',mode:0o600}));
    }
    return {bytes:(await stat(output)).size,sha256:await hash(output)};
  } catch {
    if(created)await unlink(output).catch(()=>undefined);
    throw new Error('Archivo no procesado; valores omitidos.');
  } finally {key.fill(0);}
}
async function readWriteHeader(file,header){const fd=await open(file,'w');try{await fd.write(header);}finally{await fd.close();}}
export async function hash(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [mode,input,output,keyFile]=process.argv.slice(2);
  archive(mode,input,output,keyFile).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(()=>{
    process.stderr.write('Archivo no procesado; valores omitidos.\n');process.exitCode=1;
  });
}
