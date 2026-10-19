import { Body, Controller, HttpCode, Inject, Post, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOGOUT } from '../../application/logout.js';
import type { Logout } from '../../application/logout.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { SessionCookie } from '../../../../http/session-cookie.js';
import { TransportFailure } from '../../../../http/error.filter.js';

@Controller('api/v1/auth')
export class LogoutController {
  constructor(@Inject(LOGOUT) private readonly logout:Logout,@Inject(SessionCookie) private readonly cookie:SessionCookie){}
  @Post('logout') @HttpCode(204) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Req() request:Request,@Res({passthrough:true}) response:Response):Promise<void> {
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length>0)throw new TransportFailure(400,'VALIDATION_ERROR');
    await this.logout.execute(this.cookie.read(request.headers.cookie));
    response.setHeader('Set-Cookie',this.cookie.clear());
  }
}
