import nodemailer from 'nodemailer';
import { Socket } from 'node:net';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { ConfigurationError } from '../../../infrastructure/config/environment.js';
import type { Environment } from '../../../infrastructure/config/environment.js';
import { MailTransportFailure, validateMailPayload } from '../application/delivery-ports.js';
import type { Mailer } from '../application/delivery-ports.js';

/** Revalida las condiciones esenciales incluso si el llamador no usó el cargador. */
export function smtpOptions(environment: Environment): SMTPTransport.Options {
  const { smtp, mailMode, appEnv } = environment;
  const local = appEnv === 'development' || appEnv === 'test';
  if (local ? mailMode !== 'capture' || smtp.host !== 'mailpit' || smtp.port !== 1025
      || smtp.secure || smtp.requireTls || smtp.user || smtp.password || !smtp.from.endsWith('@example.test')
    : mailMode !== 'smtp' || smtp.host === 'mailpit' || !smtp.user || !smtp.password
      || !((smtp.port === 465 && smtp.secure) || (smtp.port === 587 && !smtp.secure && smtp.requireTls))) {
    throw new ConfigurationError('transporte de correo');
  }
  return { host: smtp.host, port: smtp.port, secure: smtp.secure, requireTLS: smtp.requireTls,
    ignoreTLS: local, opportunisticTLS: false, tls: { rejectUnauthorized: true },
    auth: local ? undefined : { user: smtp.user!, pass: smtp.password! },
    connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 20_000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true };
}

function failure(error: unknown): MailTransportFailure {
  const info = error && typeof error === 'object' ? error as { code?: unknown; responseCode?: unknown } : {};
  const kind = info.code === 'ETIMEDOUT' ? 'TIMEOUT'
    : typeof info.responseCode === 'number' && info.responseCode >= 500 && info.responseCode < 600 ? 'PERMANENT'
      : ['EAUTH', 'ETLS'].includes(String(info.code)) ? 'PERMANENT' : 'TEMPORARY';
  return new MailTransportFailure(kind);
}

export function createSmtpTransport(environment: Environment): Mailer {
  const options = smtpOptions(environment);
  return {
    async send(payload, signal) {
      const data = validateMailPayload(payload, environment.appOrigin);
      if (environment.mailMode === 'capture' && !data.recipient.endsWith('@example.test')) {
        throw new ConfigurationError('destinatario de captura');
      }
      // Una conexión por envío: sin pool ni mensajes en memoria tras la operación.
      if (signal?.aborted) throw new MailTransportFailure('TIMEOUT');
      // Socket propio, aún sin conectar: Nodemailer conserva DNS, STARTTLS y TLS validado.
      // Destruirlo cancela también la conexión TLS construida sobre este mismo socket.
      const socket = new Socket();
      socket.on('error', () => undefined);
      const abort = () => socket.destroy();
      signal?.addEventListener('abort', abort, { once: true });
      const transportOptions = { ...options, socket };
      const transport = nodemailer.createTransport(transportOptions);
      try {
        const verification = data.template === 'VERIFY_EMAIL';
        const result = await transport.sendMail({ from: environment.smtp.from, to: data.recipient,
          subject: verification ? 'Verifica tu correo en Academia Virtual' : 'Recupera tu acceso a Academia Virtual',
          text: `${verification ? 'Confirma tu correo' : 'Restablece tu contraseña'}: ${data.link}`,
          disableFileAccess: true, disableUrlAccess: true });
        if (result.accepted.length !== 1 || result.rejected.length !== 0) throw new MailTransportFailure('PERMANENT');
      } catch (error) {
        if (signal?.aborted) throw new MailTransportFailure('TIMEOUT');
        if (error instanceof MailTransportFailure) throw error;
        throw failure(error);
      } finally { signal?.removeEventListener('abort', abort); socket.destroy(); transport.close(); }
    },
  };
}
