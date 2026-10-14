import { expect, test } from 'vitest';
import { readUserView } from './user-view';
const view={id:'00000000-0000-4000-8000-000000000001',name:'Persona sintética',email:'synthetic@example.test',
  role:'STUDENT',status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-10-14T00:00:00.000Z'};
test('acepta únicamente una identidad habilitada y la proyección permitida',()=>{expect(readUserView(view)).toEqual(view);expect(Object.isFrozen(readUserView(view))).toBe(true);});
for(const [name,change] of Object.entries({multirol:{role:['STUDENT','ADMIN']},coerción:{role:['STUDENT']},
  secreto:{token:'synthetic-value'},estado:{status:'DISABLED'},verificación:{emailVerified:false},provisional:{mustSetPassword:true},fecha:{createdAt:'invalid'}})) {
  test(`rechaza respuesta inválida: ${name}`,()=>{expect(()=>readUserView({...view,...change})).toThrow('No se pudo confirmar la sesión.');});
}
