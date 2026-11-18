import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { CLASSES_MANAGEMENT } from './application/commands.js';
import type { ClassesManagement } from './application/commands.js';
import { ClassesController } from './entrypoints/http/classes.controller.js';

@Module({})
export class ClassesModule {
  static forRoot(management: ClassesManagement): DynamicModule {
    return { module: ClassesModule, controllers: [ClassesController], providers: [{ provide: CLASSES_MANAGEMENT, useValue: management }] };
  }
}
