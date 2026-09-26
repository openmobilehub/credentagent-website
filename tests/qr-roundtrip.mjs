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
