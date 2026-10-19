import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer as netServer } from 'node:net';
import type { Socket } from 'node:net';
import { createServer as tlsServer } from 'node:tls';
import { isDeepStrictEqual } from 'node:util';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConfigurationError, loadEnvironment } from '../../src/infrastructure/config/environment.js';
import type { Environment } from '../../src/infrastructure/config/environment.js';
import { MailPayloadInvalid, MailPayloadUnavailable, MailTransportFailure } from '../../src/modules/mail/application/delivery-ports.js';
import type { MailPayload } from '../../src/modules/mail/application/delivery-ports.js';
import { createPayloadCipher } from '../../src/modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport, smtpOptions } from '../../src/modules/mail/infrastructure/smtp-transport.js';
import { assertMailpitAvailable, mailpitOrigin } from '../support/mailpit.js';

afterEach(() => vi.restoreAllMocks());

const environment = loadEnvironment({ ...process.env, APP_ENV: 'test' });
const cipherConfig = () => ({ appOrigin: environment.appOrigin, mailPayloadKey: randomBytes(32), mailKeyId: 'test-mail-v1' });
const payload = (template: MailPayload['template'] = 'VERIFY_EMAIL'): MailPayload => ({
  recipient: `test-${randomUUID()}@example.test`, template,
  link: `${environment.appOrigin}/${template === 'VERIFY_EMAIL' ? 'verificar-correo' : 'restablecer'}#${randomBytes(32).toString('base64url')}`,
});
function production(port: 465 | 587 = 587): Environment {
  return { ...environment, appEnv: 'production', mailMode: 'smtp', appOrigin: 'https://academy.example.test',
    smtp: { host: 'smtp.example.test', port, secure: port === 465, requireTls: port === 587,
      user: 'fixture', password: randomUUID(), from: 'academy@sender.test' } };
}

describe('payload autenticado y limitado', () => {
  test.each(['VERIFY_EMAIL', 'RESET_PASSWORD'] as const)('AES-GCM conserva solo el payload de %s', template => {
    const config = cipherConfig(); const cipher = createPayloadCipher(config); const value = payload(template);
    const encrypted = cipher.encrypt(value);
    expect(isDeepStrictEqual(cipher.decrypt(encrypted), value)).toBe(true);
    expect(encrypted.nonce.length).toBe(12); expect(encrypted.authTag.length).toBe(16);
    expect(encrypted.keyId).toBe(config.mailKeyId);
    expect(Object.keys(encrypted).sort()).toEqual(['authTag', 'encryptedPayload', 'keyId', 'nonce']);
    expect(Buffer.from(encrypted.encryptedPayload).includes(Buffer.from(value.link))).toBe(false);
    expect(Buffer.from(encrypted.encryptedPayload).includes(config.mailPayloadKey)).toBe(false);
    expect(Buffer.from(cipher.encrypt(value).nonce).equals(Buffer.from(encrypted.nonce))).toBe(false);
  });

  test.each(['encryptedPayload', 'nonce', 'authTag', 'keyId', 'wrongKey'] as const)('rechaza alteración de %s sin filtrar contenido', field => {
    const config = cipherConfig(); const cipher = createPayloadCipher(config); const encrypted = cipher.encrypt(payload());
    if (field === 'wrongKey') {
      expect(() => createPayloadCipher({ ...config, mailPayloadKey: randomBytes(32) }).decrypt(encrypted)).toThrow(MailPayloadUnavailable);
    } else if (field === 'keyId') {
      expect(() => cipher.decrypt({ ...encrypted, keyId: 'other-key' })).toThrow(MailPayloadUnavailable);
    } else {
      const modified = Uint8Array.from(encrypted[field]); modified[0] ^= 1;
      expect(() => cipher.decrypt({ ...encrypted, [field]: modified })).toThrow(MailPayloadUnavailable);
    }
  });

  test('rechaza nonce/tag truncados y configuración sin clave de 32 bytes', () => {
    const config = cipherConfig(); const cipher = createPayloadCipher(config); const encrypted = cipher.encrypt(payload());
    expect(() => cipher.decrypt({ ...encrypted, nonce: new Uint8Array(11) })).toThrow(MailPayloadUnavailable);
    expect(() => cipher.decrypt({ ...encrypted, authTag: new Uint8Array(15) })).toThrow(MailPayloadUnavailable);
    expect(() => createPayloadCipher({ ...config, mailPayloadKey: randomBytes(31) })).toThrow(ConfigurationError);
  });

  test.each(['password', 'provisionalPassword', 'passwordHash', 'extra'])('no admite %s en el payload', field => {
    const value = { ...payload(), [field]: randomUUID() };
    expect(() => createPayloadCipher(cipherConfig()).encrypt(value)).toThrow(MailPayloadInvalid);
  });

  test('la lista permitida también se valida al descifrar datos autenticados', () => {
    const config = cipherConfig(); const nonce = randomBytes(12);
    const crypt = createCipheriv('aes-256-gcm', config.mailPayloadKey, nonce, { authTagLength: 16 });
    crypt.setAAD(Buffer.from(config.mailKeyId));
    const encryptedPayload = Buffer.concat([crypt.update(JSON.stringify({ ...payload(), password: randomUUID() })), crypt.final()]);
    expect(() => createPayloadCipher(config).decrypt({ nonce, encryptedPayload, authTag: crypt.getAuthTag(), keyId: config.mailKeyId }))
      .toThrow(MailPayloadUnavailable);
  });

  test('rechaza destinatarios múltiples, inyección, enlace externo, propósito y secreto en query', () => {
    const value = payload(); const cipher = createPayloadCipher(cipherConfig());
    const invalid = [ { ...value, recipient: 'a@example.test,b@example.test' },
      { ...value, recipient: 'a@example.test\r\nBcc: other@example.test' },
      { ...value, link: value.link.replace(environment.appOrigin, 'https://other.example.test') },
      { ...value, template: 'RESET_PASSWORD' as const },
      { ...value, link: `${environment.appOrigin}/verificar-correo?token=not-allowed` } ];
    for (const item of invalid) expect(() => cipher.encrypt(item)).toThrow(MailPayloadInvalid);
  });
});

describe('SMTP seguro y captura aislada', () => {
  test.each(['VERIFY_EMAIL', 'RESET_PASSWORD'] as const)('captura un enlace ficticio %s real en Mailpit sin envío externo', async template => {
    await assertMailpitAvailable(); const value = payload(template);
    await createSmtpTransport(environment).send(value);
    const response = await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`to:${value.recipient}`)}`);
    expect(response.ok).toBe(true);
    const data = await response.json() as { messages: Array<{ ID: string }> };
    expect(data.messages.length).toBe(1);
    const message = await fetch(`${mailpitOrigin}/api/v1/message/${data.messages[0].ID}`).then(r => r.json()) as { Text: string };
    expect(message.Text.includes(value.link)).toBe(true);
  });

  test('capture rechaza SMTP remoto y destinatario real antes de crear conexiones', async () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    expect(() => createSmtpTransport({ ...environment, smtp: { ...environment.smtp, host: 'smtp.example.test' } })).toThrow(ConfigurationError);
    expect(() => createSmtpTransport({ ...environment, mailMode: 'smtp' })).toThrow(ConfigurationError);
    await expect(createSmtpTransport(environment).send({ ...payload(), recipient: 'someone@example.com' })).rejects.toThrow(ConfigurationError);
    expect(spy).not.toHaveBeenCalled();
  });

  test('465 usa TLS implícito y 587 exige STARTTLS validado, sin logs ni fuentes remotas', () => {
    for (const port of [465, 587] as const) {
      const options = smtpOptions(production(port));
      expect(options.secure).toBe(port === 465); expect(options.requireTLS).toBe(port === 587);
      expect(options.tls?.rejectUnauthorized).toBe(true); expect(options.ignoreTLS).toBe(false);
      expect(options.opportunisticTLS).toBe(false); expect(options.logger).toBe(false); expect(options.debug).toBe(false);
      expect(options.disableFileAccess).toBe(true); expect(options.disableUrlAccess).toBe(true);
    }
    expect(() => smtpOptions({ ...production(), smtp: { ...production().smtp, requireTls: false } })).toThrow(ConfigurationError);
  });

  test('no envía AUTH ni mensaje si el servidor local rechaza STARTTLS', async () => {
    const commands: string[] = []; const sockets = new Set<Socket>();
    const server = netServer(socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.write('220 test.local ESMTP\r\n');
      socket.on('data', bytes => { const command = bytes.toString('utf8'); commands.push(command);
        socket.write(command.startsWith('EHLO') ? '250 test.local\r\n' : '500 TLS unavailable\r\n'); });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor de prueba inválido.');
    // Opciones productivas, redirigidas solo en esta prueba al servidor efímero local.
    const transport = nodemailer.createTransport({ ...smtpOptions(production()), host: '127.0.0.1', port: address.port });
    try {
      await expect(transport.verify()).rejects.toThrow();
      expect(commands.some(c => c.startsWith('STARTTLS'))).toBe(true);
      expect(commands.some(c => /^(AUTH|MAIL|RCPT|DATA)/.test(c))).toBe(false);
    } finally { transport.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  test('TLS implícito rechaza certificado autofirmado sin desactivar su validación', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mail-tls-'));
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'key'),
        '-out', path.join(directory, 'cert'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
      const server = tlsServer({ key: readFileSync(path.join(directory, 'key')), cert: readFileSync(path.join(directory, 'cert')) });
      server.on('tlsClientError', () => undefined);
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor de prueba inválido.');
      const transport = nodemailer.createTransport({ ...smtpOptions(production(465)), host: '127.0.0.1', port: address.port,
        tls: { rejectUnauthorized: true, servername: 'localhost' } });
      try { await expect(transport.verify()).rejects.toThrow(); }
      finally { transport.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test.each([
    [{ code: 'ETIMEDOUT' }, 'TIMEOUT'], [{ responseCode: 450 }, 'TEMPORARY'],
    [{ responseCode: 550 }, 'PERMANENT'], [{ code: 'EAUTH' }, 'PERMANENT'],
  ] as const)('clasifica fallo sin conservar respuesta remota (%j)', async (fields, expected) => {
    const remote = Object.assign(new Error(randomUUID()), fields); const close = vi.fn();
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: vi.fn().mockRejectedValue(remote), close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    try { await createSmtpTransport(environment).send(payload()); throw new Error('Se esperaba rechazo.'); }
    catch (error) {
      expect(error instanceof MailTransportFailure).toBe(true);
      expect((error as MailTransportFailure).kind).toBe(expected);
      expect((error as Error).message.includes(remote.message)).toBe(false);
      expect('cause' in (error as object)).toBe(false);
    }
    expect(close).toHaveBeenCalledOnce();
  });

  test('no declara éxito si SMTP no acepta al único destinatario', async () => {
    const close = vi.fn();
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ accepted: [], rejected: ['fixture@example.test'] }), close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await expect(createSmtpTransport(environment).send(payload())).rejects.toThrow(MailTransportFailure);
    expect(close).toHaveBeenCalledOnce();
  });
});
