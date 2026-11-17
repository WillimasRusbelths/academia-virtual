import 'reflect-metadata';
import process from 'node:process';
import {Test} from '@nestjs/testing';
import {loadEnvironment} from '../../dist/src/infrastructure/config/environment.js';
import {createDatabase} from '../../dist/src/infrastructure/database/database.js';
import {AppModule,RESERVATION_DISPATCH_LIFECYCLE} from '../../dist/src/app.module.js';
import {RESERVATION_EXPIRATION_LIFECYCLE} from '../../dist/src/modules/enrollment/enrollment.module.js';
import {configureTransport} from '../../dist/src/http/transport.js';
const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))process.exit(1);
const database=createDatabase(environment);let app;
try {
  const module=await Test.createTestingModule({imports:[AppModule.forRoot(environment,database)]})
    .overrideProvider(RESERVATION_DISPATCH_LIFECYCLE).useValue({}).overrideProvider(RESERVATION_EXPIRATION_LIFECYCLE).useValue({}).compile();
  app=module.createNestApplication({logger:false,bodyParser:false});configureTransport(app,environment);await app.listen(0,'127.0.0.1');
  process.send?.({ready:await app.getUrl()});
}catch{await app?.close();await database.close();process.exit(1);}
process.once('SIGTERM',async()=>{await app.close();await database.close();process.exit(0);});
