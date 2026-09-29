import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ProbeModule } from './probe.module.js';

const app = await NestFactory.create(ProbeModule, { logger: false });
await app.listen(3000, '127.0.0.1');
