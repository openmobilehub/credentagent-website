// Page-level theme checks: they read index.html directly (no build step), so they guard the real page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function block(re) {
  const m = style.match(re);
  if (!m) throw new Error('token block not found: ' + re);
  const out = {};
  for (const [, name, value] of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[name] = value.trim();
  return out;
}
const LIGHT = () => block(/:root\{([^}]*)\}/);
const DARK = () => ({ ...LIGHT(), ...block(/:root\[data-theme="dark"\]\{([^}]*)\}/) });

function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const REQUIRED = ['bg', 'surface', 'sunk', 'ink', 'mut', 'dim', 'line', 'primary', 'primary-hover', 'on-primary', 'link',
  'accent2', 'attention', 'on-attention', 'brand-mark', 'ok', 'warn', 'err', 'code-bg', 'code-ink',
  'c-key', 'c-fn', 'c-str', 'c-num', 'c-cm', 'qr-bg', 'nav-bg', 'shadow'];

// [foreground, background] pairs that carry text and must meet WCAG AA (4.5:1).
const TEXT_PAIRS = [['ink', 'bg'], ['ink', 'surface'], ['ink', 'sunk'], ['mut', 'bg'], ['mut', 'surface'], ['mut', 'sunk'],
  ['dim', 'bg'], ['dim', 'surface'], ['primary', 'bg'], ['primary', 'surface'], ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'], ['link', 'bg'], ['link', 'surface'], ['accent2', 'bg'], ['accent2', 'surface'],
  ['ok', 'bg'], ['ok', 'surface'], ['warn', 'bg'], ['warn', 'surface'], ['err', 'surface'], ['on-attention', 'attention'],
  ['code-ink', 'code-bg'], ['c-key', 'code-bg'], ['c-fn', 'code-bg'], ['c-str', 'code-bg'], ['c-num', 'code-bg'],
  ['c-cm', 'code-bg'],
  ['dim', 'sunk'], ['primary', 'sunk'], ['accent2', 'sunk'], ['link', 'sunk'], ['warn', 'sunk'], ['ok', 'sunk']];

test('both themes define every required token', () => {
  for (const [name, t] of [['light', LIGHT()], ['dark', DARK()]]) {
    for (const k of REQUIRED) assert.ok(t[k], `${name} theme is missing --${k}`);
  }
});

test('every text/background pair meets WCAG AA (4.5:1) in both themes', () => {
  for (const [name, t] of [['light', LIGHT()], ['dark', DARK()]]) {
    for (const [fg, bg] of TEXT_PAIRS) {
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1 (needs 4.5)`);
    }
  }
});

test('no raw colour literals outside the two token blocks', () => {
  const rest = style
    .replace(/:root\{[^}]*\}/, '')
    .replace(/:root\[data-theme="dark"\]\{[^}]*\}/, '')
    .replace(/url\(data:[^)]*\)/g, '');                        // inline font data is not a colour
  const hits = rest.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [];
  assert.deepEqual(hits, [], 'use a token (or color-mix of one) instead of: ' + hits.join(', '));
});

test('--attention and --brand-mark are never used as a text colour (except the wordmark)', () => {
  const noWordmark = style.replace(/\.wordmark em\{[^}]*\}/, '');
  assert.equal(/[^-]color:var\(--(attention|brand-mark)\)/.test(noWordmark), false);
});

test('the wordmark is one element reading exactly "CredentAgent" (no gap), in nav and footer', () => {
  const marks = html.match(/<span class="wordmark">[\s\S]*?<\/span>/g) || [];
  assert.equal(marks.length, 2, 'expected a wordmark in the nav and the footer');
  for (const m of marks) assert.equal(m, '<span class="wordmark">Credent<em>Agent</em></span>');
  assert.equal(html.includes('>CREDENTAGENT<'), false, 'the old letter-spaced text wordmark must be gone');
  assert.match(style, /\.logo\{[^}]*gap:/, 'the gap belongs on .logo (mark ↔ word), never inside the wordmark');
});

test('every demo-level trust label carries a ⚠ dashed badge, never colour alone', () => {
  const cells = html.match(/<div class="r demo">[\s\S]*?<\/div>/g) || [];
  const labels = cells.map((c) => (c.match(/^<div class="r demo"><span class="warn-badge">⚠ ([a-z-]+-demo)<\/span><\/div>$/) || [])[1]);
  assert.deepEqual(labels, ['presence-only-demo', 'presence-only-demo', 'server-issued-demo']);
});

test('the wordmark font is an inline Space Grotesk 600 subset with its OFL notice', () => {
  const face = style.match(/@font-face\{font-family:"CA Space Grotesk";[^}]*\}/);
  assert.ok(face, '@font-face for "CA Space Grotesk" not found');
  assert.match(face[0], /font-weight:600/);
  const data = face[0].match(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/);
  assert.ok(data, 'the font must be an inline data: woff2');
  assert.ok(data[1].length < 12000, 'subset should be tiny (letters C r e d n t A g only), got ' + data[1].length);
  assert.match(style, /SIL Open Font License 1\.1/);
});

function boot(storage) {
  const m = html.match(/\/\* ca-theme-boot:begin \*\/([\s\S]*?)\/\* ca-theme-boot:end \*\//);
  assert.ok(m, 'ca-theme-boot script not found in <head>');
  const attrs = {}, styleObj = {};
  const documentElement = { setAttribute: (k, v) => { attrs[k] = v; }, style: styleObj };
  vm.runInNewContext(m[1], { document: { documentElement }, localStorage: storage });
  return { theme: attrs['data-theme'], scheme: styleObj.colorScheme };
}

test('boot script: light by default, before first paint (it sits in <head>, before <style>)', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.indexOf('ca-theme-boot:begin') > -1 && head.indexOf('ca-theme-boot:begin') < head.indexOf('<style>'));
  assert.deepEqual(boot({ getItem: () => null }), { theme: 'light', scheme: 'light' });
});

test('boot script: applies a saved dark choice', () => {
  assert.deepEqual(boot({ getItem: (k) => (k === 'credentagent.theme' ? 'dark' : null) }), { theme: 'dark', scheme: 'dark' });
});

test('boot script: blocked storage falls back to light without throwing', () => {
  assert.deepEqual(boot({ getItem() { throw new Error('blocked'); } }), { theme: 'light', scheme: 'light' });
});
