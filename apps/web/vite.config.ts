import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
export default defineConfig({
  plugins: [react(),{
    name:'academia-content-policy',
    transformIndexHtml:{order:'post',handler(html,context){
      // Autorizar solo los scripts inline que introduce la herramienta (preamble de React/HMR).
      // El build actual no los necesita; nunca permitir unsafe-inline/eval para scripts.
      const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(([,attributes,body])=>! /\bsrc\s*=/i.test(attributes)&&body.trim().length>0)
        .map(([, ,body])=>`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
      return html.replace('__ACADEMIA_SCRIPTS__',["'self'",...hashes].join(' '))
        .replace('__ACADEMIA_CONNECTIONS__',context.server
          ?"'self' ws://localhost:5173 ws://127.0.0.1:5173":"'self'");
    }},
  }],
  server: { host: 'localhost', port: 5173, strictPort: true, cors:false,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://api:3000', changeOrigin: false } } },
  preview:{cors:false},
  test: { environment: 'node' }
});
