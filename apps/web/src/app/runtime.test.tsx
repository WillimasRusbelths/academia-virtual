import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';
test('React renderiza el componente mínimo en español', () => {
  expect(renderToStaticMarkup(<App />)).toContain('<h1>Academia virtual</h1>');
});
