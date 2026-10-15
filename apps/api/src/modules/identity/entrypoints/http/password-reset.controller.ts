import { Body,Controller,HttpCode,Inject,Post,Req,Res,SetMetadata } from '@nestjs/common';
import type { Request,Response } from 'express';
import { REQUEST_PASSWORD_RESET } from '../../application/request-password-reset.js';
import type { RequestPasswordReset } from '../../application/request-password-reset.js';
import { RESET_PASSWORD } from '../../application/reset-password.js';
import type { ResetPassword } from '../../application/reset-password.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';
import { SessionCookie } from '../../../../http/session-cookie.js';

@Controller('api/v1/auth/password')
export class PasswordResetController {
  constructor(@Inject(REQUEST_PASSWORD_RESET) private readonly requestReset:RequestPasswordReset,
    @Inject(RESET_PASSWORD) private readonly reset:ResetPassword,@Inject(SessionCookie) private readonly cookie:SessionCookie){}
  @Post('forgot') @HttpCode(202) @SetMetadata(ACCESS_POLICY,'public')
  async request(@Body() body:unknown,@Req() request:Request){
    const input=strictDto(body,{email:value=>typeof value==='string'});
    await this.requestReset.execute({email:input.email,origin:request.ip??request.socket.remoteAddress??''});
    return {data:{message:'Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.'}};
  }
  @Post('reset') @HttpCode(204) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Res({passthrough:true}) response:Response):Promise<void> {
    const input=strictDto(body,{token:value=>typeof value==='string',newPassword:value=>typeof value==='string'});
    await this.reset.execute({token:input.token,newPassword:input.newPassword});
    response.setHeader('Set-Cookie',this.cookie.clear());
  }
}
