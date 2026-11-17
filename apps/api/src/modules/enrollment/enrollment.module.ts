import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ENROLLMENT_PRICES } from './application/prices.js';
import type { EnrollmentPrices } from './application/prices.js';
import { ENROLLMENT_FOLLOW_UPS } from './application/follow-up.js';
import type { EnrollmentFollowUps } from './application/follow-up.js';
import { EnrollmentAdminController } from './entrypoints/http/admin.controller.js';
import { ReservationsController } from './entrypoints/http/reservations.controller.js';
import { OrdersController } from './entrypoints/http/orders.controller.js';
import { ENROLLMENT_QUERIES } from './application/queries.js';
import type { EnrollmentQueries } from './application/queries.js';
import { RESERVATION_ADMISSION } from './application/reserve.js';
import type { ReservationAdmission } from './application/reserve.js';
import { PAYMENT_GATEWAY,PAYMENT_CONFIGURATION,PAYMENT_ATTEMPTS } from './application/payments.js';
import type { PaymentAttempts,PaymentAttemptConfiguration } from './application/payments.js';
import type { PaymentGateway } from './public/payments.js';
import { EnrollmentError } from './public/errors.js';
import { EnrollmentsController } from './entrypoints/http/enrollments.controller.js';
import type { ExpirationWorker } from './infrastructure/expiration-scheduler.js';

export const RESERVATION_EXPIRATION_LIFECYCLE='RESERVATION_EXPIRATION_LIFECYCLE';

@Module({})
export class EnrollmentModule {
  static forRoot(prices:EnrollmentPrices,queries:EnrollmentQueries,admission:ReservationAdmission,followUps:EnrollmentFollowUps,
    payments?:(gateway:PaymentGateway,configuration:PaymentAttemptConfiguration)=>PaymentAttempts,expiration?:ExpirationWorker):DynamicModule {
    return {module:EnrollmentModule,controllers:[EnrollmentAdminController,ReservationsController,OrdersController,EnrollmentsController],
      exports:expiration?[RESERVATION_EXPIRATION_LIFECYCLE]:[],providers:[
      ...(expiration?[{provide:RESERVATION_EXPIRATION_LIFECYCLE,useValue:expiration}]:[]),
      {provide:PAYMENT_GATEWAY,useValue:null},{provide:PAYMENT_CONFIGURATION,useValue:null},
      {provide:PAYMENT_ATTEMPTS,inject:[PAYMENT_GATEWAY,PAYMENT_CONFIGURATION],useFactory:(gateway:PaymentGateway|null,configuration:PaymentAttemptConfiguration|null):PaymentAttempts=>{
        if(gateway&&configuration&&payments)return payments(gateway,configuration);
        // Sin contrato y configuración explícitos no se persiste intento ni se
        // interpreta una indisponibilidad como operación externa incierta.
        const unavailable=async():Promise<never>=>{throw new EnrollmentError({code:'TEMPORARILY_UNAVAILABLE'});};
        return {initiate:unavailable,recover:unavailable};
      }},
      {provide:ENROLLMENT_FOLLOW_UPS,useValue:followUps},
      {provide:ENROLLMENT_PRICES,useValue:prices},{provide:ENROLLMENT_QUERIES,useValue:queries},{provide:RESERVATION_ADMISSION,useValue:admission}]};
  }
}
