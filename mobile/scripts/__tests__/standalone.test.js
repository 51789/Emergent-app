/** @jest-environment node */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

const html = readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1]);

function openInstalledApp(scale) {
  const viewport = Object.assign(new EventTarget(), {
    width: 390 / scale, height: 800 / scale, offsetLeft: 0, offsetTop: 0, scale,
  });
  const style = new Map();
  const attributes = new Set();
  const root = {
    style: { setProperty: (key, value) => style.set(key, value) },
    setAttribute: key => attributes.add(key),
    toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key),
    hasAttribute: key => attributes.has(key),
  };
  const normal = 'width=device-width, initial-scale=1, viewport-fit=cover';
  const meta = { content: normal };
  const fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'bbbbbbbbbbbbbbbb' });
  const location = { pathname: '/', reload: jest.fn() };
  const document = Object.assign(new EventTarget(), {
    documentElement: root, hidden: false, activeElement: null,
    querySelector: selector => {
      if (selector.includes('viewport')) return meta;
      if (selector.includes('consulens-build')) return { content: 'aaaaaaaaaaaaaaaa' };
      return null;
    },
    querySelectorAll: () => [],
  });
  const window = Object.assign(new EventTarget(), { visualViewport: viewport });
  for (const script of scripts) {
    runInNewContext(script, {
      window, document, navigator: { standalone: true }, fetch, location,
      requestAnimationFrame: callback => callback(),
    });
  }
  return { attributes, document, fetch, location, meta, normal, style, viewport, window };
}

test('a magnified cold launch fits the visible viewport and keeps normal control sizes', () => {
  const app = openInstalledApp(1.25);
  expect(app.attributes.has('data-restored-zoom')).toBe(true);
  expect(app.style.get('--visible-width')).toBe('312px');
  expect(app.style.get('--visible-height')).toBe('640px');
  expect(app.style.get('--layout-width')).toBe('390px');
  expect(app.style.get('--restore-scale')).toBe('0.8');
  expect(app.meta.content).toBe(app.normal);
});

test('a pinch initiated inside the app keeps the chosen zoom', () => {
  const app = openInstalledApp(1);
  app.window.dispatchEvent(new Event('gesturestart'));
  Object.assign(app.viewport, { width: 195, height: 400, scale: 2 });
  app.viewport.dispatchEvent(new Event('resize'));
  expect(app.attributes.has('data-restored-zoom')).toBe(false);
  expect(app.style.get('--visible-width')).toBe('390px');
});

test('returning to a tab checks the release, while the search editor keeps its draft', async () => {
  const app = openInstalledApp(1);
  app.location.pathname = '/category/immobili';
  app.document.dispatchEvent(new Event('visibilitychange'));
  expect(app.fetch).not.toHaveBeenCalled();
  app.location.pathname = '/';
  app.document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  expect(app.fetch).toHaveBeenCalledWith('/pwa-version', { cache: 'no-store' });
  expect(app.location.reload).toHaveBeenCalledTimes(1);
});
