import { existsSync,readFileSync } from 'node:fs';
// Canal local del ensayo: nunca expone configuración o payload HTTP.
if(existsSync('/load-private/stop.json')){
  const value=JSON.parse(readFileSync('/load-private/stop.json','utf8'));
  process.stdout.write(['HASH_WAIT_OVER_5S','MEMORY_HEADROOM_UNDER_128M','MONITOR_UNAVAILABLE'].includes(value.reason)?value.reason:'MONITOR_UNAVAILABLE');
}else process.stdout.write('CONTINUE');
