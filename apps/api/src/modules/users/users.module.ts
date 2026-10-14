import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { GET_ME, GetMe } from './application/get-me.js';
import type { UserQueries } from './application/get-me.js';
import { MeController } from './entrypoints/http/me.controller.js';

@Module({})
export class UsersModule {
  static forRoot(queries:UserQueries):DynamicModule {
    return {module:UsersModule,controllers:[MeController],providers:[{provide:GET_ME,useValue:new GetMe(queries)}]};
  }
}
