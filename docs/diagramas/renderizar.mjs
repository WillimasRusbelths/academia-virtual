// Render SVG exported from each Draw.io page to PNG with the installed browser.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'imagenes');
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  for (const item of manifest) {
    const svg = (await readFile(path.join(dir, item.svg), 'utf8')).replace(/<\?xml[^>]*\?>/, '');
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;width:1600px;height:900px;overflow:hidden}svg{display:block}</style></head><body>' + svg + '</body></html>');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, item.png) });
    console.log(item.png);
  }
} finally { await browser.close(); }
