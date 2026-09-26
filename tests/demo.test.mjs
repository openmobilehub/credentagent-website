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
