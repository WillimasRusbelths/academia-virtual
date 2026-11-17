import type { MaterialsReadQueries } from './queries.js';
import type { createMaterialsUploadIntents } from './uploads.js';
import type { createMaterialsCommands } from './commands.js';

export const MATERIALS_MANAGEMENT = Symbol('MaterialsManagement');
/** Implemented capabilities, supplied by the root; HTTP audience policies remain separate. */
export interface MaterialsManagement {
  readonly queries: MaterialsReadQueries;
  readonly uploads: ReturnType<typeof createMaterialsUploadIntents>;
  readonly commands: ReturnType<typeof createMaterialsCommands>;
}
