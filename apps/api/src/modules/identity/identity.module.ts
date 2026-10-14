import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { LOGIN, Login } from './application/login.js';
import type { LoginStore, LoginLimits } from './application/login.js';
import { LOGOUT, Logout } from './application/logout.js';
import type { SessionRepository } from '../authorization/public/session.js';
import { createPasswordCredentials, accessSecrets } from './infrastructure/credentials.js';
import { LoginController } from './entrypoints/http/login.controller.js';
import { LogoutController } from './entrypoints/http/logout.controller.js';
import { SessionCookie } from '../../http/session-cookie.js';

@Module({})
export class IdentityModule {
  static forRoot(store:LoginStore,limits:LoginLimits,sessions:SessionRepository,cookie:SessionCookie):DynamicModule {
    return {module:IdentityModule,controllers:[LoginController,LogoutController],providers:[
      {provide:LOGIN,useFactory:async()=>new Login(store,await createPasswordCredentials(),accessSecrets,limits)},
      {provide:LOGOUT,useValue:new Logout(sessions)},{provide:SessionCookie,useValue:cookie},
    ]};
  }
}
