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
import { PostgresInitialPasswordStore } from './modules/identity/infrastructure/initial-password-store.js';
import { PostgresNameStore } from './modules/users/infrastructure/name-store.js';
import { PostgresAuditWriter } from './modules/audit/infrastructure/audit-writer.js';
import { PostgresAccountCreationStore } from './modules/identity/infrastructure/account-creation-store.js';
import { PostgresAccessChangeStore } from './modules/identity/infrastructure/access-change-store.js';
import { PostgresPasswordResetStore } from './modules/identity/infrastructure/password-reset-store.js';
import { AcademicOfferingModule } from './modules/academic-offering/academic-offering.module.js';
import { createAcademicCommandWriter, createPreparationStore, createPublicationStore, createLifecycleStore } from './modules/academic-offering/infrastructure/offering-store.js';
import { createAdministrativeQueries, createCatalogQueries, createTeachingQueries } from './modules/academic-offering/infrastructure/offering-queries.js';
import { PreparationCommands, PublicationCommands, LifecycleCommands } from './modules/academic-offering/application/commands.js';
import { PostgresTeachingDirectory } from './modules/users/infrastructure/teaching-directory.js';
import { createGroupCommitmentPolicy } from './modules/enrollment/infrastructure/commitments.js';
import { EnrollmentModule,RESERVATION_EXPIRATION_LIFECYCLE } from './modules/enrollment/enrollment.module.js';
import { createReservationExpiration } from './modules/enrollment/infrastructure/expiration-scheduler.js';
import type { ExpirationWorker } from './modules/enrollment/infrastructure/expiration-scheduler.js';
import { EnrollmentPrices } from './modules/enrollment/application/prices.js';
import { EnrollmentFollowUps } from './modules/enrollment/application/follow-up.js';
import { createEnrollmentPriceStore,createPaymentAttempts,createIncidentFollowUpStore } from './modules/enrollment/infrastructure/enrollment-store.js';
import { createCourseReferenceParticipant, createReservationOfferingParticipant } from './modules/academic-offering/infrastructure/reservation-participant.js';
import { createEnrollmentQueries } from './modules/enrollment/infrastructure/queries.js';
import { createReservationAdmission } from './modules/enrollment/infrastructure/admission.js';
import { createReservationDispatcher } from './modules/enrollment/infrastructure/dispatch.js';
import { createMaterialsTransaction } from './infrastructure/database/materials-transaction.js';
import { createMaterialsGroupParticipant } from './modules/academic-offering/infrastructure/materials-participant.js';
import { createMaterialsEnrollmentDiscovery, createMaterialsEnrollmentParticipant } from './modules/enrollment/infrastructure/materials-participant.js';
import { createMaterialsQueries } from './modules/materials/infrastructure/material-queries.js';
import { createTransferAdmission } from './modules/materials/infrastructure/transfer-admission.js';
import { validateMaterialFile } from './modules/materials/infrastructure/file-validation.js';
import { createMaterialsUploadIntents } from './modules/materials/application/uploads.js';
import { createMaterialsUploadStore } from './modules/materials/infrastructure/uploads.js';
import { createMaterialsCompletionStore } from './modules/materials/infrastructure/material-store.js';
import { createMaterialsCommands } from './modules/materials/application/commands.js';
import { createMaterialsCommandStore } from './modules/materials/infrastructure/commands.js';
import { createContentReceiver } from './modules/materials/entrypoints/http/content-receiver.js';
import { binaryMaterialUploadId } from './infrastructure/http/materials-contract.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { createMaterialsContentStore } from './modules/materials/infrastructure/content-store.js';

export const MATERIALS_FOUNDATION = 'MATERIALS_FOUNDATION';
/** Real materials capabilities, shared by the HTTP module and infrastructure probes. */
export function createMaterialsFoundation(environment: Environment, pool: Parameters<typeof createMaterialsTransaction>[0]) {
  const sessions = new PostgresSessionStore(pool);
  const run = createMaterialsTransaction(pool, { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) },
    client => createMaterialsGroupParticipant(client, new PostgresTeachingDirectory(client)),
    { discover: createMaterialsEnrollmentDiscovery, access: createMaterialsEnrollmentParticipant });
  const limits = environment.materials ?? { transferLimit: 2, actorTransferLimit: 1, uploadTimeoutMs: 60000 };
  const transfers = createTransferAdmission(limits);
  const uploads = createMaterialsUploadIntents(createMaterialsUploadStore(run), createMaterialsCompletionStore(run));
  return Object.freeze({ run, queries: createMaterialsQueries(run), transfers, limits, validateFile: validateMaterialFile, uploads,
    readContent: createMaterialsContentStore(run, transfers),
    commands: createMaterialsCommands(createMaterialsCommandStore(run)),
    receiveContent: createContentReceiver({ uploads, admission: transfers, timeoutMs: limits.uploadTimeoutMs, match: binaryMaterialUploadId }) });
}

export const RESERVATION_DISPATCH_LIFECYCLE='RESERVATION_DISPATCH_LIFECYCLE';

// Raíz de composición del único proceso. Los módulos funcionales se añadirán al necesitarlos.
@Module({})
export class AppModule {
  static forRoot(environment: Environment, database: Pick<ReturnType<typeof createDatabase>, 'pool' | 'close'>): DynamicModule {
    const rates = new PostgresRateStore(database.pool, environment.rateHmacKey);
    const sessions=new PostgresSessionStore(database.pool);const cookie=new SessionCookie(environment);
    const academicAuthorization = { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) };
    const dispatcher=createReservationDispatcher(database.pool,academicAuthorization,createReservationOfferingParticipant);
    const academicWriter = createAcademicCommandWriter(database.pool, academicAuthorization, { commitments: createGroupCommitmentPolicy });
    const mutations={authorization:sessions,audit:new PostgresAuditWriter()};
    const cipher=createPayloadCipher(environment);
    const links=new IssueActionLink(new PostgresActionTokenStore(database.pool),rates,accessSecrets,cipher,environment.appOrigin);
    const deliveries = new DeliverPending(new PostgresDeliveryStore(database.pool, rates),
      new PostgresDeliveryEligibility(database.pool), cipher, createSmtpTransport(environment));
    const materials = createMaterialsFoundation(environment, database.pool);
    return { module: AppModule,
      imports: [AuthorizationModule.forRoot(sessions,cookie),
        MaterialsModule.forRoot(materials, materials.receiveContent, materials.readContent),
        EnrollmentModule.forRoot(new EnrollmentPrices(createEnrollmentPriceStore(database.pool,academicAuthorization,createCourseReferenceParticipant)),
          createEnrollmentQueries(database.pool,academicAuthorization,createReservationOfferingParticipant),createReservationAdmission(database.pool,academicAuthorization),
          new EnrollmentFollowUps(createIncidentFollowUpStore(database.pool,academicAuthorization,createReservationOfferingParticipant)),
          (gateway,configuration)=>createPaymentAttempts(database.pool,academicAuthorization,createReservationOfferingParticipant,gateway,configuration),
          createReservationExpiration(database.pool,createReservationOfferingParticipant)),
        IdentityModule.forRoot(new PostgresLoginStore(database.pool),rates,sessions,cookie,
          new PostgresRegistrationStore(database.pool),links,new PostgresVerificationStore(database.pool),new PostgresInitialPasswordStore(database.pool),
          new PostgresAccountCreationStore(database.pool,mutations),new PostgresAccessChangeStore(database.pool,mutations),
          new PostgresPasswordResetStore(database.pool)),
        UsersModule.forRoot(new PostgresUserQueries(database.pool),
          new PostgresNameStore(database.pool,mutations)),
        AcademicOfferingModule.forRoot(academicWriter, new PostgresTeachingDirectory(database.pool), {
          commands: new PreparationCommands(createPreparationStore(database.pool, academicAuthorization, academicWriter)),
          queries: createAdministrativeQueries(database.pool, sessions),
          publication: new PublicationCommands(createPublicationStore(database.pool, academicAuthorization, academicWriter)),
          lifecycle: new LifecycleCommands(createLifecycleStore(database.pool, academicAuthorization, academicWriter)),
          catalog: createCatalogQueries(database.pool, sessions),
          teaching: createTeachingQueries(database.pool, sessions),
        })],
      controllers: [HealthController], providers: [
        { provide: MATERIALS_FOUNDATION, useValue: materials },
        { provide: 'SECURITY_LOG_LIFECYCLE', useValue: securityEvents },
        { provide: 'MAIL_DELIVERY_SCHEDULER', useValue: new DeliveryScheduler(deliveries) },
        { provide: RESERVATION_DISPATCH_LIFECYCLE, useValue: {
          onApplicationBootstrap: () => dispatcher.start(),
          // Nest completa esta fase antes de DATABASE_LIFECYCLE.onApplicationShutdown.
          beforeApplicationShutdown: () => dispatcher.stop(),
        } },
        { provide: READINESS, inject:[RESERVATION_EXPIRATION_LIFECYCLE],useFactory:(expiration:Partial<ExpirationWorker>)=>({
          async check() { expiration.assertHealthy?.();await database.pool.query('SELECT 1'); },
        }) },
        { provide: 'DATABASE_LIFECYCLE', useValue: { onApplicationShutdown: () => database.close() } },
      ] };
  }
}
