param([string]$Results = 'test-results/login-timing')
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '../..'))
if (Test-Path -LiteralPath $Results) { throw 'Elegir una carpeta nueva para conservar mediciones anteriores.' }
$output = New-Item -ItemType Directory -Path $Results
$compose = @('compose', '-f', 'compose.yml')
if (Test-Path 'compose.override.yml') { $compose += @('-f', 'compose.override.yml') }
$compose += @('-f', 'ops/docker/compose.identity-tests.yml', 'run', '--rm', '--no-deps',
  '-e', 'PRISMA_SCHEMA_ENGINE_BINARY=/identity-runtime/schema-engine',
  '--volume', 'academia_us1_test_runtime:/identity-runtime:ro',
  '--volume', ($output.FullName + ':/workspace/test-results/login-timing'))
# Artefacto offline existente del harness: no crear silenciosamente un volumen vacío.
& docker volume inspect --format '{{.Name}}' academia_us1_test_runtime | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falta el volumen de motor Prisma del harness; no se iniciaron pruebas.' }
# Fuentes actuales de solo lectura; dist y Prisma se generan en el contenedor efímero.
$files = @('apps/api/src', 'apps/api/tests', 'apps/api/prisma', 'apps/api/scripts',
  'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/prisma.config.ts', 'apps/api/eslint.config.js',
  'apps/web/src', 'apps/web/tests', 'apps/web/index.html', 'apps/web/vite.config.ts',
  'apps/web/package.json', 'apps/web/tsconfig.json', 'apps/web/eslint.config.js',
  'apps/web/playwright.config.ts', 'apps/web/playwright.identity.config.ts',
  'apps/web/playwright.login-timing.config.ts', 'ops/lint', 'ops/local/compatibility')
foreach ($file in $files) {
  $source = (Resolve-Path -LiteralPath $file).Path
  $compose += @('--volume', ($source + ':/workspace/' + $file + ':ro'))
}
$command = 'npm run db:generate --workspace apps/api && npm run build --workspace apps/api && npm run lint --workspaces && npm run build --workspace apps/web && npx eslint apps/web/playwright.login-timing.config.ts && npx tsc --noEmit --strict --allowJs --target ES2023 --module ESNext --moduleResolution Bundler --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck apps/web/tests/e2e/login-timing.spec.ts apps/web/playwright.login-timing.config.ts && cd apps/web && npx playwright test --config playwright.login-timing.config.ts --output /workspace/test-results/login-timing/artifacts'
& docker @compose --entrypoint sh browser-tests -c $command
if ($LASTEXITCODE -ne 0) { throw 'T105 no aprobada: conservar resultados y diagnosticar antes de repetir.' }
