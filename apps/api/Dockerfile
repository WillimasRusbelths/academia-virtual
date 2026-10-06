FROM node:22.23.1-bookworm-slim
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
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
RUN npm run probe:generate && npm run build --workspace @academia/api \
    && mkdir -p /workspace/node_modules/.vite-temp /workspace/node_modules/.vite \
    && chown -R node:node /workspace/apps /workspace/node_modules/.vite-temp /workspace/node_modules/.vite
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
