import { sleep } from 'k6';
import { Trend } from 'k6/metrics';
// Calibración de temporizador sin HTTP: no sustituye ningún perfil ID-LOAD.
const drift=new Trend('timer_overshoot_ms',true);
export const options={vus:1000,duration:'30s',gracefulStop:'10s',systemTags:['scenario'],summaryTrendStats:['min','med','p(95)','p(99)','max']};
export default function(){const start=Date.now();sleep(5);drift.add(Date.now()-start-5000);}
export function handleSummary(data){return {['/load-private/'+__ENV.RESULT_NAME+'.json']:JSON.stringify(data)};}
