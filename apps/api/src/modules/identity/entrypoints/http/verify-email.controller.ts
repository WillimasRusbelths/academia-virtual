import { Body,Controller,HttpCode,Inject,Post,SetMetadata } from '@nestjs/common';
import { VERIFY_EMAIL } from '../../application/verify-email.js';
import type { VerifyEmail } from '../../application/verify-email.js';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';

@Controller('api/v1/auth/verification')
export class VerifyEmailController {
  constructor(@Inject(VERIFY_EMAIL) private readonly verify:VerifyEmail){}
  @Post('confirm') @HttpCode(204) @SetMetadata(ACCESS_POLICY,'public')
  execute(@Body() body:unknown):Promise<void> {
    const input=strictDto(body,{token:value=>typeof value==='string'});
    return this.verify.execute({token:input.token});
  }
}
