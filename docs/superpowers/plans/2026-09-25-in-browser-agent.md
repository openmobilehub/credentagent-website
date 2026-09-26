# In-browser Agent Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "▶ Right here" tab to *Try it live* on credentagent.ai. Scenario buttons drive a scripted agent against the real `/marketplace-dev/mcp` storefront; the visitor shops in the real MCP Apps product picker and hands off to the gate's checkout page (W3C Digital Credentials API → Multipaz Wallet).

**Architecture:** Everything ships inside the single `index.html`, with no build step and no libraries.
- A **pure core** (`var CADemo = …`, fenced by `/* ca-demo-core:begin */ … /* ca-demo-core:end */` markers) holds all logic: MCP client, reply parsing, agent wording, CSP'd `srcdoc`, the MCP Apps host bridge, the run guard and the QR encoder.
- **Node's built-in test runner** loads that exact block into a `vm` context and tests it.
- A separate **DOM script** wires the core to the page: chat log, sandboxed iframe, hand-off card.

**Tech Stack:** Vanilla ES5-style browser JS (matches the site), `node:test` (Node ≥ 22), Python 3 stdlib dev server, macOS `swift` + CoreImage for a QR round-trip check.

**Spec:** `docs/superpowers/specs/2026-09-25-in-browser-agent-design.md`

**Conventions:**
- **DCO:** every commit is `git commit -s` (signed off) and ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/in-browser-agent`, based on `main` after PR #10.

## File structure

| File | Responsibility |
|---|---|
| `index.html` (modify) | CSS for tabs/demo; *Try it live* tabs markup; hero link; generalized tabs script; `ca-demo-core` script (pure); demo DOM script. |
| `tests/load-core.mjs` (create) | Extract the `ca-demo-core` block from `index.html` into a `vm` context; `plain()` helper. |
| `tests/demo.test.mjs` (create) | Unit tests for the pure core (`node --test`). |
| `tests/contract.mjs` (create) | Live contract smoke against the MCP endpoint. |
| `tests/qr-roundtrip.mjs` (create) | macOS: encode → PNG → CoreImage decode round trip. |
| `tests/qr-decode.swift` (create) | CoreImage QR decoder used by the round trip. |
| `tools/dev-server.py` (create) | Local stand-in for the credentagent.ai router (serves `/`, proxies `/marketplace-dev/*`). |
| `CLAUDE.md` (modify) | Network carve-out, endpoint constant, how to test and run locally. |
| `docs/superpowers/specs/2026-09-25-in-browser-agent-design.md` (modify) | Record the three findings from planning. |

**Unit test command:** `node --test "tests/*.test.mjs"`

---

### Task 1: Record planning findings in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-in-browser-agent-design.md`

- [ ] **Step 1: Amend the data flow (widget URI comes from `tools/list`)**

Replace:
```markdown
2. `mcp` `tools/call browse-products` → chip → `_meta.ui.resourceUri`.
3. `mcp` `resources/read {uri}` → `host` creates the iframe.
```
with:
```markdown
2. `mcp` `tools/list` → chip → the `browse-products` **definition's** `_meta.ui.resourceUri`
   (the call *result* carries only `_meta["product-picker/catalog"|"product-picker/cart"]`, verified 2026-09-25).
   Then `tools/call browse-products` → chip (its result is later sent to the widget).
3. `mcp` `resources/read {uri}` → chip → `host` creates the iframe.
```

- [ ] **Step 2: Amend completion (real amount; widget polls only 5 minutes)**

Replace:
```markdown
10. The widget's own `order-status` polling sees `completed: true` → `get-cart` (relayed, chip) →
    `ui/update-model-context` → agent: "✓ Order placed: $124 USD."
```
with:
```markdown
10. The widget's own `order-status` polling sees `completed: true` → `get-cart` (relayed, chip) →
    `ui/update-model-context`. The page then reads `<checkout origin>/checkout/order-status?orderId=…`
    itself (`Access-Control-Allow-Origin: *`) and says "✓ Order placed: $<order.amount>". It uses the
    **settled** amount (a member discount changes it); it never uses the cart, because the widget's
    final `get-cart` returns the emptied cart.
11. The widget stops polling after 5 minutes. The hand-off card therefore has an
    **"I've finished — check the order"** button that does the same `order-status` read on demand.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-25-in-browser-agent-design.md
git commit -s -m "docs(spec): widget URI from tools/list; completion reads the settled order" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Test harness + core skeleton + `parseRpcReply`

**Files:**
- Create: `tests/load-core.mjs`
- Create: `tests/demo.test.mjs`
- Modify: `index.html` (insert a script just before `</body>`)

- [ ] **Step 1: Create the loader**

`tests/load-core.mjs`:
```js
// Loads the pure demo core out of index.html (between the ca-demo-core markers) into a fresh VM
// context, so tests exercise the exact code the page ships — no build step, no second copy.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export function loadCore(globals = {}) {
  const m = html.match(/\/\* ca-demo-core:begin \*\/([\s\S]*?)\/\* ca-demo-core:end \*\//);
  if (!m) throw new Error('ca-demo-core markers not found in index.html');
  const ctx = vm.createContext({ AbortController, setTimeout, clearTimeout, ...globals });
  vm.runInContext(m[1], ctx);
  return ctx.CADemo;
}

// Objects built inside the VM carry that realm's prototypes; normalize before deepStrictEqual.
export const plain = (x) => JSON.parse(JSON.stringify(x));
```

- [ ] **Step 2: Write the failing tests**

`tests/demo.test.mjs`:
```js
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `Error: ca-demo-core markers not found in index.html`

- [ ] **Step 4: Add the core script to `index.html`**

Insert immediately **before** `</body>` (after the existing tabs `<script>`):
```html
<script>
/* ca-demo-core:begin */
// Pure logic for the in-browser agent demo — no DOM access at load time.
// Unit-tested by tests/demo.test.mjs, which loads exactly this block.
var CADemo = (function () {
  'use strict';
  var api = {};

  // Parse an MCP Streamable-HTTP reply: plain JSON, or SSE ("event: message" / "data: {...}").
  api.parseRpcReply = function (body) {
    var text = String(body || '').trim();
    if (text.charAt(0) === '{') {
      try { return JSON.parse(text); } catch (e) { return null; }
    }
    var found = null;
    text.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('data:') !== 0) return;
      try {
        var obj = JSON.parse(line.slice(5).trim());
        if (obj && (obj.result !== undefined || obj.error !== undefined)) found = obj;
      } catch (e) { /* not a JSON-RPC response line */ }
    });
    return found;
  };

  return api;
})();
/* ca-demo-core:end */
</script>
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add tests/load-core.mjs tests/demo.test.mjs index.html
git commit -s -m "feat(demo): pure core skeleton + MCP reply parsing, with node:test harness" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: MCP client (`createMcpClient`)

**Files:**
- Modify: `index.html` (inside `ca-demo-core`)
- Test: `tests/demo.test.mjs` (append)

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `TypeError: D.createMcpClient is not a function`

- [ ] **Step 3: Implement**

In `index.html`, replace `  return api;\n})();\n/* ca-demo-core:end */` with:
```js
  function mcpError(kind, message, status) {
    var e = new Error(message); e.kind = kind; e.status = status; return e;
  }

  // Stateless MCP client: one JSON-RPC POST per call (the storefront needs no initialize/session).
  // Errors carry .kind: http | rpc | protocol | timeout | network.
  api.createMcpClient = function (opts) {
    var endpoint = opts.endpoint, doFetch = opts.fetch, timeoutMs = opts.timeoutMs || 15000;
    var nextId = 0;
    return {
      call: function (method, params) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
        return doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method: method, params: params || {} }),
          signal: controller.signal
        }).then(function (res) {
          if (!res.ok) throw mcpError('http', 'HTTP ' + res.status, res.status);
          return res.text();
        }).then(function (body) {
          var parsed = api.parseRpcReply(body);
          if (!parsed) throw mcpError('protocol', 'Unreadable reply from the MCP server');
          if (parsed.error) throw mcpError('rpc', parsed.error.message || 'MCP error');
          return parsed.result;
        }, function (err) {
          if (err && err.kind) throw err;
          if (err && err.name === 'AbortError') throw mcpError('timeout', 'No reply within ' + Math.round(timeoutMs / 1000) + ' s');
          throw mcpError('network', (err && err.message) || 'Network error');
        }).finally(function () { clearTimeout(timer); });
      }
    };
  };

  return api;
})();
/* ca-demo-core:end */
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/demo.test.mjs
git commit -s -m "feat(demo): stateless MCP client with typed errors and a timeout" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Scenarios and agent wording (derived only from real results)

**Files:**
- Modify: `index.html` (inside `ca-demo-core`)
- Test: `tests/demo.test.mjs` (append)

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `TypeError: D.summarizeCheckout is not a function` (and similar).

- [ ] **Step 3: Implement**

Insert before `  return api;\n})();\n/* ca-demo-core:end */`:
```js
  // Product names match the storefront catalog exactly (verified via browse-products).
  api.SCENARIOS = {
    whiskey:    { key: 'whiskey',    prompt: 'Buy the Oak Reserve whiskey.', product: 'Oak Reserve Whiskey Collection' },
    headphones: { key: 'headphones', prompt: 'Buy the Aurora headphones.',   product: 'Aurora Wireless Headphones' }
  };
  api.tapLine = function (s) { return 'Tap + on the ' + s.product + ', then Checkout.'; };

  api.isDemoOrigin = function (hostname) {
    return ['credentagent.ai', 'www.credentagent.ai', 'localhost', '127.0.0.1'].indexOf(hostname) !== -1;
  };

  // The widget URI lives on the tool DEFINITION (tools/list), not on the call result.
  api.pickWidget = function (toolsListResult, toolName) {
    var tools = (toolsListResult && toolsListResult.tools) || [];
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].name !== toolName) continue;
      var meta = tools[i]._meta || {};
      var uri = (meta.ui && meta.ui.resourceUri) || meta['ui/resourceUri'];
      return uri ? { tool: tools[i], uri: uri } : null;
    }
    return null;
  };

  api.formatArgs = function (args) {
    var s = JSON.stringify(args || {});
    if (s === '{}') return '';
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  };

  api.toolText = function (result) {
    var c = result && result.content && result.content[0];
    if (!c || c.type !== 'text') return null;
    try { return JSON.parse(c.text); } catch (e) { return null; }
  };

  api.fmtMoney = function (amount, currency) {
    if (typeof amount !== 'number') return '';
    var cur = (currency || 'USD').toUpperCase();
    return cur === 'USD' ? '$' + amount.toFixed(2) : amount.toFixed(2) + ' ' + cur;
  };

  // What the agent says after checkout — derived ONLY from the real `requires` manifest.
  api.summarizeCheckout = function (result) {
    var body = api.toolText(result) || {};
    var requires = Array.isArray(body.requires) ? body.requires : [];
    var label = function (r) { return r.label || r.credential; };
    var required = requires.filter(function (r) { return r.required; });
    var optional = requires.filter(function (r) { return !r.required; });
    var age = required.filter(function (r) { return r.credential === 'age'; })[0] || null;
    var lines = [];
    if (age) lines.push('🔒 ' + label(age) + ' required. I can’t complete this for you — you have to prove it yourself.');
    else if (required.length) lines.push('No age check needed. This order needs: ' + required.map(label).join(' · ') + '.');
    else lines.push('Nothing to prove for this order.');
    if (optional.length) lines.push('Optional: ' + optional.map(label).join(' · ') + '.');
    return {
      ok: !!body.checkoutUrl,
      orderId: body.orderId || null,
      checkoutUrl: body.checkoutUrl || null,
      gated: !!age,
      chip: required.length ? '→ 🔒 ' + required.map(label).join(' · ') : '→ no requirements',
      lines: lines
    };
  };

  // Built from the SETTLED order (order-status), never the cart — a member discount changes the amount.
  api.completionLine = function (order) {
    var money = order ? api.fmtMoney(order.amount, order.currency) : '';
    return '✓ Order placed' + (money ? ' — ' + money : '') + '.';
  };

```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/demo.test.mjs
git commit -s -m "feat(demo): scenarios and agent wording derived only from real tool results" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Widget sandboxing helpers (`buildSrcdoc`, `createRunGuard`, `acceptMessage`)

**Files:**
- Modify: `index.html` (inside `ca-demo-core`)
- Test: `tests/demo.test.mjs` (append)

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `TypeError: D.buildSrcdoc is not a function`

- [ ] **Step 3: Implement**

Insert before `  return api;\n})();\n/* ca-demo-core:end */`:
```js
  // Enforce the widget's own declared CSP (_meta.ui.csp) inside the sandboxed frame.
  api.buildSrcdoc = function (html, csp) {
    csp = csp || {};
    var res = (csp.resourceDomains || []).join(' ') || "'none'";
    var conn = (csp.connectDomains || []).join(' ') || "'none'";
    var policy = [
      "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
      'img-src ' + res, 'font-src ' + res, 'media-src ' + res, 'connect-src ' + conn
    ].join('; ');
    var meta = '<meta http-equiv="Content-Security-Policy" content="' + policy.replace(/"/g, '&quot;') + '">';
    return /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, function (m) { return m + meta; })
      : meta + html;
  };

  // Each run gets a token; late replies from an abandoned run are dropped.
  api.createRunGuard = function () {
    var current = 0;
    return {
      next: function () { return ++current; },
      isCurrent: function (t) { return t === current; }
    };
  };

  // Only messages whose source is OUR iframe reach the bridge.
  api.acceptMessage = function (event, frameWindow) {
    return frameWindow && event && event.source === frameWindow ? event.data : null;
  };

```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 22 tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/demo.test.mjs
git commit -s -m "feat(demo): CSP'd srcdoc, run guard and frame-source check for the widget" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: MCP Apps host bridge (`createHostBridge`)

Protocol facts (from the SDK bundled in the widget, `@modelcontextprotocol/ext-apps`, protocol `2026-01-26`):
- **Transport:** the widget posts JSON-RPC **objects** to `window.parent` with target `"*"`, and accepts messages only when `event.source === window.parent`.
- **Handshake:** request `ui/initialize {appInfo, appCapabilities, protocolVersion}` → it expects `{protocolVersion, hostInfo:{name,version}, hostCapabilities, hostContext}` (every `hostContext` field is optional) → then it sends the notification `ui/notifications/initialized`.
- **Host capability keys** used here: `openLinks`, `serverTools`, `updateModelContext`.
- **Requests it sends:** `tools/call`, `ui/open-link {url}`, `ui/update-model-context {content?, structuredContent?}`.
- **Notifications it sends:** `ui/notifications/size-changed {width, height}`.

**Files:**
- Modify: `index.html` (inside `ca-demo-core`)
- Test: `tests/demo.test.mjs` (append)

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `TypeError: D.createHostBridge is not a function`

- [ ] **Step 3: Implement**

Insert before `  return api;\n})();\n/* ca-demo-core:end */`:
```js
  // Minimal MCP Apps HOST side (the widget is @modelcontextprotocol/ext-apps, protocol 2026-01-26).
  // h = { post(msg), callTool(name, args) → Promise, context?, onReady?, onSize?, onOpenLink?, onModelContext? }
  api.HOST_PROTOCOL = '2026-01-26';
  api.createHostBridge = function (h) {
    var seq = 0;
    function reply(id, result) { h.post({ jsonrpc: '2.0', id: id, result: result }); }
    function fail(id, code, message) { h.post({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }
    function onRequest(msg) {
      var p = msg.params || {};
      switch (msg.method) {
        case 'ui/initialize':
          reply(msg.id, {
            protocolVersion: p.protocolVersion || api.HOST_PROTOCOL,
            hostInfo: { name: 'credentagent.ai', version: '1.0.0' },
            hostCapabilities: { openLinks: {}, serverTools: {}, updateModelContext: {} },
            hostContext: Object.assign({ theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline'], platform: 'web' }, h.context || {})
          });
          return;
        case 'tools/call':
          Promise.resolve()
            .then(function () { return h.callTool(p.name, p.arguments || {}); })
            .then(function (result) { reply(msg.id, result); },
                  function (err) { fail(msg.id, -32603, (err && err.message) || 'Tool call failed'); });
          return;
        case 'ui/open-link':
          if (h.onOpenLink) h.onOpenLink(p.url);
          reply(msg.id, {});
          return;
        case 'ui/update-model-context':
          if (h.onModelContext) h.onModelContext(p);
          reply(msg.id, {});
          return;
        case 'ui/message':
          reply(msg.id, {});
          return;
        case 'ui/request-display-mode':
          reply(msg.id, { mode: 'inline' });
          return;
        default:
          fail(msg.id, -32601, 'Method not supported by this host: ' + msg.method);
      }
    }
    return {
      handle: function (msg) {
        if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return; // responses & junk
        if (msg.id !== undefined && msg.id !== null) { onRequest(msg); return; }
        if (msg.method === 'ui/notifications/initialized' && h.onReady) h.onReady();
        if (msg.method === 'ui/notifications/size-changed' && h.onSize && msg.params) h.onSize(msg.params.height);
      },
      notify: function (method, params) { h.post({ jsonrpc: '2.0', method: method, params: params || {} }); },
      teardown: function () { h.post({ jsonrpc: '2.0', id: 'teardown-' + (++seq), method: 'ui/resource-teardown', params: {} }); }
    };
  };

```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 29 tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/demo.test.mjs
git commit -s -m "feat(demo): minimal MCP Apps host bridge (ext-apps 2026-01-26)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: QR encoder (`qrMatrix`, `qrSvg`) + macOS round trip

A byte-mode, ECC-level-L QR encoder, compact after the Project Nayuki algorithm (MIT). It's needed because no external libraries are allowed. The checkout URL is about 560 characters, which lands on version 16 (81×81).

**Files:**
- Modify: `index.html` (inside `ca-demo-core`)
- Test: `tests/demo.test.mjs` (append)
- Create: `tests/qr-decode.swift`, `tests/qr-roundtrip.mjs`

- [ ] **Step 1: Append the failing unit tests**

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL — `TypeError: D.qrRsRemainder is not a function`

- [ ] **Step 3: Implement**

Insert before `  return api;\n})();\n/* ca-demo-core:end */`:
```js
  // ---- QR Code: byte mode, ECC level L. Compact port of the Project Nayuki algorithm (MIT). ----
  var QR_ECC_L = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
  var QR_BLOCKS_L = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];

  function qrGfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function qrRsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = qrGfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = qrGfMul(root, 0x02);
    }
    return result;
  }
  function qrRsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= qrGfMul(coef, factor); });
    });
    return result;
  }
  api.qrRsRemainder = function (data, degree) { return qrRsRemainder(data, qrRsDivisor(degree)); };

  function qrRawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function qrDataCodewords(ver) { return Math.floor(qrRawModules(ver) / 8) - QR_ECC_L[ver] * QR_BLOCKS_L[ver]; }
  function qrAlignPositions(ver, size) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    var out = [6];
    for (var pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  api.qrMatrix = function (text) {
    var utf8 = unescape(encodeURIComponent(text)), bytes = [];
    for (var b = 0; b < utf8.length; b++) bytes.push(utf8.charCodeAt(b));

    var ver, cap;
    for (ver = 1; ver <= 40; ver++) {
      cap = qrDataCodewords(ver) * 8;
      if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error('Text too long for a QR code');

    // Bit stream: byte mode, length, data, terminator, byte-align, pad bytes.
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (x) { put(x, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    // Split into blocks, append ECC, interleave.
    var numBlocks = QR_BLOCKS_L[ver], eccLen = QR_ECC_L[ver];
    var rawCodewords = Math.floor(qrRawModules(ver) / 8);
    var numShort = numBlocks - rawCodewords % numBlocks;
    var shortLen = Math.floor(rawCodewords / numBlocks);
    var divisor = qrRsDivisor(eccLen), blocks = [];
    for (var bi = 0, k = 0; bi < numBlocks; bi++) {
      var dat = data.slice(k, k + shortLen - eccLen + (bi < numShort ? 0 : 1));
      k += dat.length;
      var ecc = qrRsRemainder(dat, divisor);
      if (bi < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var codewords = [];
    for (var ci = 0; ci < blocks[0].length; ci++) {
      for (var bj = 0; bj < blocks.length; bj++) {
        if (ci !== shortLen - eccLen || bj >= numShort) codewords.push(blocks[bj][ci]);
      }
    }

    // Function patterns.
    var size = ver * 4 + 17, mods = [], fn = [];
    for (var r0 = 0; r0 < size; r0++) { mods.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function set(x, y, dark) { mods[y][x] = dark; fn[y][x] = true; }
    for (var t = 0; t < size; t++) { set(6, t, t % 2 === 0); set(t, 6, t % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var xx = c[0] + dx, yy = c[1] + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
            var d = Math.max(Math.abs(dx), Math.abs(dy));
            set(xx, yy, d !== 2 && d !== 4);
          }
        }
      }
    });
    var al = qrAlignPositions(ver, size), last = al.length - 1;
    al.forEach(function (ax, ia) {
      al.forEach(function (ay, ja) {
        if ((ia === 0 && ja === 0) || (ia === 0 && ja === last) || (ia === last && ja === 0)) return;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    function drawFormat(mask) {
      var data5 = (1 << 3) | mask;                               // ECC level L = 01
      var rem = data5;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fbits = ((data5 << 10) | rem) ^ 0x5412;
      function bit(i) { return ((fbits >>> i) & 1) !== 0; }
      for (var a = 0; a <= 5; a++) set(8, a, bit(a));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (var b2 = 9; b2 < 15; b2++) set(14 - b2, 8, bit(b2));
      for (var c2 = 0; c2 < 8; c2++) set(size - 1 - c2, 8, bit(c2));
      for (var d2 = 8; d2 < 15; d2++) set(8, size - 15 + d2, bit(d2));
      set(8, size - 8, true);                                    // the always-dark module
    }
    drawFormat(0);                                               // reserve the format area
    if (ver >= 7) {
      var rv = ver;
      for (var q = 0; q < 12; q++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1f25);
      var vbits = (ver << 12) | rv;
      for (var vi = 0; vi < 18; vi++) {
        var vb = ((vbits >>> vi) & 1) !== 0, va = size - 11 + vi % 3, vc = Math.floor(vi / 3);
        set(va, vc, vb); set(vc, va, vb);
      }
    }

    // Codewords, zig-zagging up and down in two-column strips.
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < codewords.length * 8) {
            mods[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
            idx++;
          }
        }
      }
    }

    // Mask: try all 8, keep the lowest penalty (N1 runs, N2 blocks, N4 balance).
    function maskHit(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) if (!fn[y][x] && maskHit(m, x, y)) mods[y][x] = !mods[y][x];
      }
    }
    function penalty() {
      var p = 0, dark = 0;
      for (var y = 0; y < size; y++) {
        var runH = 1, runV = 1;
        for (var x = 0; x < size; x++) {
          if (mods[y][x]) dark++;
          if (x > 0) {
            if (mods[y][x] === mods[y][x - 1]) { runH++; if (runH === 5) p += 3; else if (runH > 5) p++; } else runH = 1;
            if (mods[x][y] === mods[x - 1][y]) { runV++; if (runV === 5) p += 3; else if (runV > 5) p++; } else runV = 1;
          }
          if (x > 0 && y > 0) {
            var c = mods[y][x];
            if (c === mods[y][x - 1] && c === mods[y - 1][x] && c === mods[y - 1][x - 1]) p += 3;
          }
        }
      }
      var total = size * size;
      return p + Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var score = penalty();
      if (score < bestScore) { best = m; bestScore = score; }
      applyMask(m);                                              // XOR again undoes it
    }
    applyMask(best);
    drawFormat(best);
    return mods;
  };

  api.qrSvg = function (text, px) {
    var m = api.qrMatrix(text), n = m.length, quiet = 4, dim = n + quiet * 2, d = '';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code for the checkout link">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  };

```

- [ ] **Step 4: Run the unit tests**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 32 tests.

- [ ] **Step 5: Create the macOS decoder**

`tests/qr-decode.swift`:
```swift
// Decodes a QR code from a PNG with CoreImage. Usage: swift tests/qr-decode.swift <file.png>
import Foundation
import CoreImage

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = CIImage(contentsOf: url) else {
    FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
    exit(2)
}
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                          options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
let messages = detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
guard let first = messages.first else {
    FileHandle.standardError.write("no QR code found\n".data(using: .utf8)!)
    exit(1)
}
print(first)
```

- [ ] **Step 6: Create the round-trip script**

`tests/qr-roundtrip.mjs`:
```js
// macOS-only end-to-end check: encode with the page's QR code, rasterize to PNG, decode with CoreImage.
// Usage: node tests/qr-roundtrip.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore } from './load-core.mjs';

if (process.platform !== 'darwin') { console.log('skip: needs macOS (CoreImage QR detector)'); process.exit(0); }
const D = loadCore();

function png(matrix, scale = 8, quiet = 4) {
  const n = matrix.length, dim = (n + quiet * 2) * scale;
  const raw = Buffer.alloc((dim + 1) * dim, 255);                 // grayscale, white
  for (let y = 0; y < dim; y++) {
    raw[y * (dim + 1)] = 0;                                        // filter byte: none
    for (let x = 0; x < dim; x++) {
      const my = Math.floor(y / scale) - quiet, mx = Math.floor(x / scale) - quiet;
      if (my >= 0 && my < n && mx >= 0 && mx < n && matrix[my][mx]) raw[y * (dim + 1) + 1 + x] = 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4); ihdr[8] = 8; // bit depth 8, color type 0 (gray)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const decoder = fileURLToPath(new URL('./qr-decode.swift', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ca-qr-'));
const samples = [
  'HELLO WORLD',
  'https://credentagent.ai/',
  'https://credentagent-demo-dev.vercel.app/checkout?order=ORD-o01nne&cart=' + 'eyJ0eXBlIjoiYXAyLkNhcnRNYW5kYXRlIiwi'.repeat(14).slice(0, 488),
];
let failed = 0;
samples.forEach((text, i) => {
  const file = join(dir, `qr-${i}.png`);
  writeFileSync(file, png(D.qrMatrix(text)));
  let decoded;
  try { decoded = execFileSync('swift', [decoder, file], { encoding: 'utf8', timeout: 180000 }).trim(); }
  catch (e) { decoded = `(decode failed: ${String(e.stderr || e.message).trim()})`; }
  const ok = decoded === text;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(text.length).padStart(3)} chars  v${(D.qrMatrix(text).length - 17) / 4}${ok ? '' : '  → ' + decoded.slice(0, 80)}`);
});
process.exit(failed ? 1 : 0);
```

- [ ] **Step 7: Run the round trip**

Run: `node tests/qr-roundtrip.mjs`
Expected (the first `swift` run compiles, so allow up to about a minute):
```
PASS   11 chars  v1
PASS   24 chars  v2
PASS  560 chars  v16
```
If any sample FAILs, the encoder has a bug. Do not continue to Task 8. Debug with `superpowers:systematic-debugging`, starting with the version-1 case.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/demo.test.mjs tests/qr-decode.swift tests/qr-roundtrip.mjs
git commit -s -m "feat(demo): inline QR encoder for the desktop hand-off, verified by a CoreImage round trip" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Live contract smoke (`tests/contract.mjs`)

**Files:**
- Create: `tests/contract.mjs`

- [ ] **Step 1: Create it**

```js
// Contract smoke: what the in-browser demo assumes about the live MCP endpoint.
// Usage: node tests/contract.mjs [endpoint]
//   default: https://credentagent.ai/marketplace-dev/mcp (library main, redeployed on every merge)
// Note: each run creates two unpaid demo orders on that deployment.
import { loadCore } from './load-core.mjs';

const D = loadCore();
const endpoint = process.argv[2] || 'https://credentagent.ai/marketplace-dev/mcp';
const mcp = D.createMcpClient({ endpoint, fetch, timeoutMs: 30000 });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

try {
  const list = await mcp.call('tools/list', {});
  const names = (list.tools || []).map((t) => t.name);
  for (const n of ['browse-products', 'set-quantity', 'checkout', 'get-cart']) check(names.includes(n), `tools/list has ${n}`, names.join(', '));

  const widget = D.pickWidget(list, 'browse-products');
  check(!!widget, 'browse-products declares a widget (_meta.ui.resourceUri)');

  const browse = await mcp.call('tools/call', { name: 'browse-products', arguments: {} });
  check(!browse.isError, 'browse-products succeeds');

  if (widget) {
    const read = await mcp.call('resources/read', { uri: widget.uri });
    const c = read.contents && read.contents[0];
    check(!!c && /profile=mcp-app/.test(c.mimeType || ''), 'widget resource is text/html;profile=mcp-app', c && c.mimeType);
    check(!!c && (c.text || '').includes('ui/initialize'), 'widget speaks the MCP Apps handshake (ui/initialize)');
  }

  const whiskey = D.summarizeCheckout(await mcp.call('tools/call', { name: 'checkout', arguments: { items: [{ productId: 'oak-whiskey', quantity: 1 }] } }));
  check(whiskey.ok && whiskey.gated, 'checkout(oak-whiskey) requires age', whiskey.chip);

  const phones = D.summarizeCheckout(await mcp.call('tools/call', { name: 'checkout', arguments: { items: [{ productId: 'aurora-headphones', quantity: 1 }] } }));
  check(phones.ok && !phones.gated, 'checkout(aurora-headphones) has no age gate', phones.chip);

  if (whiskey.checkoutUrl) {
    const origin = new URL(whiskey.checkoutUrl).origin;
    const res = await fetch(`${origin}/checkout/order-status?orderId=${encodeURIComponent(whiskey.orderId)}`);
    check(res.ok && res.headers.get('access-control-allow-origin') === '*', 'order-status is readable cross-origin');
    const body = await res.json();
    check(body && body.completed === false, 'order-status reports an unpaid order as not completed');
  }
} catch (e) {
  check(false, 'endpoint reachable', `${e.kind || 'error'}: ${e.message}`);
}
console.log(failures ? `\n${failures} check(s) failed against ${endpoint}` : `\nAll checks passed against ${endpoint}`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it against dev**

Run: `node tests/contract.mjs`
Expected: 12 `PASS` lines, then `All checks passed against https://credentagent.ai/marketplace-dev/mcp`.

- [ ] **Step 3: Commit**

```bash
git add tests/contract.mjs
git commit -s -m "test(demo): live contract smoke for the MCP endpoint the demo depends on" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Local router stand-in (`tools/dev-server.py`)

**Files:**
- Create: `tools/dev-server.py`

- [ ] **Step 1: Create it**

```python
#!/usr/bin/env python3
"""Local stand-in for the credentagent.ai router (deploy/router/vercel.json in the library repo).

Serves this repo at / and proxies /marketplace-dev/* and /marketplace/* to the demo deployments,
so the in-browser demo runs same-origin locally exactly as it does on credentagent.ai.
Usage: python3 tools/dev-server.py [port]   (default 8787)
"""
import http.server
import os
import sys
import urllib.error
import urllib.request

ROUTES = {
    "/marketplace-dev/": "https://credentagent-demo-dev.vercel.app/",
    "/marketplace/": "https://credentagent-demo.vercel.app/",
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORWARD_REQUEST = ("content-type", "accept", "mcp-session-id", "mcp-protocol-version")
FORWARD_RESPONSE = ("content-type", "mcp-session-id")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _target(self):
        for prefix, origin in ROUTES.items():
            if self.path.startswith(prefix):
                return origin + self.path[len(prefix):]
        return None

    def _proxy(self, target):
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() in FORWARD_REQUEST}
        request = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status, reply_headers, data = response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            status, reply_headers, data = error.code, error.headers, error.read()
        self.send_response(status)
        for name in FORWARD_RESPONSE:
            if reply_headers.get(name):
                self.send_header(name, reply_headers.get(name))
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        target = self._target()
        return self._proxy(target) if target else super().do_GET()

    def do_POST(self):
        target = self._target()
        return self._proxy(target) if target else self.send_error(405)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"credentagent.ai stand-in: http://localhost:{port}/  (proxying /marketplace-dev/, /marketplace/)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
```

- [ ] **Step 2: Verify the proxy**

Run in the background: `python3 tools/dev-server.py 8787`
Then run:
```bash
curl -s -X POST http://localhost:8787/marketplace-dev/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"browse-products"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787/
```
Expected: `"name":"browse-products"`, then `200`. Stop the server afterwards.

- [ ] **Step 3: Commit**

```bash
git add tools/dev-server.py
git commit -s -m "chore(dev): local credentagent.ai router stand-in for same-origin demo testing" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: *Try it live* tabs, hero link, scoped tabs script

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Scope the tabs script per tab list**

Replace the whole existing tabs script body, which currently starts with:
```js
// "What's new" tabs — ARIA tabs pattern (click + arrow keys / Home / End)
(function(){
  var tabs = [].slice.call(document.querySelectorAll('.tablist [role="tab"]'));
```
and ends at its `})();`, with:
```js
// Tabs — ARIA tabs pattern (click + arrow keys / Home / End), one independent group per .tablist
(function(){
  [].slice.call(document.querySelectorAll('.tablist')).forEach(function(list){
    var tabs = [].slice.call(list.querySelectorAll('[role="tab"]'));
    function select(t){
      tabs.forEach(function(x){
        var on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    }
    tabs.forEach(function(t, i){
      t.addEventListener('click', function(){ select(t); });
      t.addEventListener('keydown', function(e){
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 :
                e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (j === null) return;
        e.preventDefault();
        var n = tabs[(j + tabs.length) % tabs.length];
        select(n); n.focus();
      });
    });
  });
})();
```

- [ ] **Step 2: Open the tabs markup**

Replace:
```html
  <!-- TRY IT LIVE -->
  <section><div class="wrap">
    <div class="seclabel">Try it live</div>
    <h2>A complete MCP storefront — no setup required.</h2>
    <p class="sub">credentagent-storefront is a ready-to-run MCP server: nine shopping tools, a product widget, and a gated checkout. Add the hosted connector and order the whiskey — the age gate fires automatically.</p>
    <div class="try-cols">
```
with:
```html
  <!-- TRY IT LIVE -->
  <section id="try"><div class="wrap">
    <div class="seclabel">Try it live</div>
    <h2>A complete MCP storefront — try it right here, or in your own agent.</h2>
    <div class="tabs tabs-plain">
      <div class="tablist" role="tablist" aria-label="Ways to try CredentAgent">
        <button class="tab" role="tab" id="t-here" aria-controls="p-here" aria-selected="true">▶ Right here</button>
        <button class="tab" role="tab" id="t-connector" aria-controls="p-connector" aria-selected="false" tabindex="-1">In Claude / ChatGPT / Goose</button>
      </div>

      <div class="tabpanel" role="tabpanel" id="p-here" aria-labelledby="t-here" tabindex="0">
        <p class="sub">Pick a scenario. A scripted agent drives the <b style="color:var(--ink)">real</b> MCP storefront — every ⚙ chip is a live tool call — and you shop in the real product picker. Adult items stop at the gate until <b style="color:var(--ink)">you</b> prove it with your wallet.</p>
        <div class="demo" id="demo">
          <div class="demo-bar">
            <button class="demo-scn" type="button" data-scenario="whiskey" aria-pressed="false">🥃 Buy the whiskey (21+)</button>
            <button class="demo-scn" type="button" data-scenario="headphones" aria-pressed="false">🎧 Buy the headphones</button>
            <button class="demo-reset" type="button" id="demo-reset" hidden>↺ Start over</button>
          </div>
          <div class="demo-offsite" id="demo-offsite" hidden>
            <span>The in-browser demo runs on credentagent.ai.</span>
            <a class="btn" href="https://credentagent.ai/#try">Try it on credentagent.ai ↗</a>
          </div>
          <div class="demo-log" id="demo-log" role="log" aria-live="polite" aria-label="Agent conversation"></div>
        </div>
        <p class="try-prereq">📱 To prove credentials on your device, install <a href="https://apps.multipaz.org" target="_blank" rel="noopener">Multipaz Wallet</a> (Android &amp; iOS).</p>
      </div>

      <div class="tabpanel" role="tabpanel" id="p-connector" aria-labelledby="t-connector" tabindex="0" hidden>
    <p class="sub">credentagent-storefront is a ready-to-run MCP server: nine shopping tools, a product widget, and a gated checkout. Add the hosted connector and order the whiskey — the age gate fires automatically.</p>
    <div class="try-cols">
```

- [ ] **Step 3: Close the tabs markup**

Replace:
```html
    </div>
  </div></section>

  <!-- HOW IT WORKS -->
```
with:
```html
    </div>
      </div>
    </div>
  </div></section>

  <!-- HOW IT WORKS -->
```
(The first `</div>` still closes `.try-cols`. The next two close the connector tab panel and `.tabs`.)

- [ ] **Step 4: Hero link**

Replace:
```html
        <a class="cta-ghost" href="https://github.com/openmobilehub/credentagent/tree/main/docs/reference">Read the docs →</a>
      </div>
```
with:
```html
        <a class="cta-ghost" href="https://github.com/openmobilehub/credentagent/tree/main/docs/reference">Read the docs →</a>
        <a class="cta-ghost" href="#try">Try it in your browser ↓</a>
      </div>
```

- [ ] **Step 5: CSS**

Insert immediately before `  /* ---------- reduced motion: static success state ---------- */`:
```css
  /* ---------- in-browser demo (Try it live → Right here) ---------- */
  .tabs-plain{background:transparent;border:none;border-radius:0;overflow:visible;margin-top:1.2rem}
  .tabs-plain .tablist{background:transparent;padding:0}
  .tabs-plain .tab[aria-selected="true"]{background:var(--bg2)}
  .tabs-plain .tabpanel{padding:1.4rem 0 0}
  .demo{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:1rem;margin:1rem 0}
  .demo-bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
  .demo-scn{font:inherit;font-size:.95rem;font-weight:700;color:#031425;background:var(--teal);border:none;border-radius:10px;padding:.75rem 1.1rem;cursor:pointer;transition:background .2s,transform .1s}
  .demo-scn:hover{background:var(--teal2);transform:translateY(-1px)}
  .demo-scn[aria-pressed="true"]{box-shadow:0 0 0 2px var(--bg2),0 0 0 4px var(--teal)}
  .demo-scn:disabled{opacity:.5;cursor:default;transform:none}
  .demo-scn:focus-visible,.demo-reset:focus-visible,.d-link:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
  .demo-reset{font:inherit;font-size:.85rem;color:var(--mut);background:transparent;border:1px solid var(--line);border-radius:8px;padding:.5rem .8rem;cursor:pointer;margin-left:auto}
  .demo-offsite{color:var(--mut);margin-top:.8rem;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}
  .demo-log{display:flex;flex-direction:column;gap:.6rem;margin-top:1rem}
  .demo-log:empty{display:none}
  .d-row{display:flex}.d-row.user{justify-content:flex-end}
  .d-bubble{max-width:80%;padding:.6rem .85rem;border-radius:12px;font-size:.9rem;line-height:1.45;background:#0b1038;border:1px solid var(--line)}
  .d-row.user .d-bubble{background:#0e1440;border-bottom-right-radius:4px}
  .d-row.agent .d-bubble{border-bottom-left-radius:4px}
  .d-bubble.ok{border-color:rgba(52,211,153,.45);box-shadow:0 0 18px -6px rgba(52,211,153,.4)}
  .d-bubble.err{border-color:rgba(248,113,113,.5)}
  .d-chip{align-self:flex-start;font-family:ui-monospace,Menlo,monospace;font-size:.76rem;color:var(--mut);background:var(--code);border:1px solid var(--line);border-radius:7px;padding:.3rem .6rem;max-width:100%;overflow-wrap:anywhere}
  .d-chip b{color:var(--teal);font-weight:600}
  .d-chip .st{margin-left:.4rem}.d-chip.ok .st{color:var(--green)}.d-chip.err .st{color:#f87171}
  .d-frame{width:100%;border:0;display:block;height:160px;border-radius:12px;background:transparent;color-scheme:dark}
  .d-card{border:1px dashed rgba(56,189,248,.45);border-radius:12px;padding:.9rem 1rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start;background:var(--code)}
  .d-card .qr{flex:none;background:#fff;border-radius:8px;padding:6px;line-height:0}
  .d-card .qr svg{width:264px;height:264px;max-width:100%}
  .d-card .body{flex:1;min-width:14rem;font-size:.88rem;color:var(--mut);line-height:1.6;display:flex;flex-direction:column;gap:.35rem;align-items:flex-start}
  .d-card .body a:not(.btn){color:var(--teal);text-decoration:underline;text-underline-offset:2px}
  .d-card .honest{font-size:.75rem;color:var(--dim)}
  .d-actions{display:flex;gap:.5rem;flex-wrap:wrap}
  .d-link{font:inherit;font-size:.82rem;color:var(--teal);background:none;border:1px solid rgba(56,189,248,.4);border-radius:8px;padding:.45rem .75rem;cursor:pointer}

```
And inside the existing `@media (max-width:520px){ … }` block, after `.module-cards{grid-template-columns:1fr}`, add:
```css
    .d-bubble{max-width:92%}
    .demo-reset{margin-left:0}
```

- [ ] **Step 6: Verify tabs and self-containment**

Run:
```bash
grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l
node --test "tests/*.test.mjs"
```
Expected: `0`, and all tests PASS.

Then open `index.html` over `file://` in Chrome:
- **Try it live:** shows "▶ Right here" selected. The scenario buttons are visible but do nothing yet (Task 11 wires them up). "In Claude / ChatGPT / Goose" shows the old connector content and video.
- **What's new:** its tabs still switch independently.
- **Keyboard:** arrow keys on one tab list don't move the other.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -s -m "feat(site): Try it live becomes tabs (Right here / In your agent); tabs script scoped per group" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Demo DOM wiring

**Files:**
- Modify: `index.html` (new `<script>` after the `ca-demo-core` script, before `</body>`)

- [ ] **Step 1: Add the wiring script**

Insert immediately after the `ca-demo-core` `</script>` and before `</body>`:
```html
<script>
// In-browser agent demo — see docs/superpowers/specs/2026-09-25-in-browser-agent-design.md
(function(){
  var root = document.getElementById('demo');
  if (!root || !window.CADemo) return;
  var D = window.CADemo;
  var ENDPOINT = '/marketplace-dev/mcp';     // same-origin via the credentagent.ai router; '/marketplace/mcp' = published 0.4.0
  var WIDGET_TOOL = 'browse-products';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var log = document.getElementById('demo-log');
  var resetBtn = document.getElementById('demo-reset');
  var scnBtns = [].slice.call(root.querySelectorAll('.demo-scn'));

  if (!D.isDemoOrigin(location.hostname)) {
    document.getElementById('demo-offsite').hidden = false;
    scnBtns.forEach(function(b){ b.disabled = true; });
    return;
  }

  var mcp = D.createMcpClient({ endpoint: ENDPOINT, fetch: window.fetch.bind(window) });
  var guard = D.createRunGuard();
  var run = null;   // { token, frame, bridge, onMessage, readyTimer, ready }

  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function pause(ms){ return new Promise(function(r){ setTimeout(r, reduce ? 0 : ms); }); }
  function add(node){ log.appendChild(node); return node; }
  function say(who, text, cls){
    var row = el('div', 'd-row ' + who);
    row.appendChild(el('div', 'd-bubble' + (cls ? ' ' + cls : ''), text));
    return add(row);
  }
  function chip(label, args){
    var c = el('div', 'd-chip');
    c.appendChild(document.createTextNode('⚙ '));
    c.appendChild(el('b', null, label));
    var a = D.formatArgs(args);
    if (a) c.appendChild(document.createTextNode(' ' + a));
    var st = el('span', 'st', '…');
    c.appendChild(st);
    add(c);
    var t0 = performance.now();
    return {
      ok: function(extra){ c.classList.add('ok'); st.textContent = '✓ ' + Math.round(performance.now() - t0) + ' ms' + (extra ? ' ' + extra : ''); },
      fail: function(msg){ c.classList.add('err'); st.textContent = '✗ ' + msg; }
    };
  }
  // Every MCP call — the page's own and the widget's (via the bridge) — shows as one real chip.
  function rpc(token, method, params, label, chipArgs, describe){
    var c = chip(label, chipArgs);
    return mcp.call(method, params).then(function(result){
      if (guard.isCurrent(token)) {
        if (result && result.isError) c.fail('tool error');
        else c.ok(describe ? describe(result) : '');
      }
      return result;
    }, function(err){
      if (guard.isCurrent(token)) c.fail(err.message);
      throw err;
    });
  }
  function tool(token, name, args, describe){
    return rpc(token, 'tools/call', { name: name, arguments: args || {} }, name, args, describe);
  }

  function teardown(){
    if (!run) return;
    clearTimeout(run.readyTimer);
    if (run.onMessage) window.removeEventListener('message', run.onMessage);
    if (run.bridge) run.bridge.teardown();
    if (run.frame && run.frame.parentNode) run.frame.parentNode.removeChild(run.frame);
    run = null;
  }
  function reset(){
    guard.next();
    teardown();
    log.textContent = '';
    scnBtns.forEach(function(b){ b.setAttribute('aria-pressed', 'false'); });
    resetBtn.hidden = true;
  }
  function retryRow(message, retry){
    say('agent', message, 'err');
    var actions = el('div', 'd-actions');
    var again = el('button', 'd-link', 'Retry');
    again.type = 'button';
    again.addEventListener('click', retry);
    var alt = el('button', 'd-link', 'Use it in Claude / ChatGPT / Goose instead');
    alt.type = 'button';
    alt.addEventListener('click', function(){ document.getElementById('t-connector').click(); });
    actions.appendChild(again);
    actions.appendChild(alt);
    add(actions);
  }

  function start(key){
    reset();
    var s = D.SCENARIOS[key], token = guard.next();
    var state = { browse: null, checkout: null, handedOff: false, done: false };
    run = { token: token };
    scnBtns.forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-scenario') === key ? 'true' : 'false'); });
    resetBtn.hidden = false;
    var retry = function(){ start(key); };
    var widget;

    say('user', s.prompt);
    pause(450).then(function(){
      if (!guard.isCurrent(token)) return;
      say('agent', 'Let me open the store.');
      return rpc(token, 'tools/list', {}, 'tools/list').then(function(list){
        widget = D.pickWidget(list, WIDGET_TOOL);
        if (!widget) throw new Error('the store has no product picker');
        return tool(token, WIDGET_TOOL, {});
      }).then(function(browse){
        state.browse = browse;
        return rpc(token, 'resources/read', { uri: widget.uri }, 'resources/read', { uri: widget.uri });
      }).then(function(read){
        if (!guard.isCurrent(token)) return;
        var content = read && read.contents && read.contents[0];
        if (!content || !content.text) throw new Error('the product picker resource is empty');
        mountWidget(token, s, widget, state, content, retry);
      }).catch(function(err){
        if (guard.isCurrent(token)) retryRow('The demo store isn’t responding right now (' + err.message + ').', retry);
      });
    });
  }

  function mountWidget(token, s, widget, state, content, retry){
    var r = run;
    var frame = el('iframe', 'd-frame');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.setAttribute('title', 'Product picker — the MCP app served by the CredentAgent storefront');
    frame.srcdoc = D.buildSrcdoc(content.text, content._meta && content._meta.ui && content._meta.ui.csp);

    var bridge = D.createHostBridge({
      post: function(m){ if (frame.contentWindow) frame.contentWindow.postMessage(m, '*'); },
      context: { toolInfo: { tool: widget.tool } },
      callTool: function(name, args){
        var describe = name === 'checkout' ? function(res){ return D.summarizeCheckout(res).chip; } : null;
        return tool(token, name, args, describe).then(function(result){
          if (guard.isCurrent(token) && name === 'checkout') onCheckout(token, state, result);
          return result;
        });
      },
      onReady: function(){
        if (!guard.isCurrent(token)) return;
        clearTimeout(r.readyTimer);
        r.ready = true;
        bridge.notify('ui/notifications/tool-input', { arguments: {} });
        bridge.notify('ui/notifications/tool-result', state.browse);
        pause(300).then(function(){ if (guard.isCurrent(token)) say('agent', D.tapLine(s)); });
      },
      onSize: function(h){ if (typeof h === 'number' && h > 0) frame.style.height = Math.min(h, 900) + 'px'; },
      onOpenLink: function(url){ if (guard.isCurrent(token)) handOff(token, state, url); },
      onModelContext: function(){ if (guard.isCurrent(token)) finish(token, state, false); }
    });

    var onMessage = function(e){
      var msg = D.acceptMessage(e, frame.contentWindow);
      if (msg && guard.isCurrent(token)) bridge.handle(msg);
    };
    window.addEventListener('message', onMessage);
    r.frame = frame; r.bridge = bridge; r.onMessage = onMessage;
    r.readyTimer = setTimeout(function(){
      if (!guard.isCurrent(token) || r.ready) return;
      teardown();
      retryRow('The product picker didn’t load.', retry);
    }, 10000);
    add(frame);
  }

  function onCheckout(token, state, result){
    var sum = D.summarizeCheckout(result);
    if (!sum.ok) return;
    state.checkout = sum;
    sum.lines.forEach(function(line, i){
      pause(250 * (i + 1)).then(function(){ if (guard.isCurrent(token)) say('agent', line); });
    });
  }

  function handOff(token, state, url){
    if (state.handedOff) return;
    state.handedOff = true;
    var card = el('div', 'd-card');
    var showQr = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (showQr) {
      try {
        var qr = el('div', 'qr');
        qr.innerHTML = D.qrSvg(url, 264);    // generated SVG: path data only, no URL text inside
        card.appendChild(qr);
      } catch (e) { showQr = false; }
    }
    var body = el('div', 'body');
    var go = el('a', 'btn', 'Continue to checkout ↗');
    go.href = url; go.target = '_blank'; go.rel = 'noopener';
    body.appendChild(go);
    function line(html){ var n = el('div'); n.innerHTML = html; body.appendChild(n); }   // static strings only
    line('📱 Proving needs <a href="https://apps.multipaz.org" target="_blank" rel="noopener">Multipaz Wallet</a> · Chrome 141+ on Android or iOS 18+ — the checkout page uses the W3C Digital Credentials API.');
    if (showQr) line('On a computer? Scan the QR code to open this checkout on your phone.');
    line('No wallet or unsupported browser? The checkout page offers an <b>instant demo</b> button.');
    var check = el('button', 'd-link', 'I’ve finished — check the order');
    check.type = 'button';
    check.addEventListener('click', function(){ finish(token, state, true); });
    body.appendChild(check);
    body.appendChild(el('div', 'honest', '🔒 presence-only-demo · the wire crypto is real; the issuer trust anchor is not'));
    card.appendChild(body);
    add(card);
    say('agent', 'I’ll wait here while you prove it.');
  }

  // Completion is read from the SETTLED order — never assumed.
  function finish(token, state, manual){
    if (state.done || !state.checkout) return;
    var origin = new URL(state.checkout.checkoutUrl).origin;
    fetch(origin + '/checkout/order-status?orderId=' + encodeURIComponent(state.checkout.orderId))
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(s){
        if (!guard.isCurrent(token) || state.done) return;
        if (s && s.completed) { state.done = true; say('agent', D.completionLine(s.order), 'ok'); }
        else if (manual) say('agent', 'Not completed yet — finish the proof and payment on the checkout page, then check again.');
      }, function(){
        if (manual && guard.isCurrent(token)) say('agent', 'I couldn’t reach the order status just now — try again in a moment.', 'err');
      });
  }

  scnBtns.forEach(function(b){ b.addEventListener('click', function(){ start(b.getAttribute('data-scenario')); }); });
  resetBtn.addEventListener('click', reset);
})();
</script>
```

- [ ] **Step 2: Static checks**

Run:
```bash
grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l
node --test "tests/*.test.mjs"
python3 - <<'EOF'
import re, subprocess, tempfile, os
s = open('index.html').read()
for i, js in enumerate(re.findall(r'<script>(.*?)</script>', s, re.S)):
    f = os.path.join(tempfile.gettempdir(), f'ca-script-{i}.js'); open(f, 'w').write(js)
    subprocess.run(['node', '--check', f], check=True)
print('all inline scripts parse')
EOF
```
Expected: `0`, all tests PASS, and `all inline scripts parse`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -s -m "feat(demo): in-browser agent — scenario runs, MCP Apps host, wallet hand-off, settled-order completion" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Local end-to-end in Chrome

**Files:** none (verification). If a bug is found, fix it in `index.html` with a failing unit test first wherever the bug is in `ca-demo-core`.

- [ ] **Step 1: Start the stand-in router**

Run in the background: `python3 tools/dev-server.py 8787`

- [ ] **Step 2: Whiskey run** (Chrome via the `claude-in-chrome` tools, recording a GIF named `in-browser-agent-whiskey.gif`)

Open `http://localhost:8787/#try` and click **🥃 Buy the whiskey (21+)**. Expect, in order:
1. The user bubble "Buy the Oak Reserve whiskey."
2. The agent says "Let me open the store."
3. Chips `tools/list ✓`, `browse-products ✓` and `resources/read {"uri":…} ✓`.
4. The product picker appears **with all products**, and the frame height fits its content (no inner scrollbar).
5. The agent says "Tap + on the Oak Reserve Whiskey Collection, then Checkout."

Then, inside the picker, tap **+** on Oak Reserve Whiskey. Expect the chip `set-quantity {"productId":"oak-whiskey","quantity":1} ✓`.

Then tap **Checkout** in the picker. Expect:
- the chip `checkout … ✓ … → 🔒 Age 21+ · Pay (USD)`
- the agent lines "🔒 Age 21+ required…" and "Optional: 10% member discount."
- the hand-off card: QR code, "Continue to checkout ↗", the Multipaz line, the instant-demo note, "I've finished — check the order", and the presence-only footer

Last, read the console (`read_console_messages`, pattern `Content-Security-Policy|ext-apps|Error`). Expect no CSP violations that block the widget.

- [ ] **Step 3: Complete via the instant demo**

- Click **Continue to checkout ↗**. A new tab opens on `credentagent-demo-dev.vercel.app/checkout?...`.
- There, use **Verify age (instant demo)**, then pay with the instant-demo option.
- Back on the demo tab, within about 3 s (the widget's poll interval), expect the picker's confirmation, a `get-cart ✓` chip and the green bubble "✓ Order placed — $<settled amount>."
- Also click **I've finished — check the order** once *before* completing and expect "Not completed yet — …".

- [ ] **Step 4: Headphones, Start over, failure path**

- **Headphones:** click **🎧 Buy the headphones**. The log resets, then run + Aurora → Checkout. Expect "No age check needed. This order needs: Pay (USD)."
- **Start over:** click **↺ Start over**. The log clears and the picker is removed.
- **Failure path:** stop the dev server and click a scenario. Expect a red `tools/list ✗ …` chip and the agent's "The demo store isn't responding right now (…)" with **Retry** and **Use it in Claude / ChatGPT / Goose instead** (the latter switches tabs). Restart the server afterwards.

- [ ] **Step 5: Off-site guard and reduced motion**

- **Off-site guard:** open `index.html` via `file://`. Expect "The in-browser demo runs on credentagent.ai." with the link, and disabled scenario buttons.
- **Reduced motion:** with DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce", run the whiskey scenario. Expect bubbles to appear with no delay and the hero to show its static final state.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A index.html tests
git commit -s -m "fix(demo): <what the E2E run found>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
(Skip this step if nothing changed.)

---

### Task 13: Docs, final verification, PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In **Conventions — do not regress**, replace:
```markdown
  Note: the YouTube `<iframe>` embed is intentional and exempt from this check.
```
with:
```markdown
  Note: the YouTube `<iframe>` embed is intentional and exempt from this check. So is the in-browser
  demo's **same-origin** `fetch` to `/marketplace-dev/mcp` (the credentagent.ai router proxies it; the
  `ENDPOINT` constant in the demo script switches to `/marketplace/mcp` for the published 0.4.0 build).
```

In **Design → Sections**, replace:
```markdown
- **Sections (top→bottom):** sticky nav → animated hero → problem band → try-it-live (YouTube demo +
  hosted connector) → how-it-works (3 cards)
```
with:
```markdown
- **Sections (top→bottom):** sticky nav → animated hero → problem band → try-it-live (tabs: **▶ Right
  here** — the in-browser agent demo — and **In Claude / ChatGPT / Goose** — YouTube demo + hosted
  connector) → how-it-works (3 cards)
```

Append a new section before `## Current state`:
```markdown
## In-browser agent demo — test & run

- Spec: `docs/superpowers/specs/2026-09-25-in-browser-agent-design.md`. Logic lives in the pure
  `ca-demo-core` script (between `/* ca-demo-core:begin */` and `/* ca-demo-core:end */`); the DOM script
  after it wires it to the page.
- Unit tests (zero deps): `node --test "tests/*.test.mjs"`
- Live contract vs. the endpoint: `node tests/contract.mjs` — run it in any library PR that changes
  the storefront's tools, transport, or MCP Apps widget (e.g. the MCP 728 migration).
- QR round trip (macOS): `node tests/qr-roundtrip.mjs`
- Local same-origin run: `python3 tools/dev-server.py` → http://localhost:8787/#try
- The demo only runs on `credentagent.ai` (and localhost); the GitHub Pages copy links there instead.
```

Also delete the `- **Idea — in-browser agent (2026-09-25, not started):** …` bullet (all six lines of it) from **Current state**, since it's now built.

- [ ] **Step 2: Final verification**

Run:
```bash
node --test "tests/*.test.mjs"
node tests/contract.mjs
node tests/qr-roundtrip.mjs
grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l
```
Expected: all unit tests PASS; `All checks passed…`; three QR `PASS` lines; `0`.

- [ ] **Step 3: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -s -m "docs: in-browser demo carve-out, test commands, and dev server" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/in-browser-agent
gh pr create --base main --title "In-browser agent demo on credentagent.ai" --body "<summary + the E2E GIF + the verification output; end with the Claude Code attribution line>"
```

- [ ] **Step 4: After merge: real-device checks (live origin only)**

On https://credentagent.ai/#try:
- Android Chrome 141+ with Multipaz: the whiskey proof through the real wallet (Verify with my digital ID), and the headphones payment.
- Desktop Chrome: scan the hand-off QR code with the phone and complete there. The desktop tab turns ✓.
- iOS 18 Safari: the same flow as Android.
- A browser without the Digital Credentials API: the gate page offers instant demo.
