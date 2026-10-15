import { expect,test } from 'vitest';
import { runEnumeration } from './enumeration.js';
test('T087: protocolo U2 completo, sin atajos de muestras ni cuotas',{timeout:60*60*1000},async()=>{
  const report=await runEnumeration();
  expect(report.result).toBe('sin señal detectada bajo este protocolo');
});
