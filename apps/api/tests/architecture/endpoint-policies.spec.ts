import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA,PATH_METADATA } from '@nestjs/common/constants.js';
import { expect,test } from 'vitest';
import { ACCESS_POLICY } from '../../src/modules/authorization/public/session.js';

function controllers(directory:string):string[] {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?controllers(path.join(directory,entry.name))
    :entry.name.endsWith('.controller.js')?[path.join(directory,entry.name)]:[]);
}
test('T088: todos los endpoints compilados tienen la política explícita de su contrato',async()=>{
  const routes:Record<string,string>={};
  for(const filename of controllers(fileURLToPath(new URL('../../dist/src/',import.meta.url)))) {
    const exports=await import(pathToFileURL(filename).href);
    for(const target of Object.values(exports)) {
      if(typeof target!=='function'||!Reflect.hasMetadata(PATH_METADATA,target))continue;
      for(const name of Object.getOwnPropertyNames(target.prototype).filter(value=>value!=='constructor')) {
        const handler=target.prototype[name];if(typeof handler!=='function')continue;
        const method=Reflect.getMetadata(METHOD_METADATA,handler) as RequestMethod|undefined;if(method===undefined)continue;
        const prefix=Reflect.getMetadata(PATH_METADATA,target) as string;
        const suffix=Reflect.getMetadata(PATH_METADATA,handler) as string;
        const route=(prefix+'/'+suffix).replace(/\/+/g,'/').replace(/\/$/,'');
        const key=RequestMethod[method]+' /'+route.replace(/^\//,'');
        expect(Object.hasOwn(routes,key)).toBe(false);
        routes[key]=Reflect.getMetadata(ACCESS_POLICY,handler)??Reflect.getMetadata(ACCESS_POLICY,target);
      }
    }
  }
  expect(routes).toEqual({
    'GET /health/live':'public','GET /health/ready':'public',
    'POST /api/v1/auth/login':'public','POST /api/v1/auth/logout':'public',
    'POST /api/v1/auth/register':'public','POST /api/v1/auth/verification/request':'public',
    'POST /api/v1/auth/verification/confirm':'public','POST /api/v1/auth/password/initial':'public',
    'POST /api/v1/auth/password/forgot':'public','POST /api/v1/auth/password/reset':'public',
    'GET /api/v1/me':'profile:read','GET /api/v1/admin/users':'users:manage',
    'GET /api/v1/admin/users/:id':'users:manage','POST /api/v1/admin/users':'users:manage',
    'PATCH /api/v1/admin/users/:id/name':'users:manage','PUT /api/v1/admin/users/:id/role':'users:manage',
    'PUT /api/v1/admin/users/:id/status':'users:manage',
  });
});
