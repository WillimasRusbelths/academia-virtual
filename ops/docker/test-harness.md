# Soporte de pruebas

El procedimiento vigente y los resultados están en [README.md](README.md) y
[verification.md](verification.md). El código de pruebas y las migraciones existentes
se conservan; solo cambia la configuración del entorno de ejecución.

El harness de API crea un esquema único t_<suite>_<aleatorio> en academia_v00_test.
Solo el owner crea y elimina ese esquema; runtime recibe USAGE y DML, usa search_path
explícito por conexión y no obtiene CREATE. La limpieza acepta únicamente el
identificador generado y no toca otras bases, esquemas o datos. Las conexiones usan
db:5432 y los roles exclusivos de ensayo, mediante variables inyectadas por Compose.

Mailpit se consulta en http://mailpit:8025, exige prefijos de asunto de prueba y no
borra mensajes existentes. SMTP usa mailpit:1025 y destinatarios @example.test.

Playwright ejecuta Chromium contra http://web:5173 en un contenedor efímero del perfil
tests, con un worker. PLAYWRIGHT_BASE_URL desactiva el servidor auxiliar del runner.
El informe y las trazas quedan en ese contenedor y no se incorporan a Git.

Los scripts lint, build, test:unit, test:integration y test:e2e son obligatorios;
no usan --if-present. test:docker agrupa lint, compilación, unitarias, migración,
permisos, integración y crypto/mail dentro de api. El navegador se ejecuta aparte.

Las unitarias prueban las reglas de importación existentes y el componente mínimo web.
La integración comprueba Nest, PostgreSQL real, rollback y esquema aislado con lectura/
escritura runtime, además de disponibilidad de Mailpit. No se implementan pruebas de
aceptación para flujos de identidad ausentes. La auditoría histórica pendiente está
en [compatibility.md](compatibility.md); no se considera resuelta por esta migración.
