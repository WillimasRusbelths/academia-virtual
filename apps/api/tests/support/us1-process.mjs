import 'reflect-metadata';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { loadEnvironment } from '../../dist/src/infrastructure/config/environment.js';
import { createDatabase } from '../../dist/src/infrastructure/database/database.js';
import { AppModule } from '../../dist/src/app.module.js';
import { configureTransport } from '../../dist/src/http/transport.js';

// Composición real en otro proceso, sin rutas ni datos de autorización añadidos.
const environment=loadEnvironment();
if(environment.appEnv!=='test'||!/^t_[a-z0-9_]+$/.test(environment.databaseSchema))process.exit(1);
const database=createDatabase(environment);
database.pool.options.options=`-c search_path=${environment.databaseSchema},pg_catalog -c timezone=UTC`;
let app;
try {
  app=await NestFactory.create(AppModule.forRoot(environment,database),{logger:false,bodyParser:false});
  configureTransport(app,environment);await app.listen(0,'127.0.0.1');
  process.send?.({ready:await app.getUrl()});
} catch {await app?.close();await database.close();process.exit(1);}
process.once('SIGTERM',async()=>{await app.close();await database.close();process.exit(0);});
