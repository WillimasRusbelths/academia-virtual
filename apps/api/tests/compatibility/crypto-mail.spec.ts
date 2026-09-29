import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { hash, verify, argon2id } from 'argon2';
import nodemailer from 'nodemailer';

test('Argon2id nativo aplica parámetros y rechaza una clave diferente', async () => {
  const password = randomUUID();
  const encoded = await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  // PHC permite distinto orden de parámetros; comprobar valores sin mostrar salt/hash.
  const [, algorithm, version, parameters] = encoded.split('$');
  expect(algorithm === 'argon2id' && version === 'v=19').toBe(true);
  expect(Object.fromEntries(parameters.split(',').map(pair => pair.split('='))))
    .toEqual({ m: '19456', t: '2', p: '1' });
  expect(await verify(encoded, password)).toBe(true);
  expect(await verify(encoded, randomUUID())).toBe(false);
});

test('SMTP local captura exclusivamente un mensaje ficticio en Mailpit', async () => {
  const subject = `V00-${randomUUID()}`;
  const transporter = nodemailer.createTransport({ host: '127.0.0.1', port: 1025, secure: false,
    ignoreTLS: true, connectionTimeout: 3000, socketTimeout: 5000, logger: false, debug: false });
  try {
    await transporter.sendMail({ from: 'academia@example.test', to: 'v00@example.test', subject, text: 'Prueba local sin secretos.' });
    const response = await fetch(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`subject:${subject}`)}`);
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.messages.some((message: {Subject:string}) => message.Subject === subject)).toBe(true);
  } finally { transporter.close(); }
});
