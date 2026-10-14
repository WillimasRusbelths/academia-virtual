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
import type { PasswordCredentials } from './application/credentials.js';
import { REGISTER_STUDENT,RegisterStudent } from './application/register-student.js';
import type { RegistrationStore } from './application/register-student.js';
import type { IssueActionLink } from './application/issue-action-link.js';
import { VERIFY_EMAIL,VerifyEmail } from './application/verify-email.js';
import type { VerificationStore } from './application/verify-email.js';
import { RegisterController } from './entrypoints/http/register.controller.js';
import { VerifyEmailController } from './entrypoints/http/verify-email.controller.js';
import { REQUEST_VERIFICATION,RequestVerification } from './application/request-verification.js';
import { RequestVerificationController } from './entrypoints/http/request-verification.controller.js';
import { SET_INITIAL_PASSWORD,SetInitialPassword } from './application/set-initial-password.js';
import type { InitialPasswordStore } from './application/set-initial-password.js';
import { InitialPasswordController } from './entrypoints/http/initial-password.controller.js';

const PASSWORD_CREDENTIALS=Symbol('PasswordCredentials');

@Module({})
export class IdentityModule {
  static forRoot(store:LoginStore,limits:LoginLimits,sessions:SessionRepository,cookie:SessionCookie,
    registration:RegistrationStore,links:IssueActionLink,verification:VerificationStore,initial:InitialPasswordStore):DynamicModule {
    return {module:IdentityModule,controllers:[LoginController,LogoutController,RegisterController,VerifyEmailController,RequestVerificationController,InitialPasswordController],providers:[
      {provide:PASSWORD_CREDENTIALS,useFactory:()=>createPasswordCredentials()},
      {provide:LOGIN,useFactory:(credentials:PasswordCredentials)=>new Login(store,credentials,accessSecrets,limits),inject:[PASSWORD_CREDENTIALS]},
      {provide:REGISTER_STUDENT,useFactory:(credentials:PasswordCredentials)=>new RegisterStudent(registration,credentials,links),inject:[PASSWORD_CREDENTIALS]},
      {provide:VERIFY_EMAIL,useValue:new VerifyEmail(verification,accessSecrets)},
      {provide:REQUEST_VERIFICATION,useValue:new RequestVerification(links)},
      {provide:SET_INITIAL_PASSWORD,useFactory:(credentials:PasswordCredentials)=>new SetInitialPassword(initial,credentials,limits),inject:[PASSWORD_CREDENTIALS]},
      {provide:LOGOUT,useValue:new Logout(sessions)},{provide:SessionCookie,useValue:cookie},
    ]};
  }
}
