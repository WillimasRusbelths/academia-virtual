import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { accountFor,phaseAt,sessionStages,authenticationStages } from './profiles.js';
import { stopReason } from './observe.ts';
const accounts=Object.entries({sessions:1000,warmup:20,authentication:100}).flatMap(([group,count])=>Array.from({length:count},(_,index)=>({group,index,id:`${group}-${index}`,email:`${group}-${index}@example.test`,password:'private-canary'})));
async function script(file,env={},slot=1){
  const state={now:0,sleeps:[],requests:[],metrics:{},badLogin:false,badIdentity:false};
  const execution={vu:{idInTest:slot,iterationInScenario:0},scenario:{startTime:0},test:{abort(){throw new Error('ABORT');}}};
  const response=(status,id)=>({status,timings:{duration:12},json:()=>({id,role:'STUDENT'})});
  const http={expectedStatuses:x=>x,cookieJar:()=>({cookiesForURL:()=>({sid:['cookie-canary']})}),
    post(url,body,params){state.requests.push({url,body,params});return url.endsWith('/login')?response(state.badLogin?503:200,state.badIdentity?'other':accounts.find(a=>a.email===JSON.parse(body).email).id):response(204);},
    get(url,params){state.requests.push({url,params});return params.tags.name==='revocation-check'?response(401):response(200,state.badIdentity?'other':accountFor(accounts,env.SMOKE_KIND==='authentication'?'authentication':env.LOAD_PHASE==='warmup'?'warmup':'sessions',slot).id);}};
  class Metric{constructor(name){this.name=name;state.metrics[name]=[];}add(value,tags){state.metrics[this.name].push({value,tags});}}
  class Clock extends Date{static now(){return state.now;}}
  const context=vm.createContext({__ENV:env,open:()=>JSON.stringify({accounts}),Date:Clock,Math:{...Math,random:()=>0.5}});
  const cache=new Map();const mocks={
    'k6':{sleep:s=>{state.sleeps.push(s);state.now+=s*1000;}},'k6/http':{default:http},'k6/execution':{default:execution},
    'k6/metrics':{Counter:Metric,Rate:Metric,Trend:Metric,Gauge:Metric},'k6/data':{SharedArray:class{constructor(_name,load){return load();}}},
  };
  async function load(name){if(cache.has(name))return cache.get(name);let module;
    if(mocks[name]){const object=mocks[name];module=new vm.SyntheticModule(Object.keys(object),function(){for(const [k,v] of Object.entries(object))this.setExport(k,v);},{context});}
    else module=new vm.SourceTextModule(readFileSync(new URL(name,import.meta.url),'utf8'),{context,identifier:name});
    cache.set(name,module);await module.link(dep=>load(dep));return module;}
  const module=await load('./'+file);await module.evaluate();return {state,execution,module:module.namespace};
}
test('muestras y asignación 1..1000 disjuntas; no módulo/reutilización de cuenta',()=>{
  const assigned=[];for(const [group,count] of Object.entries({sessions:1000,warmup:20,authentication:100}))for(let id=1;id<=count;id++)assigned.push(accountFor(accounts,group,id).id);
  assert.equal(new Set(assigned).size,1120);for(const id of [0,1001,1.1])assert.throws(()=>accountFor(accounts,'sessions',id));
});
test('rampas y meseta exactas 17 minutos; fronteras de fase',()=>{
  assert.deepEqual(sessionStages,[{duration:'1m',target:100},{duration:'2m',target:500},{duration:'2m',target:1000},{duration:'10m',target:1000},{duration:'2m',target:0}]);
  assert.equal(phaseAt(299.999),'ramp');assert.equal(phaseAt(300),'plateau');assert.equal(phaseAt(899.999),'plateau');assert.equal(phaseAt(900),'descent');
});
test('escalones constantes 10/25/50/100 por 2 min; saltos sin rampas escondidas',()=>{
  assert.deepEqual(authenticationStages.filter(s=>s.duration==='2m').map(s=>s.target),[10,25,50,100]);
  assert.equal(authenticationStages.filter(s=>s.duration==='0s').length,3);
});
test('warmup independiente 20/1 min y cookies persistentes',async()=>{
  const {module}=await script('sessions.js',{LOAD_PHASE:'warmup'});assert.equal(module.options.scenarios.warmup.vus,20);assert.equal(module.options.scenarios.warmup.duration,'1m');assert.equal(module.options.noCookiesReset,true);
});
test('tres iteraciones mantienen un login por VU y pausa de 5–10 s',async()=>{
  const {module,state}=await script('sessions.js');for(let i=0;i<3;i++)module.default();
  assert.equal(state.requests.filter(r=>r.url.endsWith('/login')).length,1);assert.equal(state.requests.filter(r=>r.url.endsWith('/me')).length,3);
  assert.ok(state.sleeps.every(s=>s>=5&&s<=10));
});
test('VU 1000 usa cuenta 1000 y headers reales',async()=>{
  const {module,state}=await script('sessions.js',{},1000);module.default();const request=state.requests[0];
  assert.equal(JSON.parse(request.body).email,'sessions-999@example.test');assert.equal(request.params.headers.Origin,'http://localhost:5173');assert.equal(request.params.headers['X-CSRF-Protection'],'1');
});
test('login fallido aborta muestra, sin reintento silencioso',async()=>{const {module,state}=await script('sessions.js');state.badLogin=true;assert.throws(()=>module.default(),/ABORT/);assert.equal(state.requests.length,1);});
test('cruce de identidad aborta y cuenta el error',async()=>{const {module,state}=await script('sessions.js');state.badIdentity=true;assert.throws(()=>module.default(),/ABORT/);assert.equal(state.metrics.identity_mismatch[0].value,1);});
test('descenso confirma revocación reutilizando la cookie anterior, separada del error rate válido',async()=>{
  const {module,state}=await script('sessions.js');state.now=901000;module.default();
  assert.equal(state.requests.at(-1).params.headers.Cookie,'sid=cookie-canary');assert.equal(state.requests.at(-1).params.tags.name,'revocation-check');
  assert.equal(state.metrics.unexpected_errors.length,3);assert.equal(state.metrics.revocation_failures.at(-1).value,0);
});
test('autenticación cicla login/me/logout/5 s con conjunto separado',async()=>{
  const {module,state}=await script('authentication.js',{SMOKE_KIND:'authentication'});module.default();module.default();
  assert.equal(state.requests.length,6);assert.ok(state.sleeps.every(s=>s===5));assert.equal(JSON.parse(state.requests[0].body).email,'authentication-0@example.test');
});
test('watchdog conserva límite 5 s exactos y detiene por espera mayor o poca RAM',()=>{
  assert.equal(stopReason(5000,0,1024**3),null);assert.equal(stopReason(5000.001,0,1024**3),'HASH_WAIT_OVER_5S');assert.equal(stopReason(0,950*1024**2,1024**3),'MEMORY_HEADROOM_UNDER_128M');
});
test('resumen no incluye manifiesto, cuerpos ni cookies',async()=>{const {module}=await script('sessions.js');const output=module.handleSummary({metrics:{count:2}});assert.ok(!JSON.stringify(output).includes('canary'));});
