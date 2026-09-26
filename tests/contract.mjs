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
