import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// No lee .env del entorno manual ni reutiliza un proyecto/volumen anterior.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const options = process.argv.slice(2);
if (options.length > 1 || (options.length && !/^--subnet=10\.(?:\d{1,3}\.){2}0\/24$/.test(options[0]))) {
  throw new Error('Opción admitida: --subnet=10.x.y.0/24, previamente comprobada libre.');
}
const subnet = options[0]?.slice('--subnet='.length);
if (subnet?.split(/[./]/).slice(0, 4).some(n => Number(n) > 255)) throw new Error('Subred inválida.');
const project = `classes-${randomBytes(6).toString('hex')}`;
const directory = path.join(repo, '.cache', project);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const secrets = ['POSTGRES_PASSWORD', 'ACADEMIA_OWNER_PASSWORD', 'ACADEMIA_RUNTIME_PASSWORD',
  'PROBE_OWNER_PASSWORD', 'PROBE_RUNTIME_PASSWORD'].map(name => `${name}=${randomBytes(32).toString('hex')}`);
for (const name of ['MAIL_PAYLOAD_KEY', 'RATE_HMAC_KEY', 'TEST_MAIL_PAYLOAD_KEY', 'TEST_RATE_HMAC_KEY']) {
  secrets.push(`${name}=${randomBytes(32).toString('base64')}`);
}
writeFileSync(path.join(directory, 'private.env'), `${secrets.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
let yaml = `# Solo para este proyecto nuevo; ningún puerto publicado o volumen externo.
services:
  db:
    networks: !override [local]
  mailpit:
    networks: !override [local]
  api:
    networks: !override [local]
    environment:
      APP_ENV: test
      APP_ORIGIN: http://localhost:5173
      DB_POOL_MAX: '10'
    volumes:
      - '${directory.replaceAll('\\', '/') }:/classes-private'
  web:
    networks: !override [local]
  browser-tests:
    networks: !override [local]
`;
if (subnet) yaml += `networks:\n  local:\n    ipam:\n      config:\n        - subnet: ${subnet}\n`;
writeFileSync(path.join(directory, 'compose.classes.yml'), yaml, { flag: 'wx', mode: 0o600 });
const files = [path.join(repo, 'compose.yml'), path.join(repo, 'ops/docker/compose.regression.yml'), path.join(directory, 'compose.classes.yml')];
// La CA pública existente solo se monta durante build, con TLS habilitado.
if (existsSync(path.join(repo, '.cache/docker/npm-ca.crt'))) {
  const caFile = path.join(directory, 'compose.ca.yml');
  writeFileSync(caFile, `services:\n  api:\n    build:\n      secrets: [npm_ca]\n  web:\n    build:\n      secrets: [npm_ca]\n  browser-tests:\n    build:\n      secrets: [npm_ca]\nsecrets:\n  npm_ca:\n    file: '${path.join(repo, '.cache/docker/npm-ca.crt').replaceAll('\\', '/')}'\n`, { flag: 'wx' });
  files.push(caFile);
}
const args = ['compose', '--project-name', project, '--env-file', path.join(directory, 'private.env')];
for (const file of files) args.push('-f', file);
const descriptor = { project, directory, composeArgs: args };
writeFileSync(path.join(directory, 'harness.json'), `${JSON.stringify(descriptor, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ project, descriptor: path.relative(repo, path.join(directory, 'harness.json')) }));
