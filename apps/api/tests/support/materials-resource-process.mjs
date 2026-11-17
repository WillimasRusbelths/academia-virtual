// Dedicated test process: production API with private, bounded measurement IPC.
import 'reflect-metadata';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {setInterval,clearInterval} from 'node:timers';
import {Test} from '@nestjs/testing';
import {loadEnvironment} from '../../dist/src/infrastructure/config/environment.js';
import {createDatabase} from '../../dist/src/infrastructure/database/database.js';
import {AppModule,RESERVATION_DISPATCH_LIFECYCLE} from '../../dist/src/app.module.js';
import {RESERVATION_EXPIRATION_LIFECYCLE} from '../../dist/src/modules/enrollment/enrollment.module.js';
import {configureTransport} from '../../dist/src/http/transport.js';
const environment=loadEnvironment();
if(environment.appEnv!=='test'||process.env.RESOURCES_ISOLATED!=='1'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))process.exit(1);
const database=createDatabase(environment);let app,window,fault;
const memory=()=>{const {rss,heapUsed,external,arrayBuffers}=process.memoryUsage();return {rss,heapUsed,external,arrayBuffers};};
const sample=()=>{if(window){window.samples++;const m=memory();for(const key of Object.keys(m))window.peak[key]=Math.max(window.peak[key],m[key]);}};
// Observe JavaScript Buffer operations; totals may overlap and exclude native allocations.
for(const name of ['alloc','allocUnsafe','allocUnsafeSlow','from','concat']){
  const original=Buffer[name];Buffer[name]=function(...args){const result=Reflect.apply(original,this,args);
    if(window){const entry=window.buffers[name];entry.calls++;entry.bytes+=result.length;if(result.length>=20_000_000)entry.atLeastFileSize++;sample();}return result;};
}
const copy=Buffer.prototype.copy;Buffer.prototype.copy=function(...args){const bytes=Reflect.apply(copy,this,args);if(window){window.buffers.copy.calls++;window.buffers.copy.bytes+=bytes;if(bytes>=20_000_000)window.buffers.copy.atLeastFileSize++;sample();}return bytes;};
const seen=new WeakSet();
function attach(client){if(seen.has(client))return client;seen.add(client);const query=client.query.bind(client);
  client.query=function(...args){const sql=typeof args[0]==='string'?args[0]:'';
    if(window&&Array.isArray(args[1]))for(const value of args[1])if(Buffer.isBuffer(value))window.sqlBufferParameterBytes+=value.length;
    const result=Reflect.apply(query,client,args);
    if(!result||typeof result.then!=='function')return result;
    return result.then(value=>{
      if(window&&Array.isArray(value.rows))for(const row of value.rows)for(const cell of Object.values(row))if(Buffer.isBuffer(cell))window.sqlBufferResultBytes+=cell.length;
      if(fault&&/INSERT INTO "MaterialContent"/.test(sql)){const code=fault;fault=undefined;if(window)window.injectedFault=code;throw Object.assign(new Error('Synthetic resource fault after real insertion'),{code});}
      sample();return value;
    });};return client;
}
const connect=database.pool.connect.bind(database.pool);
database.pool.connect=function(...args){if(typeof args[0]==='function'){const callback=args[0];return Reflect.apply(connect,database.pool,[(...values)=>{if(values[1])attach(values[1]);Reflect.apply(callback,undefined,values);}]);}
  return Reflect.apply(connect,database.pool,args).then(attach);};
const timer=setInterval(sample,25);timer.unref();
process.on('message',message=>{
  if(!message||typeof message!=='object'||!Number.isInteger(message.id))return;
  if(message.operation==='begin'){const initial=memory();window={baseline:initial,peak:{...initial},samples:0,buffers:Object.fromEntries(['alloc','allocUnsafe','allocUnsafeSlow','from','concat','copy'].map(k=>[k,{calls:0,bytes:0,atLeastFileSize:0}])),sqlBufferParameterBytes:0,sqlBufferResultBytes:0,incomingBytes:0};}
  if(message.operation==='fault'&&['53100','53200'].includes(message.code))fault=message.code;
  sample();const result={...window,current:memory(),pool:{total:database.pool.totalCount,idle:database.pool.idleCount,waiting:database.pool.waitingCount}};
  process.send?.({id:message.id,result});if(message.operation==='end')window=undefined;
});
try{
  const marker=await database.pool.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
  if(marker.rows[0].marker!=='materials-resources-isolated')throw Error('Wrong resource destination');
  const module=await Test.createTestingModule({imports:[AppModule.forRoot(environment,database)]})
    .overrideProvider(RESERVATION_DISPATCH_LIFECYCLE).useValue({}).overrideProvider(RESERVATION_EXPIRATION_LIFECYCLE).useValue({}).compile();
  app=module.createNestApplication({logger:false,bodyParser:false});configureTransport(app,environment);await app.listen(0,'127.0.0.1');
  await app.get('MAIL_DELIVERY_SCHEDULER').beforeApplicationShutdown();
  app.getHttpServer().prependListener('request',(request)=>{if(request.method==='PUT'&&/^\/api\/v1\/materials\/uploads\/[a-f0-9-]+\/content$/.test(request.url??'')){
    const emit=request.emit;request.emit=function(event,...args){if(event==='data'&&window)window.incomingBytes+=args[0].length;return Reflect.apply(emit,this,[event,...args]);};
  }});
  process.send?.({ready:await app.getUrl()});
}catch{clearInterval(timer);await app?.close();await database.close();process.exit(1);}
process.once('SIGTERM',async()=>{clearInterval(timer);await app.close();await database.close();process.exit(0);});
