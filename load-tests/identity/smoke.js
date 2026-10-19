import { sessionIteration } from './sessions.js';
import { authenticationIteration } from './authentication.js';
import { commonOptions } from './profiles.js';
import { summary } from './client.js';
import { logout } from './client.js';
import exec from 'k6/execution';
// Ensayo técnico separado: no modifica perfiles, muestras ni umbrales ID-LOAD-01/02.
export const options={...commonOptions,scenarios:{smoke:{executor:'per-vu-iterations',vus:2,iterations:2,maxDuration:'60s'}},
  thresholds:{...commonOptions.thresholds,unexpected_errors:['rate==0']}};
export default function(){if(__ENV.SMOKE_KIND==='authentication')authenticationIteration();else {sessionIteration();if(exec.vu.iterationInScenario===1)logout();}}
export const handleSummary=summary;
