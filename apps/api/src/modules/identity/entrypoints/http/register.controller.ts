import { Body,Controller,HttpCode,Inject,Post,Req,SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { REGISTER_STUDENT } from '../../application/register-student.js';
import type { RegisterStudent } from '../../application/register-student.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';

@Controller('api/v1/auth')
export class RegisterController {
  constructor(@Inject(REGISTER_STUDENT) private readonly register:RegisterStudent){}
  @Post('register') @HttpCode(202) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Req() request:Request) {
    const input=strictDto(body,{name:value=>typeof value==='string',email:value=>typeof value==='string',password:value=>typeof value==='string'});
    await this.register.execute({name:input.name,email:input.email,password:input.password,origin:request.ip??request.socket.remoteAddress??''});
    return {data:{message:'Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.'}};
  }
}
