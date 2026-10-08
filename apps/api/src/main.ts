import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvironment } from './infrastructure/config/environment.js';

loadEnvironment();
const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(3000, process.env.API_HOST ?? '127.0.0.1');
