import { createInterface } from 'node:readline/promises';

export class TerminalUnavailable extends Error {
  readonly code='REQUEST_NOT_ALLOWED';
  constructor(){super('Se requiere un terminal interactivo local.');}
}
export function requireTerminal():void {
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new TerminalUnavailable();
}
export async function bootstrapFields() {
  requireTerminal();const reader=createInterface({input:process.stdin,output:process.stdout,historySize:0});
  try{return {operatorRef:await reader.question('Alias del operador: '),name:await reader.question('Nombre: '),
    email:await reader.question('Correo: ')};}
  finally{reader.close();}
}
/** No pasa por readline/history, no eco ni asteriscos; conserva espacios de la contraseña. */
export function hiddenCredential():Promise<string> {
  requireTerminal();const input=process.stdin;const wasRaw=input.isRaw;
  return new Promise((resolve,reject)=>{
    let value='';
    const cleanup=()=>{input.removeListener('data',read);input.removeListener('end',cancel);input.removeListener('error',cancel);
      input.setRawMode(wasRaw);input.pause();};
    const cancel=()=>{cleanup();value='';reject(new TerminalUnavailable());};
    const read=(chunk:string|Buffer)=>{
      for(const character of String(chunk)){
        if(character==='\u0003'||character==='\u0004'){cancel();return;}
        if(character==='\r'||character==='\n'){cleanup();process.stdout.write('\n');resolve(value);value='';return;}
        if(character==='\u007f'||character==='\b')value=Array.from(value).slice(0,-1).join('');
        else value+=character;
      }
    };
    input.setEncoding('utf8');input.setRawMode(true);
    input.on('data',read);input.once('end',cancel);input.once('error',cancel);
    process.stdout.write('Credencial provisional: ');input.resume();
  });
}
