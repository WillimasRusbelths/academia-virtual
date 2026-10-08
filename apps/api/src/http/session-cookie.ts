import type { Environment } from '../infrastructure/config/environment.js';

export class SessionCookie {
  readonly name: string;
  private readonly attributes: string;
  constructor(environment: Pick<Environment, 'appEnv' | 'appOrigin'>) {
    const origin = new URL(environment.appOrigin);
    const secure = origin.protocol === 'https:';
    if (!secure && (environment.appEnv === 'production' || environment.appEnv === 'demo'
      || origin.protocol !== 'http:' || origin.hostname !== 'localhost')) {
      throw new Error('Configuración de cookie insegura. Valores omitidos.');
    }
    this.name = secure ? '__Host-av_session' : 'av_session_dev';
    this.attributes = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  }
  read(header: string | undefined): string | null {
    if (!header) return null;
    const values = header.split(';').map((part) => part.trim())
      .filter((part) => part.slice(0, part.indexOf('=')) === this.name);
    if (values.length !== 1) return null;
    const value = values[0]!.slice(this.name.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  issue(secret: string): string {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('Credencial de sesión inválida.');
    return `${this.name}=${secret}; ${this.attributes}; Max-Age=28800`;
  }
  clear(): string { return `${this.name}=; ${this.attributes}; Max-Age=0`; }
}
