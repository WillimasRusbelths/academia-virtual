import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { ENROLLMENT_PRICES, validPriceAmount, validPriceRevision } from '../../application/prices.js';
import type { EnrollmentPrices } from '../../application/prices.js';
import { EnrollmentError } from '../../public/errors.js';
import { strictDto } from '../../../../http/transport.js';
import type { HttpRequest } from '../../../../http/error.filter.js';
import { ENROLLMENT_QUERIES } from '../../application/queries.js';
import type { EnrollmentQueries } from '../../application/queries.js';
import { ENROLLMENT_FOLLOW_UPS } from '../../application/follow-up.js';
import type { EnrollmentFollowUps } from '../../application/follow-up.js';
import { found,id,page,read } from './input.js';

interface Request extends Omit<HttpRequest,'actor'> { actor:SessionActor; body?:unknown }
const uuid=(value:unknown)=>typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Guarda global primero; store reautoriza cada lectura/escritura/replay en primaria. */
@Controller('api/v1/admin/enrollment')
@SetMetadata(ACCESS_POLICY,'enrollment:price-manage')
export class EnrollmentAdminController {
  constructor(@Inject(ENROLLMENT_PRICES) private readonly prices:EnrollmentPrices,
    @Inject(ENROLLMENT_QUERIES) private readonly queries:EnrollmentQueries,
    @Inject(ENROLLMENT_FOLLOW_UPS) private readonly followUps:EnrollmentFollowUps){}
  @Get('orders')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-all')
  async orders(@Req() request:Request,@Query() query:unknown){
    read(request);const input=strictDto(query,{page:()=>true,pageSize:()=>true,studentId:value=>value===undefined||uuid(value)});
    const pagination=page({page:input.page,pageSize:input.pageSize});
    return {data:await this.queries.adminOrders(request.actor,{...pagination,...(input.studentId===undefined?{}:{studentId:id(input.studentId as string)})})};
  }
  @Get('orders/:orderId')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-all')
  async order(@Req() request:Request,@Param('orderId') orderId:string,@Query() query:unknown){
    read(request);strictDto(query,{});return {data:found(await this.queries.adminOrder(request.actor,id(orderId)))};
  }
  @Get('incidents')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-all')
  async incidents(@Req() request:Request,@Query() query:unknown){read(request);return {data:await this.queries.incidents(request.actor,page(query))};}
  @Get('incidents/:incidentId')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-all')
  async incident(@Req() request:Request,@Param('incidentId') incidentId:string,@Query() query:unknown){
    read(request);strictDto(query,{});return {data:found(await this.queries.incident(request.actor,id(incidentId)))};
  }
  @Post('incidents/:incidentId/follow-ups')
  @HttpCode(200)
  @SetMetadata(ACCESS_POLICY,'enrollment:incident-follow-up')
  async followUp(@Req() request:Request,@Param('incidentId') incidentId:string,@Body() body:unknown,@Query() query:unknown){
    strictDto(query,{});const input=strictDto(body,{commandId:uuid,content:value=>typeof value==='string'&&Boolean(value.trim())});
    request.commandId=id(input.commandId as string);
    return {data:await this.followUps.append(request.actor,id(incidentId),{commandId:request.commandId,content:input.content as string},request.requestId!)};
  }
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
