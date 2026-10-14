import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Environment } from './infrastructure/config/environment.js';
import type { createDatabase } from './infrastructure/database/database.js';
import { PostgresSessionStore } from './modules/identity/infrastructure/session-store.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { SessionCookie } from './http/session-cookie.js';
import { HealthController, READINESS } from './http/health.controller.js';
import { PostgresRateStore } from './infrastructure/limits/rate-store.js';
import { PostgresDeliveryEligibility } from './modules/identity/infrastructure/delivery-eligibility.js';
import { DeliverPending } from './modules/mail/application/deliver-pending.js';
import { PostgresDeliveryStore } from './modules/mail/infrastructure/delivery-store.js';
import { DeliveryScheduler } from './modules/mail/infrastructure/delivery-scheduler.js';
import { createPayloadCipher } from './modules/mail/infrastructure/payload-cipher.js';
import { createSmtpTransport } from './modules/mail/infrastructure/smtp-transport.js';
import { securityEvents } from './infrastructure/logging/security-events.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { PostgresLoginStore } from './modules/identity/infrastructure/login-store.js';
import { UsersModule } from './modules/users/users.module.js';
import { PostgresUserQueries } from './modules/users/infrastructure/user-queries.js';
import { IssueActionLink } from './modules/identity/application/issue-action-link.js';
import { accessSecrets } from './modules/identity/infrastructure/credentials.js';
import { PostgresActionTokenStore } from './modules/identity/infrastructure/action-token-store.js';
import { PostgresRegistrationStore } from './modules/identity/infrastructure/registration-store.js';
import { PostgresVerificationStore } from './modules/identity/infrastructure/verification-store.js';

// Raíz de composición del único proceso. Los módulos funcionales se añadirán al necesitarlos.
@Module({})
export class AppModule {
  static forRoot(environment: Environment, database: ReturnType<typeof createDatabase>): DynamicModule {
    const rates = new PostgresRateStore(database.pool, environment.rateHmacKey);
    const sessions=new PostgresSessionStore(database.pool);const cookie=new SessionCookie(environment);
    const cipher=createPayloadCipher(environment);
    const links=new IssueActionLink(new PostgresActionTokenStore(database.pool),rates,accessSecrets,cipher,environment.appOrigin);
    const deliveries = new DeliverPending(new PostgresDeliveryStore(database.pool, rates),
      new PostgresDeliveryEligibility(database.pool), cipher, createSmtpTransport(environment));
    return { module: AppModule,
      imports: [AuthorizationModule.forRoot(sessions,cookie),
        IdentityModule.forRoot(new PostgresLoginStore(database.pool),rates,sessions,cookie,
          new PostgresRegistrationStore(database.pool),links,new PostgresVerificationStore(database.pool)),
        UsersModule.forRoot(new PostgresUserQueries(database.pool))],
      controllers: [HealthController], providers: [
        { provide: 'SECURITY_LOG_LIFECYCLE', useValue: securityEvents },
        { provide: 'MAIL_DELIVERY_SCHEDULER', useValue: new DeliveryScheduler(deliveries) },
        { provide: READINESS, useValue: { async check() { await database.pool.query('SELECT 1'); } } },
        { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => database.close() } },
      ] };
  }
}
