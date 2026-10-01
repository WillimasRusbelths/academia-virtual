import path from 'node:path';

const normalize = (value) => value.replaceAll('\\', '/');
const apiPattern = /(?:^|\/)apps\/api\/src\/modules\/([^/]+)\/(entrypoints|application|domain|infrastructure|public)(?:\/|$)/;
const webPattern = /(?:^|\/)apps\/web\/src\/(app|shared|features\/([^/]+))(?:\/|$)/;

function importedPath(filename, source) {
  if (!source.startsWith('.')) return null;
  return normalize(path.resolve(path.dirname(filename), source));
}

function sourceNodes(visitor) {
  return {
    ImportDeclaration: visitor,
    ExportNamedDeclaration: visitor,
    ExportAllDeclaration: visitor,
    ImportExpression: visitor,
  };
}

function sourceValue(node) {
  return typeof node.source?.value === 'string' ? node.source.value : null;
}

const apiAllowed = {
  entrypoints: new Set(['entrypoints', 'application', 'domain', 'public']),
  application: new Set(['application', 'domain', 'public']),
  domain: new Set(['domain', 'public']),
  infrastructure: new Set(['infrastructure', 'application', 'domain', 'public']),
  public: new Set(['domain', 'public']),
};

const forbiddenExternal = {
  entrypoints: ['@prisma/', 'prisma', 'pg', 'argon2', 'nodemailer'],
  application: ['*'],
  domain: ['*'],
  infrastructure: ['@nestjs/', 'express'],
  public: ['*'],
};

function matchesExternal(source, patterns) {
  return patterns.includes('*') || patterns.some((candidate) =>
    source === candidate || source.startsWith(candidate));
}

export const apiLayersRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      external: 'La capa {{layer}} no puede importar {{source}}; usa un contrato o la raíz de composición.',
      layer: '{{from}} no puede depender de {{to}} dentro del módulo.',
      module: 'Los módulos solo consumen la superficie public de otro módulo.',
    },
  },
  create(context) {
    const filename = normalize(context.filename);
    const from = filename.match(apiPattern);
    if (!from) return {};
    const [, fromModule, fromLayer] = from;
    return sourceNodes((node) => {
      const source = sourceValue(node);
      if (!source) return;
      if (!source.startsWith('.')) {
        if (matchesExternal(source, forbiddenExternal[fromLayer])) {
          context.report({ node, messageId: 'external', data: { layer: fromLayer, source } });
        }
        return;
      }
      const target = importedPath(filename, source)?.match(apiPattern);
      if (!target) return;
      const [, targetModule, targetLayer] = target;
      if (fromModule !== targetModule && targetLayer !== 'public') {
        context.report({ node, messageId: 'module' });
        return;
      }
      if (fromModule === targetModule && !apiAllowed[fromLayer].has(targetLayer)) {
        context.report({ node, messageId: 'layer', data: { from: fromLayer, to: targetLayer } });
      }
    });
  },
};

export const webLayersRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      app: 'shared no puede depender de app ni features.',
      feature: 'Una feature solo puede importar su propio código y shared.',
    },
  },
  create(context) {
    const filename = normalize(context.filename);
    const from = filename.match(webPattern);
    if (!from) return {};
    const fromArea = from[1];
    const fromFeature = from[2];
    return sourceNodes((node) => {
      const source = sourceValue(node);
      if (!source?.startsWith('.')) return;
      const target = importedPath(filename, source)?.match(webPattern);
      if (!target) return;
      const targetArea = target[1];
      const targetFeature = target[2];
      if (fromArea === 'shared' && targetArea !== 'shared') {
        context.report({ node, messageId: 'app' });
      }
      if (fromArea.startsWith('features/')
          && targetArea !== 'shared'
          && targetFeature !== fromFeature) {
        context.report({ node, messageId: 'feature' });
      }
    });
  },
};

export default {
  rules: {
    'api-layers': apiLayersRule,
    'web-layers': webLayersRule,
  },
};
