import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { normalizeMaterialFileMetadata } from '../../src/modules/materials/public/materials.js';
import { createBinaryResponse, discardBinaryResponse } from '../../src/http/binary-response.js';
import { materialsFixture } from '../support/materials.js';
import { materialFileCase } from '../support/materials-files.js';
import { financialFingerprint } from '../support/enrollment-maintenance.js';
import { us1Http } from '../support/us1-http.js';

const unsafe=['<','>','"','|','?','*'];
const metadata={downloadName:'lección (1).pdf',mediaType:'application/pdf',byteSize:5,sha256:'a'.repeat(64)};

test.each(unsafe)('domain rejects filename containing %j before an unusable upload can be registered',character=>{
  expect(()=>normalizeMaterialFileMetadata({...metadata,downloadName:`lectura${character}.pdf`}))
    .toThrow(expect.objectContaining({code:'VALIDATION_ERROR',fields:['downloadName']}));
});

test.each(unsafe)('binary capability rejects filename containing %j and releases its admission',character=>{
  const release=vi.fn();
  expect(()=>createBinaryResponse({body:Buffer.from('%PDF-'),byteSize:5,mediaType:'application/pdf',downloadName:`lectura${character}.pdf`,release}))
    .toThrow(expect.objectContaining({code:'TEMPORARILY_UNAVAILABLE'}));
  expect(release).toHaveBeenCalledTimes(1);
});

test('safe Unicode filename is preserved without silent renaming in metadata and binary capability',()=>{
  expect(normalizeMaterialFileMetadata(metadata)).toEqual(metadata);
  const release=vi.fn(),capability=createBinaryResponse({...metadata,body:Buffer.from('%PDF-'),release});
  discardBinaryResponse(capability);expect(release).toHaveBeenCalledTimes(1);
});

test('HTTP denies every client-incompatible filename without persisting an intention or changing finances',async()=>{
  const f=await materialsFixture();let http:Awaited<ReturnType<typeof us1Http>>|undefined;
  try {
    http=await us1Http({context:f});const financial=await financialFingerprint(f.pool),file=materialFileCase('pdf-valid');
    const before=(await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload"')).rows[0].n;
    for(const character of unsafe){
      const response=await fetch(http.url+'/api/v1/materials/groups/'+f.groupId+'/uploads',{method:'POST',headers:http.headers(f.teacher.secret),
        body:JSON.stringify({intentionId:randomUUID(),title:'Lectura ficticia',description:null,downloadName:`lectura${character}.pdf`,mediaType:file.mediaType,byteSize:file.byteSize,sha256:file.sha256})});
      expect(response.status).toBe(400);expect((await response.json()).error).toMatchObject({code:'VALIDATION_ERROR',fields:[{field:'downloadName'}]});
    }
    expect((await f.pool.query('SELECT count(*)::int AS n FROM "MaterialUpload"')).rows[0].n).toBe(before);
    expect(await financialFingerprint(f.pool)).toBe(financial);
  } finally {try{await http?.close();}finally{await f.cleanup();}}
},120000);
