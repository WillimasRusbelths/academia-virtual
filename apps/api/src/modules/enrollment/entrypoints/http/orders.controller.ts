import { Body,Controller,Get,HttpCode,Inject,Param,Post,Query,Req,SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { ENROLLMENT_QUERIES } from '../../application/queries.js';
import type { EnrollmentQueries } from '../../application/queries.js';
import { strictDto } from '../../../../http/transport.js';
import { found, id, page, read,uuid } from './input.js';
import type { EnrollmentRequest } from './input.js';
import { PAYMENT_ATTEMPTS } from '../../application/payments.js';
import type { PaymentAttempts } from '../../application/payments.js';

@Controller('api/v1/enrollment/orders')
@SetMetadata(ACCESS_POLICY,'enrollment:read-own')
export class OrdersController {
  constructor(@Inject(ENROLLMENT_QUERIES) private readonly queries:EnrollmentQueries,
    @Inject(PAYMENT_ATTEMPTS) private readonly payments:PaymentAttempts){}
  @Post(':orderId/payment-attempts')
  @HttpCode(200)
  @SetMetadata(ACCESS_POLICY,'enrollment:pay-own')
  async pay(@Req() request:EnrollmentRequest,@Param('orderId') orderId:string,@Body() body:unknown,@Query() query:unknown){
    strictDto(query,{});const input=strictDto(body,{initiationId:uuid});
    const result=await this.payments.initiate(request.actor,{orderId:id(orderId),initiationId:id(input.initiationId as string)},request.requestId!);
    return {data:{id:result.id,state:result.state}};
  }
  @Get()
  async orders(@Req() request:EnrollmentRequest,@Query() query:unknown){read(request);return {data:await this.queries.orders(request.actor,page(query))};}
  @Get('current')
  async current(@Req() request:EnrollmentRequest,@Query() query:unknown){read(request);strictDto(query,{});return {data:await this.queries.currentOrder(request.actor)};}
  @Get(':orderId')
  async order(@Req() request:EnrollmentRequest,@Param('orderId') orderId:string,@Query() query:unknown){
    read(request);strictDto(query,{});return {data:found(await this.queries.order(request.actor,id(orderId)))};
  }
}
