import { randomBytes } from 'node:crypto';
import { expect,test } from 'vitest';
import { takeActionLink } from './action-link';

function address(hash:string) {
  const location={pathname:'/verificar-correo',hash,search:'?destino=externo'};
  const calls:unknown[][]=[];
  const history={replaceState(...args:unknown[]){calls.push(args);location.hash='';location.search='';}};
  return {take:()=>takeActionLink(location as Location,history as unknown as History),location,calls};
}
test('captura un secreto conforme al contrato una sola vez y retira fragmento, query e historial',()=>{
  const secret=randomBytes(32).toString('base64url');const a=address(`#${secret}`);
  expect(a.take()===secret).toBe(true);expect(a.location.hash.length+a.location.search.length).toBe(0);
  expect(a.calls).toEqual([[null,'','/verificar-correo']]);expect(a.take()).toBeNull();
});
for(const invalid of ['',`#token=${randomBytes(32).toString('base64url')}`,'#alterado'])test(`fragmento inválido ${invalid===''?'ausente':invalid.startsWith('#token=')?'con prefijo obsoleto':'mal formado'} se retira sin conservarlo`,()=>{
  const a=address(invalid);expect(a.take()).toBeNull();expect(a.location.hash.length+a.location.search.length).toBe(0);
  expect(a.calls).toEqual([[null,'','/verificar-correo']]);
});
