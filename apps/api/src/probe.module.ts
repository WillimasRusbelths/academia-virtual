import 'reflect-metadata';
import { Controller, Get, Injectable, Module } from '@nestjs/common';

// Esqueleto V00, sin reglas ni módulos de identidad.
@Injectable()
export class ProbeService {
  status(): string { return 'ok'; }
}

@Controller('health')
export class ProbeController {
  constructor(private readonly probe: ProbeService) {}
  @Get('live')
  live() { return { status: this.probe.status() }; }
}

@Module({ controllers: [ProbeController], providers: [ProbeService] })
export class ProbeModule {}
