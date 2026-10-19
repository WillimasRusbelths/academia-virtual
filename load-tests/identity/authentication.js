import { sleep } from 'k6';
import { authenticationStages, commonOptions } from './profiles.js';
import { account,login,me,logout,summary } from './client.js';

export const options={...commonOptions,scenarios:{authentication:{executor:'ramping-vus',startVUs:10,
  stages:authenticationStages,gracefulRampDown:'15s',gracefulStop:'15s'}},
  thresholds:{...commonOptions.thresholds,identity_login_ms:['p(95)<3000']}};
export function authenticationIteration(){const a=account('authentication');if(login(a)){me(a);logout(false);}sleep(5);}
export default authenticationIteration;
export const handleSummary=summary;
