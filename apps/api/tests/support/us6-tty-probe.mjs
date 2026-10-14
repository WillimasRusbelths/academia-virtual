// Control del harness, no sustituye la CLI de producto ni crea cuentas.
import process from 'node:process';
if(!process.stdin.isTTY||!process.stdout.isTTY)process.exit(2);
process.stdout.write('PTY_READY\n');
if(process.argv[2]==='hidden')process.stdin.setRawMode(true);
process.stdout.write('Credencial provisional: ');
process.stdin.resume();
process.stdin.on('data',chunk=>{
  if(String(chunk).includes('\n')||String(chunk).includes('\r')){
    if(process.argv[2]==='hidden')process.stdin.setRawMode(false);
    process.stdout.write('\nPROBE_COMPLETE\n');process.exit(0);
  }
});
