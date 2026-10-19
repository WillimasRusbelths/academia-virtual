/** U2: constantes del protocolo, no parámetros de seguridad de la aplicación. */
export const protocol={version:2,seed:20261015,rounds:3,samples:100,warmup:10,pauseMs:200} as const;
export function shuffled<T>(values:readonly T[],seed:number):T[] {
  let state=seed>>>0;
  // Mulberry32 mezcla también semillas consecutivas: no fija el primer intercambio.
  const random=()=>{state=(state+0x6D2B79F5)|0;let value=Math.imul(state^(state>>>15),state|1);
    value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};
  const result=[...values];
  for(let index=result.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[result[index],result[other]]=[result[other],result[index]];}
  return result;
}
export function statistics(samples:readonly number[]) {
  if(samples.length!==protocol.samples||samples.some(value=>!Number.isFinite(value)||value<0))throw new Error('U2: se requieren 100 duraciones válidas.');
  const sorted=[...samples].sort((a,b)=>a-b);
  return {median:(sorted[49]+sorted[50])/2,p95:sorted[Math.ceil(.95*sorted.length)-1]};
}
export type Stats=ReturnType<typeof statistics>;
export function comparison(reference:Stats,candidate:Stats) {
  const medianDelta=candidate.median-reference.median;const p95Delta=candidate.p95-reference.p95;
  const medianThreshold=Math.max(20,.1*reference.median);const p95Threshold=Math.max(50,.2*reference.p95);
  return {medianDelta,p95Delta,medianThreshold,p95Threshold,
    medianCrossing:Math.abs(medianDelta)>medianThreshold?Math.sign(medianDelta):0,
    p95Crossing:Math.abs(p95Delta)>p95Threshold?Math.sign(p95Delta):0};
}
export type Comparison=ReturnType<typeof comparison>;
export type Verdict='fallo'|'inconcluso'|'sin señal detectada bajo este protocolo';
export function verdict(rounds:readonly Readonly<Record<string,Comparison>>[]):Verdict {
  if(rounds.length!==3)return 'inconcluso';
  // Una diferencia entre referencias equivalentes invalida la ronda por ruido.
  if(rounds.some(round=>round.control?.medianCrossing||round.control?.p95Crossing))return 'inconcluso';
  let crossed=false;
  for(const name of Object.keys(rounds[0]).filter(value=>value!=='control')) {
    for(const metric of ['medianCrossing','p95Crossing'] as const)for(const direction of [-1,1]) {
      const n=rounds.filter(round=>round[name]?.[metric]===direction).length;
      if(n>=2)return 'fallo';
      if(n)crossed=true;
    }
  }
  return crossed?'inconcluso':'sin señal detectada bajo este protocolo';
}
