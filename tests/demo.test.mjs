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
