import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { TeachingDirectory } from '../users/public/teaching-directory.js';
import type { AcademicCommandWriter } from './infrastructure/offering-store.js';

export const ACADEMIC_COMMAND_WRITER = Symbol('AcademicCommandWriter');
export const ACADEMIC_TEACHING_DIRECTORY = Symbol('AcademicTeachingDirectory');

/** Composición de fundamentos reales. Los casos de uso y controladores llegan en sus
 * historias; no simular OfferingStore ni exponer el directorio interno por HTTP.
 */
@Module({})
export class AcademicOfferingModule {
  static forRoot(writer: AcademicCommandWriter, directory: TeachingDirectory): DynamicModule {
    return { module: AcademicOfferingModule, providers: [
      { provide: ACADEMIC_COMMAND_WRITER, useValue: writer },
      { provide: ACADEMIC_TEACHING_DIRECTORY, useValue: directory },
    ], exports: [ACADEMIC_COMMAND_WRITER, ACADEMIC_TEACHING_DIRECTORY] };
  }
}
