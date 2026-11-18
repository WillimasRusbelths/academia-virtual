import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';

// Comprueba paquetes y protocolo, no autorización o comportamiento de clases.
const api = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const web = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const packages = ['socket.io', 'socket.io-client'].map(name => {
  const pkg = api(`${name}/package.json`);
  assert.equal(pkg.version, '4.8.4');
  assert.equal(pkg.license, 'MIT');
  return { name, version: pkg.version, license: pkg.license };
});
assert.equal(web('socket.io-client/package.json').version, '4.8.4');
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
assert.equal(lock.packages['apps/api'].dependencies['socket.io'], '4.8.4');
assert.equal(lock.packages['apps/api'].devDependencies['socket.io-client'], '4.8.4');
assert.equal(lock.packages['apps/web'].dependencies['socket.io-client'], '4.8.4');

const http = createServer();
const server = new Server(http, {
  path: '/api/v1/classes/socket.io', transports: ['websocket'], serveClient: false,
  maxHttpBufferSize: 16 * 1024,
  allowRequest: (request, done) => done(null, request.headers.origin === 'http://localhost:5173'),
});
server.of('/classes').on('connection', socket => socket.emit('dependency.ready', {}));
await new Promise((resolve, reject) => {
  http.once('error', reject);
  http.listen(0, '127.0.0.1', resolve);
});
const { port } = http.address();
async function checkClient(requireWorkspace) {
  const socket = requireWorkspace('socket.io-client').io(`http://127.0.0.1:${port}/classes`, {
    path: '/api/v1/classes/socket.io', transports: ['websocket'],
    autoConnect: false, reconnection: false,
    extraHeaders: { Origin: 'http://localhost:5173' },
  });
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout de comprobación Socket.IO')), 10_000);
      socket.once('connect_error', reject);
      socket.once('dependency.ready', payload => {
        try {
          assert.deepEqual(payload, {});
          assert.equal(socket.io.engine.transport.name, 'websocket');
          resolve({ connected: true, namespace: socket.nsp, transport: socket.io.engine.transport.name });
        } catch (error) { reject(error); }
      });
      socket.connect();
    });
  } finally {
    clearTimeout(timer);
    socket.disconnect();
  }
}
try {
  const apiClient = await checkClient(api);
  const webClient = await checkClient(web);
  console.log(JSON.stringify({ packages, apiClient, webClient, appClassesImplemented: false }));
} finally {
  await new Promise(resolve => server.close(resolve));
}
