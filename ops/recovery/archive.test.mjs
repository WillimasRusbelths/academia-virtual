import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { archive } from './archive.mjs';

async function fixture(run){const dir=await mkdtemp(path.join(tmpdir(),'recovery-cipher-'));try{
  const files=Object.fromEntries(['input','key','wrong','encrypted','restored'].map(name=>[name,path.join(dir,name)]));
  await writeFile(files.input,randomBytes(140001));await writeFile(files.key,randomBytes(32));await writeFile(files.wrong,randomBytes(32));await run(files);
}finally{await rm(dir,{recursive:true,force:true});}}
test('cifrado autenticado conserva bytes/hash y emplea nonce nuevo',()=>fixture(async f=>{
  const encrypted=await archive('encrypt',f.input,f.encrypted,f.key);const restored=await archive('decrypt',f.encrypted,f.restored,f.key);
  assert.equal(restored.bytes,140001);assert.deepEqual(await readFile(f.restored),await readFile(f.input));assert.notEqual(encrypted.sha256,restored.sha256);
  await archive('encrypt',f.input,f.encrypted+'2',f.key);assert.notDeepEqual(await readFile(f.encrypted),await readFile(f.encrypted+'2'));
}));
for(const failure of ['wrong-key','cipher','header','tag','truncated'])test(`rechaza ${failure} y elimina salida parcial`,()=>fixture(async f=>{
  await archive('encrypt',f.input,f.encrypted,f.key);const raw=await readFile(f.encrypted);
  if(failure!=='wrong-key'){if(failure==='truncated')await writeFile(f.encrypted,raw.subarray(0,12));else{
    raw[failure==='cipher'?30:failure==='header'?0:raw.length-1]^=1;await writeFile(f.encrypted,raw);}}
  await assert.rejects(archive('decrypt',f.encrypted,f.restored,failure==='wrong-key'?f.wrong:f.key));
  await assert.rejects(access(f.restored));
}));
test('no sobrescribe destino existente ni admite clave corta',()=>fixture(async f=>{
  await writeFile(f.restored,'preservar');await assert.rejects(archive('encrypt',f.input,f.restored,f.key));assert.equal(await readFile(f.restored,'utf8'),'preservar');
  await writeFile(f.wrong,'short');await assert.rejects(archive('encrypt',f.input,f.encrypted,f.wrong));await assert.rejects(access(f.encrypted));
}));
