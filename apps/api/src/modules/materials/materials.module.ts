import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { MATERIALS_MANAGEMENT } from './application/management.js';
import type { MaterialsManagement } from './application/management.js';
import { MaterialsController, MATERIALS_RECEIVE_CONTENT, MATERIALS_READ_CONTENT } from './entrypoints/http/materials.controller.js';
import type { createContentReceiver } from './entrypoints/http/content-receiver.js';
import type { MaterialsReadContent } from './entrypoints/http/materials.controller.js';

@Module({})
export class MaterialsModule {
  static forRoot(management: MaterialsManagement, receiveContent: ReturnType<typeof createContentReceiver>, readContent: MaterialsReadContent): DynamicModule {
    return { module: MaterialsModule, controllers: [MaterialsController], providers: [
      { provide: MATERIALS_MANAGEMENT, useValue: management },
      { provide: MATERIALS_RECEIVE_CONTENT, useValue: receiveContent },
      { provide: MATERIALS_READ_CONTENT, useValue: readContent },
    ] };
  }
}
