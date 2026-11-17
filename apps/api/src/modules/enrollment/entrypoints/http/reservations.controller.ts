import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { ENROLLMENT_QUERIES } from '../../application/queries.js';
import type { EnrollmentQueries } from '../../application/queries.js';
import { RESERVATION_ADMISSION } from '../../application/reserve.js';
import type { ReservationAdmission } from '../../application/reserve.js';
import { strictDto } from '../../../../http/transport.js';
import { found, groupIds, id, page, read, uuid } from './input.js';
import type { EnrollmentRequest } from './input.js';

@Controller('api/v1/enrollment')
@SetMetadata(ACCESS_POLICY,'enrollment:reserve-own')
export class ReservationsController {
  constructor(@Inject(ENROLLMENT_QUERIES) private readonly queries:EnrollmentQueries,
    @Inject(RESERVATION_ADMISSION) private readonly admission:ReservationAdmission){}
  @Get('offerings')
  async offerings(@Req() request:EnrollmentRequest,@Query() query:unknown){read(request);return {data:await this.queries.offerings(request.actor,page(query,true))};}
  @Post('selection-preview')
  @HttpCode(200)
  async preview(@Req() request:EnrollmentRequest,@Body() body:unknown,@Query() query:unknown){
    strictDto(query,{});const input=strictDto(body,{groupIds});
    return {data:await this.queries.preview(request.actor,input.groupIds as string[])};
  }
  @Post('reservation-requests')
  @HttpCode(200)
  async reserve(@Req() request:EnrollmentRequest,@Body() body:unknown,@Query() query:unknown){
    strictDto(query,{});const input=strictDto(body,{intentionId:uuid,groupIds});
    return {data:await this.admission.admit(request.actor,{intentionId:id(input.intentionId as string),groupIds:input.groupIds as string[]},request.requestId!)};
  }
  @Get('reservation-requests')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-own')
  async requests(@Req() request:EnrollmentRequest,@Query() query:unknown){read(request);return {data:await this.queries.requests(request.actor,page(query))};}
  @Get('reservation-requests/:intentionId')
  @SetMetadata(ACCESS_POLICY,'enrollment:read-own')
  async request(@Req() request:EnrollmentRequest,@Param('intentionId') intentionId:string,@Query() query:unknown){
    read(request);strictDto(query,{});return {data:found(await this.queries.request(request.actor,id(intentionId)))};
  }
}
