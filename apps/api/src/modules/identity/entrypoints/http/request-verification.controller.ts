import { Body,Controller,HttpCode,Inject,Post,Req,SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { REQUEST_VERIFICATION } from '../../application/request-verification.js';
import type { RequestVerification } from '../../application/request-verification.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';

@Controller('api/v1/auth')
export class RequestVerificationController {
  constructor(@Inject(REQUEST_VERIFICATION) private readonly verification:RequestVerification){}
  @Post('verification/request') @HttpCode(202) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Req() request:Request) {
    const input=strictDto(body,{email:value=>typeof value==='string'});
    await this.verification.execute({email:input.email,origin:request.ip??request.socket.remoteAddress??''});
    return {data:{message:'Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.'}};
  }
}
