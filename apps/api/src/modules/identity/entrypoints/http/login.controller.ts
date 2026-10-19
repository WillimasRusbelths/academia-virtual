import { Body, Controller, HttpCode, Inject, Post, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOGIN } from '../../application/login.js';
import type { Login } from '../../application/login.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { SessionCookie } from '../../../../http/session-cookie.js';
import { strictDto } from '../../../../http/transport.js';

/** Forma del transporte; las reglas de credenciales y cuotas permanecen en aplicación/dominio. */
export function loginInput(value:unknown):{email:unknown;password:unknown} {
  const input=strictDto(value,{email:field=>typeof field==='string',password:field=>typeof field==='string'});
  return {email:input.email,password:input.password};
}
@Controller('api/v1/auth')
export class LoginController {
  constructor(@Inject(LOGIN) private readonly login:Login,@Inject(SessionCookie) private readonly cookie:SessionCookie){}
  @Post('login') @HttpCode(200) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Req() request:Request,@Res({passthrough:true}) response:Response) {
    const result=await this.login.execute({...loginInput(body),origin:request.ip??request.socket.remoteAddress??''});
    response.setHeader('Set-Cookie',this.cookie.issue(result.sessionSecret));
    return {data:result.user};
  }
}
