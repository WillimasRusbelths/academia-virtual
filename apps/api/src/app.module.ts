import { Module } from '@nestjs/common';
import { ProbeModule } from './probe.module.js';

// Raíz de composición del único proceso. Los módulos funcionales se añadirán al necesitarlos.
@Module({ imports: [ProbeModule] })
export class AppModule {}
