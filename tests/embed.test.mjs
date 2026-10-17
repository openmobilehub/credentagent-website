// Page-level embed checks: the demo video loads from YouTube's privacy-enhanced host, which sets no
// tracking cookies until the visitor plays it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const iframes = [...html.matchAll(/<iframe\b[^>]*>/gi)].map((m) => m[0]);
const srcOf = (tag) => (tag.match(/\ssrc\s*=\s*"([^"]*)"/i) || [])[1];

test('nothing embeds from youtube.com/embed', () => {
  assert.doesNotMatch(html, /(?<!-nocookie\.)\byoutube\.com\/embed/i);
});

test('every YouTube iframe uses youtube-nocookie.com', () => {
  const yt = iframes.map(srcOf).filter((s) => s && /youtube/i.test(s));
  assert.ok(yt.length > 0, 'expected a YouTube iframe');
  for (const src of yt) assert.match(src, /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
});

test('the demo video iframe keeps its video, title, fullscreen and lazy loading', () => {
  const tag = iframes.find((t) => /biTqHo2dL7M/.test(t));
  assert.ok(tag, 'demo video iframe not found');
  assert.equal(srcOf(tag), 'https://www.youtube-nocookie.com/embed/biTqHo2dL7M');
  assert.match(tag, /\stitle="CredentAgent — consent flow demo"/);
  assert.match(tag, /\sallowfullscreen\b/);
  assert.match(tag, /\sloading="lazy"/);
});
