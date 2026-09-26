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
  assert.equal(seen.init.credentials, 'omit');
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
  assert.equal(junk.lines[0], 'The checkout page will show what this order needs.');
});

const mkCheckout = (body) => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });

test('summarizeCheckout: only an explicit empty requires means nothing to prove', () => {
  const s = plain(D.summarizeCheckout(mkCheckout({ orderId: 'O', checkoutUrl: 'https://x/c', requires: [] })));
  assert.equal(s.ok, true);
  assert.equal(s.lines[0], 'Nothing to prove for this order.');
  assert.equal(s.chip, '→ no requirements');
});

test('summarizeCheckout: missing requires is reported as not reported, not as nothing to prove', () => {
  const s = plain(D.summarizeCheckout(mkCheckout({ orderId: 'O', checkoutUrl: 'https://x/c' })));
  assert.equal(s.ok, true);
  assert.equal(s.gated, false);
  assert.equal(s.lines[0], 'The checkout page will show what this order needs.');
  assert.equal(s.chip, '→ requirements not reported');
});

test('summarizeCheckout requires an orderId to be ok', () => {
  const s = plain(D.summarizeCheckout(mkCheckout({ checkoutUrl: 'https://x/c', requires: [] })));
  assert.equal(s.ok, false);
});

test('summarizeCheckout labels an entry with neither label nor credential as "a credential"', () => {
  const s = plain(D.summarizeCheckout(mkCheckout({ orderId: 'O', checkoutUrl: 'https://x/c', requires: [{ required: true }] })));
  assert.equal(s.chip, '→ 🔒 a credential');
  assert.equal(s.lines[0], 'No age check needed. This order needs: a credential.');
});

test('isHandoffUrl only accepts the https checkoutUrl of the real checkout', () => {
  const co = plain(D.summarizeCheckout(WHISKEY_CHECKOUT));
  assert.equal(D.isHandoffUrl(co, 'https://demo.example/checkout?order=ORD-1'), true);
  assert.equal(D.isHandoffUrl(co, 'https://evil.example/checkout?order=ORD-1'), false);
  assert.equal(D.isHandoffUrl(co, undefined), false);
  assert.equal(D.isHandoffUrl(null, 'https://demo.example/checkout?order=ORD-1'), false);
  assert.equal(D.isHandoffUrl({ ok: false, checkoutUrl: 'https://demo.example/c' }, 'https://demo.example/c'), false);
  assert.equal(D.isHandoffUrl({ ok: true, checkoutUrl: 'http://demo.example/c' }, 'http://demo.example/c'), false);
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
    'media-src https://picsum.photos data:; connect-src https://credentagent-demo-dev.vercel.app; ' +
    'form-action \'none\'; base-uri \'none\'"><title>'));
});

test('buildSrcdoc locks everything down when no CSP is declared', () => {
  const out = D.buildSrcdoc('<p>hi</p>', undefined);
  assert.ok(out.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(out.includes("img-src 'none'"));
  assert.ok(out.includes("connect-src 'none'"));
  assert.ok(out.endsWith('<p>hi</p>'));
});

test('buildSrcdoc drops CSP sources that are not plain https origins or data:', () => {
  const out = D.buildSrcdoc('<head></head>', {
    resourceDomains: ['https://x.com; worker-src *', 'https://ok.example', 'javascript:', 'data:'],
    connectDomains: ['https://api.example:8443', 'https://evil.example/path', '*'],
  });
  assert.ok(!out.includes('worker-src'));
  assert.ok(out.includes('img-src https://ok.example data:;'));
  assert.ok(out.includes('connect-src https://api.example:8443;'));
});

test('buildSrcdoc injects into <head>, not <header>', () => {
  const out = D.buildSrcdoc('<header>x</header>', {});
  assert.ok(out.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(out.endsWith('<header>x</header>'));
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

// ---- MCP Apps host bridge ----
function makeBridge(overrides = {}) {
  const posted = [];
  const calls = {};
  const bridge = D.createHostBridge({
    post: (m) => posted.push(plain(m)),
    context: { toolInfo: { tool: { name: 'browse-products' } } },
    callTool: (name, args) => { calls.tool = { name, args }; return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }); },
    onReady: () => { calls.ready = true; },
    onSize: (h) => { calls.size = h; },
    onOpenLink: (url) => { calls.link = url; },
    onModelContext: (p) => { calls.context = p; },
    ...overrides,
  });
  return { bridge, posted, calls };
}
const tick = () => new Promise((r) => setImmediate(r));

test('bridge answers ui/initialize with host info, capabilities and context', () => {
  const { bridge, posted } = makeBridge();
  bridge.handle({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: { protocolVersion: '2026-01-26', appInfo: { name: 'picker', version: '1' }, appCapabilities: {} } });
  assert.deepEqual(posted[0], { jsonrpc: '2.0', id: 1, result: {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'credentagent.ai', version: '1.0.0' },
    hostCapabilities: { openLinks: {}, serverTools: {}, updateModelContext: {} },
    hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline'], platform: 'web', toolInfo: { tool: { name: 'browse-products' } } },
  } });
});

test('bridge relays the widget’s tools/call and returns the result', async () => {
  const { bridge, posted, calls } = makeBridge();
  bridge.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'set-quantity', arguments: { productId: 'oak-whiskey', quantity: 1 } } });
  await tick();
  assert.deepEqual(plain(calls.tool), { name: 'set-quantity', args: { productId: 'oak-whiskey', quantity: 1 } });
  assert.deepEqual(posted[0], { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'ok' }] } });
});

test('bridge turns a failed relay into a JSON-RPC error', async () => {
  const { bridge, posted } = makeBridge({ callTool: () => Promise.reject(new Error('HTTP 503')) });
  bridge.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'checkout', arguments: {} } });
  await tick();
  assert.deepEqual(posted[0], { jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'HTTP 503' } });
});

test('bridge surfaces open-link and model-context to the page, and acknowledges', () => {
  const { bridge, posted, calls } = makeBridge();
  bridge.handle({ jsonrpc: '2.0', id: 4, method: 'ui/open-link', params: { url: 'https://demo.example/checkout?order=1' } });
  bridge.handle({ jsonrpc: '2.0', id: 5, method: 'ui/update-model-context', params: { content: [{ type: 'text', text: 'done' }] } });
  assert.equal(calls.link, 'https://demo.example/checkout?order=1');
  assert.deepEqual(plain(calls.context), { content: [{ type: 'text', text: 'done' }] });
  assert.deepEqual(posted, [{ jsonrpc: '2.0', id: 4, result: {} }, { jsonrpc: '2.0', id: 5, result: {} }]);
});

test('bridge rejects methods it does not implement', () => {
  const { bridge, posted } = makeBridge();
  bridge.handle({ jsonrpc: '2.0', id: 6, method: 'sampling/createMessage', params: {} });
  assert.deepEqual(posted[0], { jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'Method not supported by this host: sampling/createMessage' } });
});

test('bridge handles notifications and ignores responses and junk', () => {
  const { bridge, posted, calls } = makeBridge();
  bridge.handle({ jsonrpc: '2.0', method: 'ui/notifications/initialized' });
  bridge.handle({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { width: 600, height: 640 } });
  bridge.handle({ jsonrpc: '2.0', id: 9, result: {} });
  bridge.handle('not json-rpc');
  bridge.handle(null);
  assert.equal(calls.ready, true);
  assert.equal(calls.size, 640);
  assert.deepEqual(posted, []);
});

test('bridge.notify and bridge.teardown post the right shapes', () => {
  const { bridge, posted } = makeBridge();
  bridge.notify('ui/notifications/tool-input', { arguments: {} });
  bridge.teardown();
  assert.deepEqual(posted[0], { jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: {} } });
  assert.equal(posted[1].jsonrpc, '2.0');
  assert.equal(posted[1].method, 'ui/resource-teardown');
  assert.equal(posted[1].id, 'teardown-1');
});

test('bridge acknowledges the widget even if the page callback throws', () => {
  const { bridge, posted } = makeBridge({ onOpenLink: () => { throw new Error('boom'); }, onModelContext: () => { throw new Error('boom'); } });
  assert.throws(() => bridge.handle({ jsonrpc: '2.0', id: 10, method: 'ui/open-link', params: { url: 'https://x' } }));
  assert.throws(() => bridge.handle({ jsonrpc: '2.0', id: 11, method: 'ui/update-model-context', params: {} }));
  assert.deepEqual(posted, [{ jsonrpc: '2.0', id: 10, result: {} }, { jsonrpc: '2.0', id: 11, result: {} }]);
});

test('bridge never posts an undefined tool result', async () => {
  const { bridge, posted } = makeBridge({ callTool: () => Promise.resolve(undefined) });
  bridge.handle({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get-cart', arguments: {} } });
  await tick();
  assert.deepEqual(posted[0], { jsonrpc: '2.0', id: 12, result: { content: [] } });
});

test('bridge relays allow-listed tools and rejects others without calling them', async () => {
  const seen = [];
  const { bridge, posted } = makeBridge({
    allowTools: ['get-cart', 'checkout'],
    callTool: (name) => { seen.push(name); return Promise.resolve({ content: [] }); },
  });
  bridge.handle({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get-cart', arguments: {} } });
  bridge.handle({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'create-spending-grant', arguments: {} } });
  await tick();
  assert.deepEqual(seen, ['get-cart']);
  assert.deepEqual(posted.find((m) => m.id === 21), { jsonrpc: '2.0', id: 21, error: { code: -32601, message: 'Tool not available to this app: create-spending-grant' } });
  assert.deepEqual(posted.find((m) => m.id === 20), { jsonrpc: '2.0', id: 20, result: { content: [] } });
});

// ---- QR encoder ----
test('Reed–Solomon matches the HELLO WORLD 1-M reference vector', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(plain(D.qrRsRemainder(data, 10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('qrMatrix picks the smallest version and draws finder patterns', () => {
  const small = D.qrMatrix('HELLO WORLD');
  assert.equal(small.length, 21);                                   // version 1
  assert.deepEqual(plain(small[0].slice(0, 7)), [true, true, true, true, true, true, true]);
  assert.equal(small[1][1], false);
  assert.equal(small[3][3], true);
  const url = 'https://credentagent-demo-dev.vercel.app/checkout?order=ORD-o01nne&cart=' + 'A'.repeat(488);
  assert.equal(url.length, 560);
  assert.equal(D.qrMatrix(url).length, 81);                         // version 16 at ECC L
});

test('qrSvg renders a quiet-zoned, sized SVG', () => {
  const svg = D.qrSvg('HELLO WORLD', 264);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="264" height="264"'));
  assert.ok(svg.includes('<path d="M4 4h1v1h-1z'));                 // top-left finder corner, after the 4-module quiet zone
});

test('summarizeCheckout only trusts an absolute https checkoutUrl', () => {
  const mk = (url) => plain(D.summarizeCheckout({ content: [{ type: 'text', text: JSON.stringify({ orderId: 'O', checkoutUrl: url, requires: [] }) }] }));
  assert.equal(mk('https://demo.example/checkout?order=O').ok, true);
  for (const bad of ['javascript:alert(1)', '/checkout?order=O', 'http://demo.example/c', 'https://', 'not a url']) {
    const s = mk(bad);
    assert.equal(s.ok, false, bad);
    assert.equal(s.checkoutUrl, null, bad);
  }
});
