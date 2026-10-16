import exec from 'k6/execution';
import { sleep } from 'k6';
import { Gauge } from 'k6/metrics';
import { sessionStages, commonOptions, phaseAt } from './profiles.js';
import { account,login,me,logout,summary } from './client.js';

const warmup=__ENV.LOAD_PHASE==='warmup';
export const options={...commonOptions,scenarios:{[warmup?'warmup':'sessions']:warmup?
  {executor:'constant-vus',vus:20,duration:'1m',gracefulStop:'15s'}:
  {executor:'ramping-vus',startVUs:0,stages:sessionStages,gracefulRampDown:'15s',gracefulStop:'15s'}},
  thresholds:{...commonOptions.thresholds,identity_sessions_started:[`count==${warmup?20:1000}`],
    identity_me_ms:['p(95)<500','p(99)<1000'],identity_login_ms:['p(95)<3000']}};
const active=new Gauge('identity_active_slot');let authenticated=false,finished=false;
export function sessionIteration(){
  if(finished){sleep(1);return;}
  const a=account(warmup?'warmup':'sessions');
  if(!authenticated){if(!login(a))exec.test.abort('Login único falló: no se alcanzó la muestra.');authenticated=true;}
  if(!me(a))exec.test.abort('Sesión dejó de ser válida; ensayo incompleto.');
  const elapsed=(Date.now()-exec.scenario.startTime)/1000;
  active.add(1,{slot:String(exec.vu.idInTest),phase:warmup?'warmup':phaseAt(elapsed)});
  // La retirada de VU puede interrumpir; esto solo registra cierres que sí completan.
  if(!warmup&&elapsed>=900){logout();finished=true;return;}
  sleep(5+Math.random()*5);
  if(warmup&&(Date.now()-exec.scenario.startTime)>=60_000){logout();finished=true;}
}
export default sessionIteration;
export const handleSummary=summary;
