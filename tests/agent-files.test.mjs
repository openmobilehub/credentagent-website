// Agent-readiness files (is-agentic.com): llms.txt, index.md, sitemap, robots, JSON-LD, og:image and the
// About / Contact / Privacy pages. Each check mirrors one the scanner runs, so removing a file or a field fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html');
const text = (page) => page.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const jsonLd = () => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html has no JSON-LD block');
  return JSON.parse(m[1])['@graph'];
};

test('JSON-LD names the software and a complete Organization (contactPoint + address)', () => {
  const graph = jsonLd();
  const app = graph.find((n) => n['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication missing');
  for (const k of ['name', 'description', 'url', 'softwareVersion', 'offers', 'sameAs']) assert.ok(app[k], `SoftwareApplication.${k} missing`);
  const org = graph.find((n) => n['@type'] === 'Organization');
  assert.ok(org, 'Organization missing');
  assert.ok(org.contactPoint?.email && org.contactPoint?.contactType, 'Organization.contactPoint needs email + contactType');
  assert.equal(org.address?.['@type'], 'PostalAddress');
});

test('JSON-LD softwareVersion matches the version index.md and the release strip advertise', () => {
  const { softwareVersion } = jsonLd().find((n) => n['@type'] === 'SoftwareApplication');
  const [major, minor] = softwareVersion.split('.');
  assert.match(html, new RegExp(`v${major}\\.${minor}\\b`), `index.html doesn't mention v${major}.${minor}`);
  assert.match(read('index.md'), new RegExp(`v${major}\\.${minor}\\b`), `index.md doesn't mention v${major}.${minor}`);
});

test('metadata: canonical, lang, og:type and an og:image that exists in the repo', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/credentagent\.ai\/">/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta property="og:type" content="website">/);
  const img = html.match(/<meta property="og:image" content="https:\/\/credentagent\.ai\/([^"]+)">/);
  assert.ok(img, 'og:image missing or not absolute on credentagent.ai');
  assert.ok(existsSync(new URL('../' + img[1], import.meta.url)), `${img[1]} is not in the repo`);
});

test('llms.txt has a title, a summary and when-to-use guidance', () => {
  const llms = read('llms.txt');
  assert.match(llms, /^# CredentAgent\n/);
  assert.match(llms, /^> /m);
  assert.match(llms, /^## When to use CredentAgent$/m);
  assert.match(llms, /npm i @openmobilehub\/credentagent-gate/);
});

test('index.md is the homepage in Markdown, with the same honest status', () => {
  const md = read('index.md');
  assert.match(md, /^# CredentAgent/);
  for (const h of ['How it works', 'Get started', 'Status — honest by design']) assert.match(md, new RegExp(`^## ${h}`, 'm'));
  assert.match(md, /presence-only-demo/, 'index.md must keep the presence-only-demo caveat (honesty rule)');
});

const PAGES = ['about', 'contact', 'privacy'];

test('About, Contact and Privacy each have at least 500 characters of content', () => {
  for (const p of PAGES) {
    const body = text(read(p + '.html').match(/<main>([\s\S]*)<\/main>/)[1]);
    assert.ok(body.length >= 500, `${p}.html has ${body.length} characters (needs 500)`);
  }
});

test('the sitemap lists every page, and robots.txt points at it', () => {
  const sm = read('sitemap.xml');
  for (const p of ['', ...PAGES, 'llms.txt', 'index.md']) assert.ok(sm.includes(`<loc>https://credentagent.ai/${p}</loc>`), `sitemap.xml is missing /${p}`);
  assert.match(read('robots.txt'), /^Sitemap: https:\/\/credentagent\.ai\/sitemap\.xml$/m);
});

test('404 pages explain the error and link to llms.txt and the sitemap', () => {
  for (const f of ['404.md', '404.html']) {
    const s = read(f);
    assert.match(s, /llms\.txt/); assert.match(s, /sitemap\.xml/);
  }
});

test('the new pages stay self-contained (no external script, stylesheet or image)', () => {
  for (const f of [...PAGES.map((p) => p + '.html'), '404.html']) {
    const hits = read(f).match(/<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:/gi) || [];
    assert.deepEqual(hits, [], `${f} loads something external`);
  }
});

test('the hero names the brand: CredentAgent in the H1; H1 + subhead say open source and MCP', () => {
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
  assert.ok(h1, 'index.html has no <h1>');
  assert.match(h1[1], /class="h1-ask"/, 'the H1 lost its .h1-ask accent');
  assert.match(text(h1[1]).replace(/\s+/g, ''), /CredentAgent/, 'the H1 does not name CredentAgent');
  const sub = html.match(/<p class="subhead">([\s\S]*?)<\/p>/);
  assert.ok(sub, 'the hero has no subhead');
  const hero = text(h1[1]) + ' ' + text(sub[1]);
  assert.match(hero, /open[- ]source/i, 'the hero does not say open source');
  assert.match(hero, /\bMCP\b/, 'the hero does not say MCP');
  assert.match(html.match(/<title>([^<]*)<\/title>/)[1], /CredentAgent/);
  assert.match(read('index.md').split('\n')[0], /^# .*CredentAgent/);
  assert.match(read('llms.txt').split('\n')[0], /^# CredentAgent/);
});
