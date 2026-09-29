import 'reflect-metadata';
import { expect, test } from 'vitest';
import { Test } from '@nestjs/testing';
// Importar salida de tsc comprueba metadatos reales, no la transformación del runner.
import { ProbeModule, ProbeController, ProbeService } from '../../dist/src/probe.module.js';

test('Nest construye controlador/provider compilados y responde por HTTP', async () => {
  expect(Reflect.getMetadata('design:paramtypes', ProbeController)).toEqual([ProbeService]);
  const module = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/health/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  } finally { await app.close(); }
});
