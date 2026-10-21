import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { TeachingDirectory } from '../users/public/teaching-directory.js';
import type { AcademicCommandWriter } from './infrastructure/offering-store.js';
import type { PreparationCommands } from './application/commands.js';
import type { AdministrativeReads } from './application/queries.js';

export const ACADEMIC_COMMAND_WRITER = Symbol('AcademicCommandWriter');
export const ACADEMIC_TEACHING_DIRECTORY = Symbol('AcademicTeachingDirectory');
export const ACADEMIC_PREPARATION_COMMANDS = Symbol('AcademicPreparationCommands');
export const ACADEMIC_ADMINISTRATIVE_QUERIES = Symbol('AcademicAdministrativeQueries');

/** Composición de fundamentos reales. Los casos de uso y controladores llegan en sus
 * historias; no simular OfferingStore ni exponer el directorio interno por HTTP.
 */
@Module({})
export class AcademicOfferingModule {
  static forRoot(writer: AcademicCommandWriter, directory: TeachingDirectory,
    preparation?: { readonly commands: PreparationCommands; readonly queries: AdministrativeReads }): DynamicModule {
    return { module: AcademicOfferingModule, providers: [
      { provide: ACADEMIC_COMMAND_WRITER, useValue: writer },
      { provide: ACADEMIC_TEACHING_DIRECTORY, useValue: directory },
      ...(preparation ? [
        { provide: ACADEMIC_PREPARATION_COMMANDS, useValue: preparation.commands },
        { provide: ACADEMIC_ADMINISTRATIVE_QUERIES, useValue: preparation.queries },
      ] : []),
    ], exports: [ACADEMIC_COMMAND_WRITER, ACADEMIC_TEACHING_DIRECTORY,
      ...(preparation ? [ACADEMIC_PREPARATION_COMMANDS, ACADEMIC_ADMINISTRATIVE_QUERIES] : [])] };
  }
}
