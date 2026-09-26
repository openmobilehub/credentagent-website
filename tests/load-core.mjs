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
