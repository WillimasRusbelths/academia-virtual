import { describe, expect, test } from 'vitest';
import { acceptsVerifiedLogin } from './login.js';
import type { AccountAccess } from './access.js';

describe('revalidación de una credencial comprobada',()=>{
  const account:AccountAccess={status:'ACTIVE',emailCanonical:'synthetic@example.test',emailVerifiedAt:new Date(0),
    mustSetPassword:false,passwordHash:'synthetic-hash-never-a-real-credential',authVersion:0n,createdAt:new Date(0)};
  test('misma credencial y versión habilitadas',()=>{expect(acceptsVerifiedLogin(account,{...account})).toBe(true);});
  for(const [name,change] of Object.entries({estado:{status:'DISABLED'},correo:{emailCanonical:'other@example.test'},
    verificación:{emailVerifiedAt:null},contraseña:{passwordHash:'changed-synthetic-hash'},versión:{authVersion:1n},provisional:{mustSetPassword:true}})) {
    test(`rechaza cambio de ${name}`,()=>{expect(acceptsVerifiedLogin(account,{...account,...change} as AccountAccess)).toBe(false);});
  }
});
