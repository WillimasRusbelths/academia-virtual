import {test,expect} from 'vitest';
import {validatePdfStructure} from '../../src/modules/materials/infrastructure/pdf-structure.js';
import {materialFile} from '../support/materials-files.js';

function trailerOnlyUpdate(options:{previous?:string;subsections?:string;root?:boolean}={}){
  const base=materialFile('pdf'),previous=/startxref\n(\d+)/.exec(base.toString('ascii'))![1];
  const trailer=`xref\n${options.subsections??'0 0\n'}trailer\n<< /Size 5${options.root?' /Root 1 0 R':''} /Prev ${options.previous??previous} >>\nstartxref\n${base.length}\n%%EOF\n`;
  return Buffer.concat([base,Buffer.from(trailer,'ascii')]);
}

test('accepts a trailer-only incremental PDF update with an empty xref subsection and inherited Root',()=>{
  expect(()=>validatePdfStructure(trailerOnlyUpdate())).not.toThrow();
});
test('accepts several trailer-only updates while resolving the original cross-reference entries',()=>{
  const first=trailerOnlyUpdate(),previous=materialFile('pdf').length;
  const next=Buffer.from(`xref\n0 0\ntrailer\n<< /Size 5 /Prev ${previous} >>\nstartxref\n${first.length}\n%%EOF\n`,'ascii');
  expect(()=>validatePdfStructure(Buffer.concat([first,next]))).not.toThrow();
});
test('an empty subsection still requires a valid nonempty predecessor, bounded offsets and real subsection headers',()=>{
  for(const bytes of [trailerOnlyUpdate({previous:'0'}),trailerOnlyUpdate({previous:String(materialFile('pdf').length)}),
    trailerOnlyUpdate({previous:'999999999'}),trailerOnlyUpdate({subsections:''}),trailerOnlyUpdate({subsections:'0 -1\n'}),
    trailerOnlyUpdate({subsections:'0 999999999\n'})]){
    expect(()=>validatePdfStructure(bytes)).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));
  }
  const base=materialFile('pdf'),empty=Buffer.from(`xref\n0 0\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${base.length}\n%%EOF\n`,'ascii');
  expect(()=>validatePdfStructure(Buffer.concat([base,empty]))).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));
});
test('an empty latest update does not conceal corrupt referenced objects in its predecessor',()=>{
  const bytes=Buffer.from(trailerOnlyUpdate().toString('ascii').replace('1 0 obj','8 0 obj'),'ascii');
  expect(()=>validatePdfStructure(bytes)).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));
});
test('empty subsection before ordinary entries is accepted without shifting byte offsets',()=>{
  const base=materialFile('pdf'),previous=Number(/startxref\n(\d+)/.exec(base.toString('ascii'))![1]);
  const source=base.toString('ascii');const bytes=Buffer.from(source.slice(0,previous)+source.slice(previous).replace('xref\n0 5\n','xref\n0 0\n0 5\n'),'ascii');
  expect(()=>validatePdfStructure(bytes)).not.toThrow();
});
