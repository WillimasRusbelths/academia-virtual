import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { GET_ME, GetMe } from './application/get-me.js';
import type { UserQueries } from './application/get-me.js';
import { MeController } from './entrypoints/http/me.controller.js';
import { LIST_USERS, ListUsers } from './application/list-users.js';
import type { AdministrativeUserQueries } from './application/list-users.js';
import { GET_USER, GetUser } from './application/get-user.js';
import { CHANGE_NAME, ChangeName } from './application/change-name.js';
import type { NameStore } from './application/change-name.js';
import { AdminQueriesController } from './entrypoints/http/admin-queries.controller.js';
import { ChangeNameController } from './entrypoints/http/change-name.controller.js';

@Module({})
export class UsersModule {
  static forRoot(queries:UserQueries&AdministrativeUserQueries,names:NameStore):DynamicModule {
    return {module:UsersModule,controllers:[MeController,AdminQueriesController,ChangeNameController],providers:[
      {provide:GET_ME,useValue:new GetMe(queries)},{provide:LIST_USERS,useValue:new ListUsers(queries)},
      {provide:GET_USER,useValue:new GetUser(queries)},{provide:CHANGE_NAME,useValue:new ChangeName(names)},
    ]};
  }
}
