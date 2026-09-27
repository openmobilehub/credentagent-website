// Page-level theme checks: they read index.html directly (no build step), so they guard the real page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  ['c-cm', 'code-bg']];

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
