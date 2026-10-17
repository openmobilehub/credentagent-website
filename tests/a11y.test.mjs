// Page-level accessibility checks: the skip link and the <main> landmark. They read index.html directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Scripts hold markup strings (templates, widgets); strip them and comments so only real markup counts.
const body = html.slice(html.indexOf('<body'))
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

const FOCUSABLE = /<(a\b[^>]*\bhref=|button\b|input\b|select\b|textarea\b|iframe\b|summary\b|[a-z][a-z0-9-]*\b[^>]*\btabindex=)[^>]*>/i;

test('exactly one <main>, and it has id="main"', () => {
  const mains = body.match(/<main\b[^>]*>/gi) || [];
  assert.equal(mains.length, 1, 'expected exactly one <main>');
  assert.match(mains[0], /\bid="main"/);
  assert.equal((body.match(/<\/main>/gi) || []).length, 1, 'expected one </main>');
});

test('the first focusable element in <body> is the skip link, before <nav>', () => {
  const m = body.match(FOCUSABLE);
  assert.ok(m, 'no focusable element in body');
  const tag = m[0];
  assert.match(tag, /^<a\b/i);
  assert.match(tag, /\bhref="#main"/);
  assert.doesNotMatch(tag, /tabindex="-1"|\bhidden\b/);
  const close = body.indexOf('</a>', m.index);
  assert.equal(body.slice(m.index + tag.length, close).trim(), 'Skip to content');
  assert.ok(m.index < body.indexOf('<nav'), 'skip link must precede <nav>');
});

test("the skip link's target id exists", () => {
  const href = (body.match(FOCUSABLE) || [''])[0].match(/\bhref="#([^"]+)"/);
  assert.ok(href, 'skip link has no in-page href');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
  assert.ok(ids.includes(href[1]), `no element with id="${href[1]}"`);
});

test('<main> wraps the content; nav, footer and the dock stay outside it', () => {
  const start = body.search(/<main\b/i), end = body.search(/<\/main>/i);
  assert.ok(start >= 0 && end > start, '<main>…</main> not found');
  const inside = (re) => { const i = body.search(re); return i > start && i < end; };
  assert.ok(body.indexOf('<nav') < start, '<nav> must come before <main>');
  assert.ok(body.indexOf('<footer') > end, '<footer> must come after </main>');
  assert.ok(!inside(/id="dock"/), '#dock must be outside <main>');
  assert.ok(!inside(/id="dock-launch"/), 'the launcher must be outside <main>');
  for (const id of ['how', 'try', 'start', 'use', 'more', 'status']) assert.ok(inside(new RegExp(`<section id="${id}"`)), `#${id} must be inside <main>`);
  assert.ok(inside(/<section class="hero"/), 'the hero must be inside <main>');
});

test('the skip link is hidden off-screen, not display:none, and shows on :focus with tokens only', () => {
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const rules = [...style.matchAll(/([^{}]*\.skip-link[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 2, 'expected .skip-link and .skip-link:focus rules');
  const all = rules.map((r) => r[2]).join(';');
  assert.doesNotMatch(all, /display\s*:\s*none|visibility\s*:\s*hidden/);
  assert.doesNotMatch(all, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'raw colour literal in .skip-link');
  assert.ok(rules.some((r) => /:focus/.test(r[1])), 'no .skip-link:focus rule');
});
