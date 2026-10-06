FROM node:22.23.1-bookworm-slim AS local
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund
COPY apps ./apps
COPY ops/local/compatibility ./ops/local/compatibility
COPY ops/lint ./ops/lint
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
RUN npm run build --workspace @academia/web \
    && mkdir -p /workspace/node_modules/.vite-temp /workspace/node_modules/.vite \
    && chown -R node:node /workspace/apps /workspace/node_modules/.vite-temp /workspace/node_modules/.vite
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@academia/web", "--", "--host", "0.0.0.0"]

# Navegador solo en la imagen de pruebas.
FROM local AS browser-tests
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npx playwright install --with-deps --only-shell chromium
RUN chown node:node /workspace
USER node
CMD ["npm", "run", "test:e2e"]
