import type { ClassVideoAccess } from '../public/classes.js';

/** Called only inside the already authorized transaction. No provider, URL,
 * token or network call. Its capability is invalid after that transaction. */
export function createDisabledClassVideo(scope: { assertActive(): void; use<T>(operation: () => Promise<T>): Promise<T> }) {
  return Object.freeze({ async access(): Promise<ClassVideoAccess> {
    scope.assertActive();
    return scope.use(async () => Object.freeze({ status: 'NOT_CONFIGURED' as const }));
  } });
}
