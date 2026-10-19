import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
function report(after){
 const directory=mkdtempSync(path.join(tmpdir(),'identity-engine-report-'));
 try{
  const before={at:'2026-10-16T00:00:00Z',database:{stats_reset:'fixed',numbackends:10},wal:{stats_reset:'fixed'},io:[],statements:[{kind:'OTHER',calls:1,executionMs:1192.743719}]};
  const file=path.join(directory,'input.json');writeFileSync(file,JSON.stringify({name:'synthetic-reporter-control',diagnostic:{metrics:{}},engineBefore:before,engineAfter:{...before,statements:[{kind:'OTHER',calls:1,executionMs:after}]}}));
  return spawnSync(process.execPath,['load-tests/identity/engine-report.mjs','benchmark',file],{encoding:'utf8'});
 }finally{assert.ok(directory.startsWith(path.join(tmpdir(),'identity-engine-report-')));rmSync(directory,{recursive:true,force:true});}
}
test('redondeo float8 documentado no se confunde con reinicio de contadores',()=>{
 const result=report(1192.7437189999998);assert.equal(result.status,0);const value=JSON.parse(result.stdout);
 assert.equal(value.engine.statements[0].executionMs,0);assert.equal(value.numericRoundoff.length,1);assert.ok(value.numericRoundoff[0].difference<0);
});
test('un descenso real del contador impide el reporte',()=>{const result=report(1191);assert.notEqual(result.status,0);assert.match(result.stderr,/decrece/);});
