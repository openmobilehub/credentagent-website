import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, plain } from './load-core.mjs';

const D = loadCore();

// ---- parseRpcReply ----
test('parseRpcReply reads a plain JSON body', () => {
  assert.deepEqual(plain(D.parseRpcReply('{"jsonrpc":"2.0","id":1,"result":{"a":1}}')), { jsonrpc: '2.0', id: 1, result: { a: 1 } });
});

test('parseRpcReply reads an SSE body', () => {
  const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n';
  assert.deepEqual(plain(D.parseRpcReply(body)).result, { tools: [] });
});

test('parseRpcReply skips notifications and returns the response', () => {
  const body = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n' +
               'event: message\ndata: {"jsonrpc":"2.0","id":7,"error":{"code":-1,"message":"nope"}}\n\n';
  assert.equal(D.parseRpcReply(body).error.message, 'nope');
});

test('parseRpcReply returns null for garbage', () => {
  assert.equal(D.parseRpcReply('<html>502 Bad Gateway</html>'), null);
  assert.equal(D.parseRpcReply(''), null);
});

// ---- createMcpClient ----
function reply(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({ ok, status, text: () => Promise.resolve(body) });
}

test('mcp.call posts JSON-RPC and returns the result', async () => {
  let seen;
  const mcp = D.createMcpClient({ endpoint: '/marketplace-dev/mcp', fetch: (url, init) => { seen = { url, init }; return reply('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'); } });
  const result = await mcp.call('tools/call', { name: 'browse-products', arguments: {} });
  assert.deepEqual(plain(result), { ok: true });
  assert.equal(seen.url, '/marketplace-dev/mcp');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.accept, 'application/json, text/event-stream');
  assert.deepEqual(JSON.parse(seen.init.body), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browse-products', arguments: {} } });
});

test('mcp.call maps HTTP errors to kind "http"', async () => {
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: () => reply('down', { ok: false, status: 503 }) });
  await assert.rejects(mcp.call('tools/list'), (e) => e.kind === 'http' && e.status === 503 && e.message === 'HTTP 503');
});

test('mcp.call maps JSON-RPC errors to kind "rpc"', async () => {
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: () => reply('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}') });
  await assert.rejects(mcp.call('nope'), (e) => e.kind === 'rpc' && e.message === 'Method not found');
});

test('mcp.call maps unreadable replies to kind "protocol"', async () => {
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: () => reply('<html>oops</html>') });
  await assert.rejects(mcp.call('tools/list'), (e) => e.kind === 'protocol');
});

test('mcp.call times out with kind "timeout"', async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
  }));
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: hang, timeoutMs: 20 });
  await assert.rejects(mcp.call('tools/list'), (e) => e.kind === 'timeout');
});

test('mcp.call maps fetch failures to kind "network"', async () => {
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  await assert.rejects(mcp.call('tools/list'), (e) => e.kind === 'network' && e.message === 'Failed to fetch');
});

test('mcp.call never throws synchronously and always yields a typed error', async () => {
  const mcp = D.createMcpClient({ endpoint: '/x', fetch: () => { throw new TypeError('fetch exploded'); } });
  let p;
  assert.doesNotThrow(() => { p = mcp.call('tools/list'); });
  await assert.rejects(p, (e) => e.kind === 'network' && e.message === 'fetch exploded');
  const circular = {}; circular.self = circular;
  const mcp2 = D.createMcpClient({ endpoint: '/x', fetch: () => reply('{}') });
  await assert.rejects(mcp2.call('tools/call', circular), (e) => typeof e.kind === 'string');
});

// ---- scenarios & wording ----
const WHISKEY_CHECKOUT = {
  content: [{ type: 'text', text: JSON.stringify({
    orderId: 'ORD-1', checkoutUrl: 'https://demo.example/checkout?order=ORD-1',
    requires: [
      { credential: 'age', required: true, label: 'Age 21+' },
      { credential: 'membership', required: false, label: '10% member discount' },
      { credential: 'payment', required: true, label: 'Pay (USD)' },
    ] }) }],
};
const HEADPHONES_CHECKOUT = {
  content: [{ type: 'text', text: JSON.stringify({
    orderId: 'ORD-2', checkoutUrl: 'https://demo.example/checkout?order=ORD-2',
    requires: [
      { credential: 'membership', required: false, label: '10% member discount' },
      { credential: 'payment', required: true, label: 'Pay (USD)' },
    ] }) }],
};

test('summarizeCheckout: whiskey stops at the age gate', () => {
  const s = plain(D.summarizeCheckout(WHISKEY_CHECKOUT));
  assert.equal(s.ok, true);
  assert.equal(s.gated, true);
  assert.equal(s.orderId, 'ORD-1');
  assert.equal(s.checkoutUrl, 'https://demo.example/checkout?order=ORD-1');
  assert.equal(s.chip, '→ 🔒 Age 21+ · Pay (USD)');
  assert.equal(s.lines[0], '🔒 Age 21+ required. I can’t complete this for you — you have to prove it yourself.');
  assert.equal(s.lines[1], 'Optional: 10% member discount.');
});

test('summarizeCheckout: headphones have no age gate', () => {
  const s = plain(D.summarizeCheckout(HEADPHONES_CHECKOUT));
  assert.equal(s.gated, false);
  assert.equal(s.lines[0], 'No age check needed. This order needs: Pay (USD).');
});

test('summarizeCheckout never invents requirements', () => {
  const custom = plain(D.summarizeCheckout({ content: [{ type: 'text', text: '{"checkoutUrl":"https://x/c","orderId":"O","requires":[{"credential":"license","required":true}]}' }] }));
  assert.equal(custom.chip, '→ 🔒 license');
  assert.equal(custom.lines[0], 'No age check needed. This order needs: license.');
  const junk = plain(D.summarizeCheckout({ content: [{ type: 'text', text: 'not json' }] }));
  assert.equal(junk.ok, false);
  assert.equal(junk.lines[0], 'Nothing to prove for this order.');
});

test('pickWidget reads the widget URI from the tool definition', () => {
  const list = { tools: [
    { name: 'get-cart', _meta: {} },
    { name: 'browse-products', _meta: { ui: { resourceUri: 'ui://product-picker/mcp-app-abc.html' } } },
  ] };
  assert.equal(D.pickWidget(list, 'browse-products').uri, 'ui://product-picker/mcp-app-abc.html');
  assert.equal(D.pickWidget(list, 'browse-products').tool.name, 'browse-products');
  assert.equal(D.pickWidget({ tools: [{ name: 'browse-products', _meta: { 'ui/resourceUri': 'ui://legacy.html' } }] }, 'browse-products').uri, 'ui://legacy.html');
  assert.equal(D.pickWidget(list, 'get-cart'), null);
  assert.equal(D.pickWidget(null, 'browse-products'), null);
});

test('formatArgs keeps chips short', () => {
  assert.equal(D.formatArgs({}), '');
  assert.equal(D.formatArgs(undefined), '');
  assert.equal(D.formatArgs({ productId: 'oak-whiskey', quantity: 1 }), '{"productId":"oak-whiskey","quantity":1}');
  assert.equal(D.formatArgs({ uri: 'x'.repeat(100) }).length, 58);
});

test('completionLine uses the real settled order', () => {
  assert.equal(D.completionLine({ orderId: 'ORD-1', amount: 111.6, currency: 'USD' }), '✓ Order placed — $111.60.');
  assert.equal(D.completionLine({ amount: 20, currency: 'EUR' }), '✓ Order placed — 20.00 EUR.');
  assert.equal(D.completionLine(null), '✓ Order placed.');
});

test('isDemoOrigin only allows credentagent.ai and local dev', () => {
  for (const h of ['credentagent.ai', 'www.credentagent.ai', 'localhost', '127.0.0.1']) assert.equal(D.isDemoOrigin(h), true, h);
  for (const h of ['openmobilehub.github.io', 'openmobilehub.org', '', 'credentagent.ai.evil.com']) assert.equal(D.isDemoOrigin(h), false, h);
});

test('scenarios name the exact product to tap', () => {
  assert.equal(D.tapLine(D.SCENARIOS.whiskey), 'Tap + on the Oak Reserve Whiskey Collection, then Checkout.');
  assert.equal(D.tapLine(D.SCENARIOS.headphones), 'Tap + on the Aurora Wireless Headphones, then Checkout.');
});

test('summarizeCheckout and pickWidget skip malformed array entries instead of crashing', () => {
  const s = plain(D.summarizeCheckout({ content: [{ type: 'text', text: JSON.stringify({
    orderId: 'O', checkoutUrl: 'https://x/c',
    requires: [null, 'junk', { credential: 'age', required: true, label: 'Age 21+' }] }) }] }));
  assert.equal(s.gated, true);
  assert.equal(s.chip, '→ 🔒 Age 21+');
  const w = D.pickWidget({ tools: [null, 7, { name: 'browse-products', _meta: { ui: { resourceUri: 'ui://p.html' } } }] }, 'browse-products');
  assert.equal(w.uri, 'ui://p.html');
});

test('summarizeCheckout reports optional credentials on an ungated order', () => {
  const s = plain(D.summarizeCheckout(HEADPHONES_CHECKOUT));
  assert.equal(s.lines[1], 'Optional: 10% member discount.');
  assert.equal(s.chip, '→ 🔒 Pay (USD)');
});

// ---- sandboxing helpers ----
test('buildSrcdoc enforces the widget’s declared CSP', () => {
  const out = D.buildSrcdoc('<!doctype html><html><head><title>w</title></head><body></body></html>', {
    resourceDomains: ['https://picsum.photos', 'data:'],
    connectDomains: ['https://credentagent-demo-dev.vercel.app'],
  });
  assert.ok(out.includes(
    '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; ' +
    'style-src \'unsafe-inline\'; img-src https://picsum.photos data:; font-src https://picsum.photos data:; ' +
    'media-src https://picsum.photos data:; connect-src https://credentagent-demo-dev.vercel.app"><title>'));
});

test('buildSrcdoc locks everything down when no CSP is declared', () => {
  const out = D.buildSrcdoc('<p>hi</p>', undefined);
  assert.ok(out.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(out.includes("img-src 'none'"));
  assert.ok(out.includes("connect-src 'none'"));
  assert.ok(out.endsWith('<p>hi</p>'));
});

test('run guard: only the latest run is current', () => {
  const g = D.createRunGuard();
  const a = g.next(), b = g.next();
  assert.equal(g.isCurrent(a), false);
  assert.equal(g.isCurrent(b), true);
});

test('acceptMessage only accepts messages from our own frame', () => {
  const frame = {}, other = {};
  assert.deepEqual(plain(D.acceptMessage({ source: frame, data: { jsonrpc: '2.0' } }, frame)), { jsonrpc: '2.0' });
  assert.equal(D.acceptMessage({ source: other, data: { jsonrpc: '2.0' } }, frame), null);
  assert.equal(D.acceptMessage({ source: frame, data: { jsonrpc: '2.0' } }, null), null);
});
