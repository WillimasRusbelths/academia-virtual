import { expect, test } from 'vitest';
import { createDisabledClassVideo } from './video-disabled.js';
test('authorized unconfigured video returns only status, without provider credentials or playback', async () => {
  let active = true;
  const assertActive = () => { if (!active) throw new Error('expired'); };
  const value = createDisabledClassVideo({ assertActive, use: async operation => { assertActive(); return operation(); } });
  expect(await value.access()).toEqual({ status: 'NOT_CONFIGURED' });
  active = false; await expect(value.access()).rejects.toThrow('expired');
});
