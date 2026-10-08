import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvironment } from './infrastructure/config/environment.js';
import { createDatabase } from './infrastructure/database/database.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureTransport } from './http/transport.js';

const environment = loadEnvironment();
const database = createDatabase(environment);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(environment, database),
  { logger: false, bodyParser: false });
configureTransport(app, environment);
app.enableShutdownHooks();
await app.listen(3000, process.env.API_HOST ?? '127.0.0.1');
