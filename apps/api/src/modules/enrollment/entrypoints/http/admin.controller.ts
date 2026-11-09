import { Body, Controller, Get, Inject, Param, Put, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { ENROLLMENT_PRICES, validPriceAmount, validPriceRevision } from '../../application/prices.js';
import type { EnrollmentPrices } from '../../application/prices.js';
import { EnrollmentError } from '../../public/errors.js';
import { strictDto } from '../../../../http/transport.js';
import type { HttpRequest } from '../../../../http/error.filter.js';

interface Request extends Omit<HttpRequest,'actor'> { actor:SessionActor; body?:unknown }
const uuid=(value:unknown)=>typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Guarda global primero; store reautoriza cada lectura/escritura/replay en primaria. */
@Controller('api/v1/admin/enrollment')
@SetMetadata(ACCESS_POLICY,'enrollment:price-manage')
export class EnrollmentAdminController {
  constructor(@Inject(ENROLLMENT_PRICES) private readonly prices:EnrollmentPrices){}
  @Get('courses/:courseId/price')
  async price(@Req() request:Request,@Param('courseId') courseId:string,@Query() query:unknown){
    strictDto(query,{});
    if(request.body!==undefined)throw new EnrollmentError({code:'VALIDATION_ERROR'});
    return {data:await this.prices.read(request.actor,courseId)};
  }
  @Put('courses/:courseId/price')
  async setPrice(@Req() request:Request,@Param('courseId') courseId:string,@Body() body:unknown,@Query() query:unknown){
    strictDto(query,{});
    const input=strictDto(body,{commandId:uuid,expectedRevision:validPriceRevision,amountMinor:validPriceAmount,currency:value=>value==='PEN'});
    request.commandId=(input.commandId as string).toLowerCase();
    return {data:await this.prices.set(request.actor,courseId,{commandId:request.commandId,expectedRevision:input.expectedRevision as string|null,
      amountMinor:input.amountMinor as string,currency:'PEN'},request.requestId!)};
  }
}
