import { expect,test } from 'vitest';
import { comparison,protocol,shuffled,statistics,verdict } from './enumeration-protocol.js';
test('U2: mediana par y p95 por rango, sin interpolación ni descarte',()=>{
  expect(statistics(Array.from({length:100},(_,i)=>i+1))).toEqual({median:50.5,p95:95});
  expect(()=>statistics([1,2,3])).toThrow();expect(protocol).toMatchObject({rounds:3,samples:100,warmup:10,pauseMs:200});
});
test('U2: límites absolutos/relativos estrictamente superiores y dirección',()=>{
  expect(comparison({median:50,p95:100},{median:70,p95:150})).toMatchObject({medianCrossing:0,p95Crossing:0});
  expect(comparison({median:500,p95:1000},{median:449,p95:1201})).toMatchObject({medianCrossing:-1,p95Crossing:1,medianThreshold:50,p95Threshold:200});
});
test('U2: fallo repetido, ruido del control y cruces aislados no permiten aprobar',()=>{
  const equal=comparison({median:40,p95:60},{median:40,p95:60});
  const fast=comparison({median:40,p95:60},{median:10,p95:60});
  const slow=comparison({median:40,p95:60},{median:80,p95:60});
  const round=(value=equal,control=equal)=>({candidate:value,control});
  expect(verdict([round(),round(),round()])).toBe('sin señal detectada bajo este protocolo');
  expect(verdict([round(fast),round(fast),round()])).toBe('fallo');
  expect(verdict([round(fast),round(slow),round()])).toBe('inconcluso');
  expect(verdict([round(equal,slow),round(),round()])).toBe('inconcluso');
  expect(verdict([round()])).toBe('inconcluso');
});
test('U2: orden reproducible e intercalado conserva todas las clases',()=>{
  const values=['reference','control','absent','disabled'];
  expect(shuffled(values,protocol.seed)).toEqual(shuffled(values,protocol.seed));
  expect(shuffled(values,protocol.seed).sort()).toEqual([...values].sort());
});
test('U2: semillas consecutivas no fijan el control ni ninguna clase en una posición',()=>{
  const values=['reference','control','absent','disabled-wrong','disabled-match','unverified-wrong','unverified-match','pending-wrong','pending-match'];
  for(const name of values) {
    const positions=new Set(Array.from({length:100},(_,block)=>shuffled(values,protocol.seed+1000+block).indexOf(name)));
    expect(positions.size).toBe(values.length);
  }
});
