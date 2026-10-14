import { Body,Controller,HttpCode,Inject,Post,Req,SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { SET_INITIAL_PASSWORD } from '../../application/set-initial-password.js';
import type { SetInitialPassword } from '../../application/set-initial-password.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';

@Controller('api/v1/auth')
export class InitialPasswordController {
  constructor(@Inject(SET_INITIAL_PASSWORD) private readonly initial:SetInitialPassword){}
  @Post('password/initial') @HttpCode(204) @SetMetadata(ACCESS_POLICY,'public')
  async execute(@Body() body:unknown,@Req() request:Request):Promise<void> {
    const input=strictDto(body,{email:value=>typeof value==='string',provisionalPassword:value=>typeof value==='string',newPassword:value=>typeof value==='string'});
    await this.initial.execute({email:input.email,provisionalPassword:input.provisionalPassword,newPassword:input.newPassword,
      origin:request.ip??request.socket.remoteAddress??''});
  }
}
