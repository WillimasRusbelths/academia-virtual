import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LogoutController } from '../../dist/src/modules/identity/entrypoints/http/logout.controller.js';
import { MeController } from '../../dist/src/modules/users/entrypoints/http/me.controller.js';
import { Logout, LOGOUT } from '../../dist/src/modules/identity/application/logout.js';
import { GetMe, GET_ME } from '../../dist/src/modules/users/application/get-me.js';
import { PostgresUserQueries } from '../../dist/src/modules/users/infrastructure/user-queries.js';
import { PostgresSessionStore } from '../../dist/src/modules/identity/infrastructure/session-store.js';
import { AuthorizationModule } from '../../dist/src/modules/authorization/authorization.module.js';
import { SessionCookie } from '../../dist/src/http/session-cookie.js';
import { configureTransport } from '../../dist/src/http/transport.js';
import type { Us1Dataset } from './us1-http.js';

/** Monta exclusivamente controladores de producción T035/T036; no simula login ni altera AppModule. */
export async function implementedHttp(data:Us1Dataset,origin=data.context.environment.appOrigin) {
  const environment={...data.context.environment,appOrigin:origin};const cookie=new SessionCookie(environment);
  const sessions=new PostgresSessionStore(data.context.database.pool);
  const module=await Test.createTestingModule({imports:[AuthorizationModule.forRoot(sessions,cookie)],
    controllers:[LogoutController,MeController],providers:[{provide:SessionCookie,useValue:cookie},
      {provide:LOGOUT,useValue:new Logout(sessions)},{provide:GET_ME,useValue:new GetMe(new PostgresUserQueries(data.context.database.pool))}]}).compile();
  const app=module.createNestApplication<NestExpressApplication>({logger:false,bodyParser:false});
  configureTransport(app,environment);await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  return {app,origin,cookie,
    get(secret?:string,query='',extra:Record<string,string>={}) {return fetch(`${url}/api/v1/me${query}`,
      {headers:{...(secret?{cookie:`${cookie.name}=${secret}`} :{}),...extra}});},
    logout(secret?:string,body:unknown={},headers:Record<string,string>={}) {
      return fetch(`${url}/api/v1/auth/logout`,{method:'POST',headers:{'content-type':'application/json',origin,'x-csrf-protection':'1',
        ...(secret?{cookie:`${cookie.name}=${secret}`} :{}),...headers},body:JSON.stringify(body)});
    },
    close(){return app.close();},
  };
}
