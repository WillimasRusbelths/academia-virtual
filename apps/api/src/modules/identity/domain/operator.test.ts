import { expect,test } from 'vitest';
import { requireOperatorRef,InvalidOperatorRef } from './operator.js';
test('alias operativo ASCII de 1 a 64, sin derivacion ni valor predeterminado',()=>{
  for(const value of ['a','Operador_1-local','a'.repeat(64)])expect(requireOperatorRef(value)===value).toBe(true);
});
test.each([undefined,null,'','a'.repeat(65),'alias con espacios','administrador@example.test','José',' operador'])(
  'rechaza alias invalido sin normalizarlo (%#)',value=>{
    expect(()=>requireOperatorRef(value)).toThrow(InvalidOperatorRef);
  });
