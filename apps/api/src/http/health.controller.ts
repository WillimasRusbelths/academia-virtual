import { Controller, Get, Inject } from '@nestjs/common';
import { Access } from '../modules/authorization/entrypoints/http/access.guard.js';
import { TransportFailure } from './error.filter.js';
export const READINESS = Symbol('Readiness');
export interface Readiness { check(): Promise<void> }
@Controller('health')
@Access('public')
export class HealthController {
  constructor(@Inject(READINESS) private readonly readiness: Readiness) {}
  @Get('live')
  live() { return { status: 'ok' }; }
  @Get('ready')
  async ready() {
    try { await this.readiness.check(); return { status: 'ok' }; }
    catch { throw new TransportFailure(503, 'TEMPORARILY_UNAVAILABLE'); }
  }
}
