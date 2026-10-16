import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { accountFor } from './profiles.js';

export const accounts=new SharedArray('identity-load-accounts',()=>JSON.parse(open('/load-private/fixtures/fixtures.json')).accounts);
export const base='http://api:3000/api/v1';
export const errors=new Rate('unexpected_errors'),mismatch=new Counter('identity_mismatch'),revocationFailures=new Counter('revocation_failures');
export const loginMs=new Trend('identity_login_ms',true),meMs=new Trend('identity_me_ms',true),unavailable=new Counter('identity_503');
export const started=new Counter('identity_sessions_started'),closed=new Counter('identity_logouts_completed');
const requests=new Counter('identity_valid_traffic_requests');
const epoch=new Gauge('identity_scenario_start_ms');
const headers={'Content-Type':'application/json',Origin:'http://localhost:5173','X-CSRF-Protection':'1'};
export function account(group){try{return accountFor(accounts,group,exec.vu.idInTest);}catch{exec.test.abort('Falta cuenta exclusiva para VU.');}}
export function params(name,expected=200){return {headers,tags:{name},timeout:'10s',redirects:0,responseCallback:http.expectedStatuses(expected)};}
function result(response,valid){requests.add(1);errors.add(!valid);if(response.status===503)unavailable.add(1);return valid;}
export function login(a){
  epoch.add(exec.scenario.startTime);
  const response=http.post(`${base}/auth/login`,JSON.stringify({email:a.email,password:a.password}),params('login'));
  loginMs.add(response.timings.duration);let data;try{data=response.json('data');}catch{data=null;}
  const matches=response.status!==200||data?.id===a.id;
  mismatch.add(matches?0:1);revocationFailures.add(0);unavailable.add(0);closed.add(0);
  if(!result(response,response.status===200&&data?.id===a.id))return false;
  started.add(1);return true;
}
export function me(a){
  const response=http.get(`${base}/me`,params('me'));meMs.add(response.timings.duration);
  let data;try{data=response.json('data');}catch{data=null;}
  const matches=response.status!==200||data?.id===a.id;
  mismatch.add(matches?0:1);return result(response,response.status===200&&data?.id===a.id&&data.role==='STUDENT');
}
export function logout(checkRevocation=true){
  const prior=http.cookieJar().cookiesForURL(base);
  const cookie=Object.entries(prior).flatMap(([name,values])=>values.map(value=>`${name}=${value}`)).join('; ');
  const response=http.post(`${base}/auth/logout`,'{}',params('logout',204));
  if(!result(response,response.status===204))return false;
  closed.add(1);if(!checkRevocation)return true;
  const rejected=http.get(`${base}/me`,{...params('revocation-check',401),headers:{...headers,Cookie:cookie}});
  revocationFailures.add(cookie&&rejected.status===401?0:1);return !!cookie&&rejected.status===401;
}
export function summary(data){return {['/load-private/'+(__ENV.RESULT_NAME||'k6-summary')+'.json']:JSON.stringify(data)};}
