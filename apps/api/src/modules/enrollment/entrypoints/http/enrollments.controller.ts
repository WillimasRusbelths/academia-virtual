import { Controller,Get,Inject,Param,Query,Req,SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { ENROLLMENT_QUERIES } from '../../application/queries.js';
import type { EnrollmentQueries } from '../../application/queries.js';
import { strictDto } from '../../../../http/transport.js';
import { found,id,page,read } from './input.js';
import type { EnrollmentRequest } from './input.js';

@Controller('api/v1/enrollment/enrollments')
@SetMetadata(ACCESS_POLICY,'enrollment:read-own')
export class EnrollmentsController {
  constructor(@Inject(ENROLLMENT_QUERIES) private readonly queries:EnrollmentQueries){}
  @Get()
  async list(@Req() request:EnrollmentRequest,@Query() query:unknown){read(request);return {data:await this.queries.enrollments(request.actor,page(query))};}
  @Get(':enrollmentId')
  async detail(@Req() request:EnrollmentRequest,@Param('enrollmentId') enrollmentId:string,@Query() query:unknown){
    read(request);strictDto(query,{});return {data:found(await this.queries.enrollment(request.actor,id(enrollmentId)))};
  }
}
