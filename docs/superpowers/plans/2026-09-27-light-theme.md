# Light Theme + Dark Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make credentagent.ai light by default on the CredentAgent brand palette (plus Precision Hydration purple/orange), with a remembered toggle to a brand dark theme.

**Architecture:**
- **Colour:** every colour becomes a semantic CSS token. `:root` holds light (the default) and `:root[data-theme="dark"]` overrides it.
- **Theme application:** a tiny inline boot script in `<head>` applies the saved theme before first paint. The theme logic (read/write/labels) lives in the pure `ca-demo-core` block so it can be unit-tested.
- **Toggle:** the nav toggle flips the attribute, saves the choice, and notifies the embedded MCP Apps picker via `host-context-changed`.
- **Brand:** the logo, favicon and wordmark font are inline, so the page stays self-contained.

**Tech Stack:**
- Vanilla CSS custom properties with `color-mix()`, and vanilla ES5-style JS (matching the site).
- `node --test` for tests, with zero dependencies.
- A throwaway Python venv (fonttools + brotli) to build the font subset; nothing from it is committed except the generator script.

**Spec:** `docs/superpowers/specs/2026-09-27-light-theme-design.md`

**Worktree / branch:** `/Users/diegozuluaga/tools/git/credentagent-website/.claude/worktrees/light-theme`, on branch `feat/light-theme`.
- Run every command from that directory. It is a git worktree, and the session's guard rejects complex shell (loops, `$(git …)`, heredocs mentioning git), so keep commands simple and put multi-line scripts in files.
- Scratchpad for temporary files: `/private/tmp/claude-501/-Users-diegozuluaga-tools-git-credentagent-website/cbe90bee-7f43-4095-9c86-ca1eaee8244d/scratchpad` (called `$S` below — write it out literally).

**Conventions:**
- Every commit uses `git commit -s` and ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The self-contained check must stay at 0:
  `grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l`
- Python: `python3` on this machine is the python.org build without CA certificates. Use `/opt/homebrew/bin/python3` for anything that downloads.

## File structure

| File | Responsibility |
|---|---|
| `index.html` (modify) | Token blocks and re-tokenised CSS; head boot script and meta; favicon; logo, colour bar, toggle and footer markup; `@font-face` subset; theme API in `ca-demo-core`; toggle script; demo wiring for theme sync |
| `tests/theme.test.mjs` (create) | Page-level theme tests: tokens, contrast, no stray colour literals, text-colour rules, wordmark, font, boot script |
| `tests/demo.test.mjs` (modify) | Core theme API and bridge `setTheme` tests; update the one `ui/initialize` expectation (`'dark'` → `'light'`) |
| `tools/build-wordmark-font.py` (create) | Regenerates the Space Grotesk 600 wordmark subset (base64 woff2) |
| `CLAUDE.md` (modify) | The design direction (brand palette, light by default, dark toggle), token and wordmark rules, font licence |

**Test command:** `node --test "tests/*.test.mjs"`. It runs 46 tests today.

---

### Task 1: Theme test suite (tokens, contrast, no literals, text-colour rules)

**Files:**
- Create: `tests/theme.test.mjs`

- [ ] **Step 1: Create the failing tests**

`tests/theme.test.mjs`:
```js
// Page-level theme checks: they read index.html directly (no build step), so they guard the real page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function block(re) {
  const m = style.match(re);
  if (!m) throw new Error('token block not found: ' + re);
  const out = {};
  for (const [, name, value] of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[name] = value.trim();
  return out;
}
const LIGHT = () => block(/:root\{([^}]*)\}/);
const DARK = () => ({ ...LIGHT(), ...block(/:root\[data-theme="dark"\]\{([^}]*)\}/) });

function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const REQUIRED = ['bg', 'surface', 'sunk', 'ink', 'mut', 'dim', 'line', 'primary', 'primary-hover', 'on-primary', 'link',
  'accent2', 'attention', 'on-attention', 'brand-mark', 'ok', 'warn', 'err', 'code-bg', 'code-ink',
  'c-key', 'c-fn', 'c-str', 'c-num', 'c-cm', 'qr-bg', 'nav-bg', 'shadow'];

// [foreground, background] pairs that carry text and must meet WCAG AA (4.5:1).
const TEXT_PAIRS = [['ink', 'bg'], ['ink', 'surface'], ['ink', 'sunk'], ['mut', 'bg'], ['mut', 'surface'], ['mut', 'sunk'],
  ['dim', 'bg'], ['dim', 'surface'], ['primary', 'bg'], ['primary', 'surface'], ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'], ['link', 'bg'], ['link', 'surface'], ['accent2', 'bg'], ['accent2', 'surface'],
  ['ok', 'bg'], ['ok', 'surface'], ['warn', 'bg'], ['warn', 'surface'], ['err', 'surface'], ['on-attention', 'attention'],
  ['code-ink', 'code-bg'], ['c-key', 'code-bg'], ['c-fn', 'code-bg'], ['c-str', 'code-bg'], ['c-num', 'code-bg'],
  ['c-cm', 'code-bg']];

test('both themes define every required token', () => {
  for (const [name, t] of [['light', LIGHT()], ['dark', DARK()]]) {
    for (const k of REQUIRED) assert.ok(t[k], `${name} theme is missing --${k}`);
  }
});

test('every text/background pair meets WCAG AA (4.5:1) in both themes', () => {
  for (const [name, t] of [['light', LIGHT()], ['dark', DARK()]]) {
    for (const [fg, bg] of TEXT_PAIRS) {
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1 (needs 4.5)`);
    }
  }
});

test('no raw colour literals outside the two token blocks', () => {
  const rest = style
    .replace(/:root\{[^}]*\}/, '')
    .replace(/:root\[data-theme="dark"\]\{[^}]*\}/, '')
    .replace(/url\(data:[^)]*\)/g, '');                        // inline font data is not a colour
  const hits = rest.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [];
  assert.deepEqual(hits, [], 'use a token (or color-mix of one) instead of: ' + hits.join(', '));
});

test('--attention and --brand-mark are never used as a text colour (except the wordmark)', () => {
  const noWordmark = style.replace(/\.wordmark em\{[^}]*\}/, '');
  assert.equal(/[^-]color:var\(--(attention|brand-mark)\)/.test(noWordmark), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test "tests/*.test.mjs"`
Expected: FAIL. The 4 new tests fail (e.g. `light theme is missing --surface`, and literals like `#031425` get reported). The 46 existing tests still pass.

- [ ] **Step 3: Commit the failing tests** (they turn green in Task 2)

```bash
git add tests/theme.test.mjs
git commit -s -m "test(theme): tokens, WCAG contrast, no stray colour literals" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Token blocks and re-tokenised CSS

**Files:**
- Modify: `index.html` (`<style>` only)

- [ ] **Step 1: Replace the `:root` block**

Replace exactly:
```css
  :root{
    --bg:#08091e; --bg2:#0c0f26; --ink:#e2eaf8; --mut:#7b8fb5; --dim:#4d6080;
    --teal:#38bdf8; --teal2:#0ea5e9; --green:#34d399; --purple:#a78bfa; --line:#171e3a; --code:#060718;
  }
```
with:
```css
  /* Theme tokens — light is the default; :root[data-theme="dark"] overrides. Palette: CredentAgent brand
     (ink #0E1220 · paper #F2F4F0 · volt #C6F53C / volt-lt #7FA800) + Precision Hydration purple/orange.
     Rules: --attention and --brand-mark are never text colours; see tests/theme.test.mjs. */
  :root{
    color-scheme:light;
    --bg:#F2F4F0; --surface:#FFFFFF; --sunk:#E9ECE5; --ink:#0E1220; --mut:#4A5163; --dim:#5C6478; --line:#DCE0D8;
    --primary:#420A98; --primary-hover:#2E0770; --on-primary:#FFFFFF; --link:#420A98; --accent2:#8A1A9B;
    --attention:#FF5100; --on-attention:#0E1220; --brand-mark:#7FA800;
    --ok:#4F6B00; --warn:#A04A00; --err:#B42318;
    --code-bg:#0E1220; --code-ink:#F2F4F0; --c-key:#C9A7FF; --c-fn:#C6F53C; --c-str:#FFB38A; --c-num:#F0A8FF; --c-cm:#8A93A8;
    --qr-bg:#FFFFFF; --nav-bg:rgba(242,244,240,.92); --shadow:rgba(14,18,32,.18);
    --bar-1:#420A98; --bar-2:#8A1A9B; --bar-3:#FF5100;
  }
  :root[data-theme="dark"]{
    color-scheme:dark;
    --bg:#0E1220; --surface:#151A2C; --sunk:#0A0D18; --ink:#F2F4F0; --mut:#9AA1B4; --dim:#7C849A; --line:#232A40;
    --primary:#C6F53C; --primary-hover:#A8D62A; --on-primary:#0E1220; --link:#C9A7FF; --accent2:#D78AE6;
    --attention:#FF5100; --on-attention:#0E1220; --brand-mark:#C6F53C;
    --ok:#C6F53C; --warn:#FFB072; --err:#F87171;
    --code-bg:#0A0D18; --code-ink:#F2F4F0;
    --qr-bg:#FFFFFF; --nav-bg:rgba(14,18,32,.92); --shadow:rgba(0,0,0,.6);
  }
```

- [ ] **Step 2: Write the re-tokenising script to the scratchpad**

`$S/retokenize.py`:
```python
# One-shot: replace every hard-coded colour in index.html's <style> with tokens. Each pair must match
# exactly `count` times, or the script aborts without writing (so a drifted file can't be half-edited).
import sys
P = 'index.html'
s = open(P, encoding='utf-8').read()
head, rest = s.split('<style>', 1)
css, tail = rest.split('</style>', 1)

MIX = lambda tok, pct: f'color-mix(in srgb,var(--{tok}) {pct}%,transparent)'
R = [
  ('background:rgba(8,9,30,.88);backdrop-filter', 'background:var(--nav-bg);backdrop-filter', 1),
  ('color:#031425;background:var(--teal);', 'color:var(--on-primary);background:var(--primary);', 3),
  ('box-shadow:0 24px 60px -28px rgba(0,0,0,.7)', 'box-shadow:0 24px 60px -28px var(--shadow)', 1),
  ('.dot.r{background:#2d3468}.dot.y{background:#2d3468}.dot.g{background:#2d3468}', '.dot.r,.dot.y,.dot.g{background:var(--line)}', 1),
  ('background:#0e1440;border:1px solid var(--line);border-bottom-right-radius:5px;',
   'background:var(--primary);color:var(--on-primary);border:1px solid var(--primary);border-bottom-right-radius:5px;', 1),
  ('background:#0b1038;border:1px solid var(--line);border-bottom-left-radius:5px;',
   'background:var(--surface);border:1px solid var(--line);border-bottom-left-radius:5px;', 1),
  ('.bubble.success{border-color:rgba(52,211,153,.45);box-shadow:0 0 0 1px rgba(52,211,153,.18),0 0 22px -6px rgba(52,211,153,.4)}',
   '.bubble.success{border-color:var(--ok);box-shadow:0 0 0 1px ' + MIX('ok', 18) + ',0 0 22px -6px ' + MIX('ok', 40) + '}', 1),
  ('background:#0a1030;border:1px solid var(--line);border-radius:7px;', 'background:var(--sunk);border:1px solid var(--line);border-radius:7px;', 1),
  ('box-shadow:0 0 0 1px rgba(56,189,248,.5);opacity:0;', 'box-shadow:0 0 0 1px var(--attention);opacity:0;', 1),
  ('.gate.verified{border-color:rgba(52,211,153,.5)}', '.gate.verified{border-color:var(--ok)}', 1),
  ('0%,100%{opacity:.15;box-shadow:0 0 0 1px rgba(56,189,248,.4)}', '0%,100%{opacity:.15;box-shadow:0 0 0 1px var(--attention)}', 1),
  ('50%{opacity:.9;box-shadow:0 0 0 2px rgba(56,189,248,.65),0 0 16px -2px rgba(56,189,248,.5)}',
   '50%{opacity:.9;box-shadow:0 0 0 2px var(--attention),0 0 16px -2px ' + MIX('attention', 50) + '}', 1),
  ('background:#0a1030;border:1px solid var(--line);border-radius:12px;', 'background:var(--sunk);border:1px solid var(--line);border-radius:12px;', 1),
  ('.wallet.lit{border-color:rgba(52,211,153,.55);box-shadow:0 0 22px -6px rgba(52,211,153,.45)}',
   '.wallet.lit{border-color:var(--ok);box-shadow:0 0 22px -6px ' + MIX('ok', 45) + '}', 1),
  ('background:#0d1117;border:1px solid var(--line);border-radius:6px;', 'background:var(--surface);border:1px solid var(--line);border-radius:6px;', 1),
  ('.cred.proved{color:var(--green);border-color:rgba(52,211,153,.45)}', '.cred.proved{color:var(--ok);border-color:var(--ok)}', 1),
  ('.c-key{color:#93c5fd}.c-fn{color:#6ee7b7}.c-num{color:#c4b5fd}.c-str{color:#a5d6ff}.c-cm{color:#4d6080}',
   '.c-key{color:var(--c-key)}.c-fn{color:var(--c-fn)}.c-num{color:var(--c-num)}.c-str{color:var(--c-str)}.c-cm{color:var(--c-cm)}', 1),
  ('.real,.rails .r.real{color:var(--green)}.demo,.rails .r.demo{color:#fbbf24}',
   '.real,.rails .r.real{color:var(--ok);font-weight:700}.demo,.rails .r.demo{color:var(--warn);font-weight:700}'
   '.warn-badge{border:1px dashed currentColor;border-radius:6px;padding:.05rem .45rem;white-space:nowrap}', 1),
  ('.btn{background:var(--teal2);color:#031425;', '.btn{background:var(--primary);color:var(--on-primary);', 1),
  ('.btn-ghost{border:1px solid rgba(167,139,250,.5);color:var(--purple);background:rgba(167,139,250,.08);',
   '.btn-ghost{border:1px solid ' + MIX('accent2', 50) + ';color:var(--accent2);background:' + MIX('accent2', 8) + ';', 1),
  ('font-size:.82rem;color:#93c5fd;flex:1', 'font-size:.82rem;color:var(--link);flex:1', 1),
  ('border:1px solid rgba(56,189,248,.35);border-radius:5px;', 'border:1px solid ' + MIX('primary', 35) + ';border-radius:5px;', 1),
  ('background:var(--code);border:1px solid rgba(56,189,248,.4);color:var(--teal);',
   'background:var(--sunk);border:1px solid ' + MIX('primary', 40) + ';color:var(--primary);', 1),
  ('box-shadow:0 16px 40px -20px rgba(0,0,0,.6)', 'box-shadow:0 16px 40px -20px var(--shadow)', 1),
  ('.s-row.user .s-bubble{background:#0e1440;border:1px solid var(--line);',
   '.s-row.user .s-bubble{background:var(--primary);color:var(--on-primary);border:1px solid var(--primary);', 1),
  ('.s-row.agent .s-bubble{background:#0b1038;', '.s-row.agent .s-bubble{background:var(--surface);', 1),
  ('.s-success{border-color:rgba(52,211,153,.4)!important;box-shadow:0 0 0 1px rgba(52,211,153,.15),0 0 18px -6px rgba(52,211,153,.35)}',
   '.s-success{border-color:var(--ok)!important;box-shadow:0 0 0 1px ' + MIX('ok', 15) + ',0 0 18px -6px ' + MIX('ok', 35) + '}', 1),
  ('color:var(--green);border:1px solid rgba(52,211,153,.4);border-radius:999px;', 'color:var(--ok);border:1px solid var(--ok);border-radius:999px;', 1),
  ('line-height:1.45;color:var(--ink);background:#0b1038;', 'line-height:1.45;color:var(--ink);background:var(--surface);', 1),
  ('.d-row.user .d-bubble{background:#0e1440;', '.d-row.user .d-bubble{background:var(--primary);color:var(--on-primary);border-color:var(--primary);', 1),
  ('.d-bubble.ok{border-color:rgba(52,211,153,.45);box-shadow:0 0 18px -6px rgba(52,211,153,.4)}',
   '.d-bubble.ok{border-color:var(--ok);box-shadow:0 0 18px -6px ' + MIX('ok', 40) + '}', 1),
  ('.d-bubble.err{border-color:rgba(248,113,113,.5)}', '.d-bubble.err{border-color:var(--err)}', 1),
  ('.d-chip.err .st{color:#f87171}', '.d-chip.err .st{color:var(--err)}', 1),
  ('.d-card{border:1px dashed rgba(56,189,248,.45);', '.d-card{border:1px dashed ' + MIX('primary', 45) + ';', 1),
  ('.d-card .qr{flex:none;background:#fff;', '.d-card .qr{flex:none;background:var(--qr-bg);', 1),
  ('.d-link{font:inherit;font-size:.82rem;color:var(--teal);background:none;border:1px solid rgba(56,189,248,.4);',
   '.d-link{font:inherit;font-size:.82rem;color:var(--primary);background:none;border:1px solid ' + MIX('primary', 40) + ';', 1),
  ('color-scheme:dark}', 'color-scheme:light}:root[data-theme="dark"] .d-frame{color-scheme:dark}', 1),
  # --code is split: real code blocks → --code-bg; everything else that used it → --sunk.
  ('.code{background:var(--code);', '.code{background:var(--code-bg);color:var(--code-ink);', 1),
  ('.tabpanel .code{border:none;padding:0;background:transparent;border-radius:0}', '.tabpanel .code{border:none;padding:.9rem 1rem;border-radius:8px}', 1),
]
for old, new, count in R:
    n = css.count(old)
    if n != count:
        sys.exit(f'ABORT: expected {count}× but found {n}× for: {old[:90]}')
    css = css.replace(old, new)

# Token renames (order matters: --teal2 before --teal).
for old, new in [('var(--teal2)', 'var(--primary-hover)'), ('var(--teal)', 'var(--primary)'), ('var(--green)', 'var(--ok)'),
                 ('var(--purple)', 'var(--accent2)'), ('var(--bg2)', 'var(--surface)'), ('var(--code)', 'var(--sunk)')]:
    css = css.replace(old, new)
tail = (tail.replace('var(--teal2)', 'var(--primary-hover)').replace('var(--teal)', 'var(--primary)')
            .replace('var(--green)', 'var(--ok)').replace('var(--purple)', 'var(--accent2)').replace('var(--bg2)', 'var(--surface)'))

open(P, 'w', encoding='utf-8').write(head + '<style>' + css + '</style>' + tail)
print('retokenized', len(R), 'rules')
```

- [ ] **Step 3: Run it**

Run: `python3 $S/retokenize.py` (write out `$S` literally).
Expected: `retokenized 39 rules`. If you get `ABORT`, the file differs from what the plan expects: report NEEDS_CONTEXT with the message. Do not hand-edit.

- [ ] **Step 4: Verify**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, 50 tests (46 + 4). Then:
- `grep -c 'var(--teal\|var(--green)\|var(--bg2)\|var(--purple)\|var(--code)' index.html` → `0`
- the self-contained grep → `0`

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -s -m "feat(theme): brand colour tokens — light by default, dark overrides; no hard-coded colours" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Brand markup (logo, colour bar, favicon, footer, ⚠ badges) and the wordmark test

**Files:**
- Modify: `index.html`
- Test: `tests/theme.test.mjs` (append)

- [ ] **Step 1: Append the failing wordmark test**

```js
test('the wordmark is one element reading exactly "CredentAgent" (no gap), in nav and footer', () => {
  const marks = html.match(/<span class="wordmark">[\s\S]*?<\/span>/g) || [];
  assert.equal(marks.length, 2, 'expected a wordmark in the nav and the footer');
  for (const m of marks) assert.equal(m, '<span class="wordmark">Credent<em>Agent</em></span>');
  assert.equal(html.includes('>CREDENTAGENT<'), false, 'the old letter-spaced text wordmark must be gone');
  assert.match(style, /\.logo\{[^}]*gap:/, 'the gap belongs on .logo (mark ↔ word), never inside the wordmark');
});

test('presence-only labels carry a ⚠ dashed badge, never colour alone', () => {
  const cells = html.match(/<div class="r demo">[\s\S]*?<\/div>/g) || [];
  assert.equal(cells.length, 3);
  for (const c of cells) assert.equal(c, '<div class="r demo"><span class="warn-badge">⚠ presence-only-demo</span></div>');
});
```
Run `node --test "tests/*.test.mjs"`. Expected: those 2 fail.

- [ ] **Step 2: Nav markup**

Replace:
```html
    <div class="nav-left">
      <span class="wordmark">CREDENTAGENT</span>
```
with:
```html
    <div class="nav-left">
      <a class="logo" href="#" aria-label="CredentAgent home"><svg class="logo-mark" width="24" height="24" viewBox="12 8 78 78" fill="none" stroke-linecap="square" aria-hidden="true"><path class="frame" d="M66 20H28a8 8 0 0 0-8 8v40a8 8 0 0 0 8 8h40a8 8 0 0 0 8-8V47" stroke-width="9"/><path class="check" d="M34 49l12 12 38-45" stroke-width="9"/></svg><span class="wordmark">Credent<em>Agent</em></span></a>
```

- [ ] **Step 3: Footer markup**

Replace:
```html
  <footer><div class="wrap">Apache-2.0 · GitHub · npm · An Open Mobile Hub project (Linux Foundation / OpenWallet Foundation) · heading to GDC</div></footer>
```
with:
```html
  <footer><div class="wrap foot"><a class="logo logo-sm" href="#" aria-label="CredentAgent home"><svg class="logo-mark" width="18" height="18" viewBox="12 8 78 78" fill="none" stroke-linecap="square" aria-hidden="true"><path class="frame" d="M66 20H28a8 8 0 0 0-8 8v40a8 8 0 0 0 8 8h40a8 8 0 0 0 8-8V47" stroke-width="9"/><path class="check" d="M34 49l12 12 38-45" stroke-width="9"/></svg><span class="wordmark">Credent<em>Agent</em></span></a><span>Apache-2.0 · GitHub · npm · An Open Mobile Hub project (Linux Foundation / OpenWallet Foundation) · heading to GDC</span></div></footer>
```

- [ ] **Step 4: Trust-table badges.** Replace all 3 occurrences of
`<div class="r demo">presence-only-demo</div>` with
`<div class="r demo"><span class="warn-badge">⚠ presence-only-demo</span></div>`.

- [ ] **Step 5: Favicon.** Insert directly after `<link rel="canonical" href="https://credentagent.ai/">`:
```html
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 78 78' fill='none' stroke-linecap='square'%3E%3Crect width='78' height='78' fill='%230E1220'/%3E%3Cg transform='translate(-12,-8)'%3E%3Cpath d='M66 20H28a8 8 0 0 0-8 8v40a8 8 0 0 0 8 8h40a8 8 0 0 0 8-8V47' stroke='%23F2F4F0' stroke-width='9'/%3E%3Cpath d='M34 49l12 12 38-45' stroke='%23C6F53C' stroke-width='9'/%3E%3C/g%3E%3C/svg%3E">
```

- [ ] **Step 6: CSS**

Replace `  .wordmark{font-weight:700;letter-spacing:.14em;font-size:14px}` with:
```css
  .logo{display:flex;align-items:center;gap:8px;color:var(--ink)}
  .logo-mark{flex:none}.logo-mark .frame{stroke:currentColor}.logo-mark .check{stroke:var(--brand-mark)}
  .wordmark{font-family:"CA Space Grotesk",-apple-system,"Segoe UI",system-ui,sans-serif;font-weight:600;font-size:19px;letter-spacing:-.015em;white-space:nowrap}
  .wordmark em{font-style:normal;color:var(--brand-mark)}
  .logo-sm .wordmark{font-size:14px}
  .foot{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
```
In the `nav{ … }` rule, replace `gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:5;` with `gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:5;border-top:4px solid transparent;`. Add a new rule right after the closing `}` of `nav{…}`:
```css
  nav::before{content:"";position:absolute;left:0;right:0;top:-4px;height:4px;background:linear-gradient(90deg,var(--bar-1) 0 25%,var(--bar-2) 25% 50%,var(--bar-3) 50% 75%,var(--brand-mark) 75%)}
```

- [ ] **Step 7: Verify**

Run: `node --test "tests/*.test.mjs"`. Expected: 52 pass. The self-contained grep → `0`.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/theme.test.mjs
git commit -s -m "feat(brand): CredentAgent logo + single-word wordmark, colour bar, favicon, ⚠ presence-only badges" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Space Grotesk 600 wordmark subset (inline)

**Files:**
- Create: `tools/build-wordmark-font.py`
- Modify: `index.html`
- Test: `tests/theme.test.mjs` (append)

- [ ] **Step 1: Append the failing test**

```js
test('the wordmark font is an inline Space Grotesk 600 subset with its OFL notice', () => {
  const face = style.match(/@font-face\{font-family:"CA Space Grotesk";[^}]*\}/);
  assert.ok(face, '@font-face for "CA Space Grotesk" not found');
  assert.match(face[0], /font-weight:600/);
  const data = face[0].match(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/);
  assert.ok(data, 'the font must be an inline data: woff2');
  assert.ok(data[1].length < 12000, 'subset should be tiny (letters C r e d n t A g only), got ' + data[1].length);
  assert.match(style, /SIL Open Font License 1\.1/);
});
```
Run the tests. Expected: this one fails.

- [ ] **Step 2: Create the generator** `tools/build-wordmark-font.py`:
```python
#!/usr/bin/env python3
"""Build the inline Space Grotesk 600 subset used only by the CredentAgent wordmark.

Usage:  <venv>/bin/python tools/build-wordmark-font.py SpaceGrotesk[wght].ttf > wordmark.b64
Needs:  pip install fonttools brotli
Source: https://github.com/google/fonts/tree/main/ofl/spacegrotesk (SIL Open Font License 1.1).
Output: base64 woff2 containing only the glyphs of "CredentAgent", instanced at weight 600.
"""
import base64
import io
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 600})
options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["kern", "liga"]
options.name_IDs = ["*"]  # keep the copyright / licence name records
subsetter = subset.Subsetter(options=options)
subsetter.populate(text="CredentAgent")
subsetter.subset(font)
buf = io.BytesIO()
font.flavor = "woff2"
font.save(buf)
sys.stdout.write(base64.b64encode(buf.getvalue()).decode("ascii"))
```

- [ ] **Step 3: Build the subset.** Run these commands one at a time:
```bash
/opt/homebrew/bin/python3 -m venv $S/fontenv
$S/fontenv/bin/pip install -q fonttools brotli
curl -sL -o $S/SpaceGrotesk.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"
$S/fontenv/bin/python tools/build-wordmark-font.py $S/SpaceGrotesk.ttf > $S/wordmark.b64
wc -c $S/wordmark.b64
```
Expected: the `.ttf` is about 136 KB, and `wordmark.b64` is a few thousand characters (well under 12000).

- [ ] **Step 4: Insert the `@font-face`.** Write `$S/insert_font.py`:
```python
b64 = open('$S/wordmark.b64').read().strip()
P = 'index.html'
s = open(P, encoding='utf-8').read()
anchor = '  /* ---------- top nav ---------- */'
assert s.count(anchor) == 1
face = ('  /* Wordmark font: Space Grotesk 600, subset to the letters of "CredentAgent" by tools/build-wordmark-font.py.\n'
        '     Copyright 2020 The Space Grotesk Project Authors (github.com/floriankarsten/space-grotesk).\n'
        '     Licensed under the SIL Open Font License 1.1 (openfontlicense.org). */\n'
        '  @font-face{font-family:"CA Space Grotesk";font-weight:600;font-style:normal;font-display:block;'
        'src:url(data:font/woff2;base64,' + b64 + ') format("woff2")}\n\n')
open(P, 'w', encoding='utf-8').write(s.replace(anchor, face + anchor))
print('font inserted', len(b64))
```
Replace `$S` with the literal scratchpad path inside the file, then run `python3 $S/insert_font.py`.

- [ ] **Step 5: Verify.** `node --test "tests/*.test.mjs"` → 53 pass. The self-contained grep → `0`.

- [ ] **Step 6: Commit** (the generator and the page; the font source, venv and `.b64` stay in the scratchpad)

```bash
git add tools/build-wordmark-font.py index.html tests/theme.test.mjs
git commit -s -m "feat(brand): inline Space Grotesk 600 subset for the wordmark (OFL 1.1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Theme API in the core, and the bridge's `setTheme`

**Files:**
- Modify: `index.html` (`ca-demo-core` block only)
- Test: `tests/demo.test.mjs`

- [ ] **Step 1: Update and append the tests**

In the existing test `'bridge answers ui/initialize with host info, capabilities and context'`, change `theme: 'dark'` to `theme: 'light'` in the expected `hostContext` (light is now the default).

Append:
```js
// ---- theme ----
const memStore = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const badStore = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('readTheme: light by default, the saved choice otherwise, never throws', () => {
  assert.equal(D.THEME_KEY, 'credentagent.theme');
  assert.equal(D.readTheme(memStore()), 'light');
  assert.equal(D.readTheme(memStore({ 'credentagent.theme': 'dark' })), 'dark');
  assert.equal(D.readTheme(memStore({ 'credentagent.theme': 'purple' })), 'light');
  assert.equal(D.readTheme(badStore), 'light');
  assert.equal(D.readTheme(null), 'light');
});

test('writeTheme stores only light/dark and never throws', () => {
  const s = memStore();
  assert.equal(D.writeTheme(s, 'dark'), true);
  assert.equal(s.m['credentagent.theme'], 'dark');
  D.writeTheme(s, 'banana');
  assert.equal(s.m['credentagent.theme'], 'light');
  assert.equal(D.writeTheme(badStore, 'dark'), false);
  assert.equal(D.writeTheme(null, 'dark'), false);
});

test('nextTheme and toggleLabel describe the switch the button offers', () => {
  assert.equal(D.nextTheme('light'), 'dark');
  assert.equal(D.nextTheme('dark'), 'light');
  assert.equal(D.nextTheme(null), 'dark');
  assert.deepEqual(plain(D.toggleLabel('light')), { icon: '☾', text: 'Dark', aria: 'Switch to dark theme', pressed: 'false' });
  assert.deepEqual(plain(D.toggleLabel('dark')), { icon: '☀', text: 'Light', aria: 'Switch to light theme', pressed: 'true' });
});

test('bridge reports the current theme and can switch it live', () => {
  const { bridge, posted } = makeBridge({ context: { theme: 'dark' } });
  bridge.handle({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: { protocolVersion: '2026-01-26' } });
  assert.equal(posted[0].result.hostContext.theme, 'dark');
  bridge.setTheme('light');
  bridge.setTheme('nonsense');
  assert.deepEqual(posted[1], { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'light' } });
  assert.deepEqual(posted[2].params, { theme: 'light' });
});
```
Run the tests. Expected: 4 new failures (e.g. `D.readTheme is not a function`) plus the edited initialize test (`'dark' !== 'light'`).

- [ ] **Step 2: Implement in `ca-demo-core`**

In `api.createHostBridge`, change the hostContext default `theme: 'dark'` to `theme: 'light'`. Add `setTheme` to the object the bridge returns, next to `notify`:
```js
      setTheme: function (theme) { h.post({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: theme === 'dark' ? 'dark' : 'light' } }); },
```
Insert before `  return api;`:
```js
  // ---- Theme: light by default; the visitor's choice is remembered per device ----
  api.THEME_KEY = 'credentagent.theme';
  api.readTheme = function (storage) {
    try { return storage && storage.getItem(api.THEME_KEY) === 'dark' ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  };
  api.writeTheme = function (storage, theme) {
    if (!storage) return false;
    try { storage.setItem(api.THEME_KEY, theme === 'dark' ? 'dark' : 'light'); return true; }
    catch (e) { return false; }
  };
  api.nextTheme = function (theme) { return theme === 'dark' ? 'light' : 'dark'; };
  // What the toggle button offers: the theme you'd switch TO.
  api.toggleLabel = function (theme) {
    return theme === 'dark'
      ? { icon: '☀', text: 'Light', aria: 'Switch to light theme', pressed: 'true' }
      : { icon: '☾', text: 'Dark', aria: 'Switch to dark theme', pressed: 'false' };
  };

```

- [ ] **Step 3: Verify.** `node --test "tests/*.test.mjs"` → 57 pass.

- [ ] **Step 4: Commit**

```bash
git add index.html tests/demo.test.mjs
git commit -s -m "feat(theme): core theme API (read/write/next/label) and live picker theme via host-context-changed" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: No-flash boot script, toggle, and picker sync

**Files:**
- Modify: `index.html`
- Test: `tests/theme.test.mjs` (append)

- [ ] **Step 1: Append the failing boot-script tests**

```js
import vm from 'node:vm';
function boot(storage) {
  const m = html.match(/\/\* ca-theme-boot:begin \*\/([\s\S]*?)\/\* ca-theme-boot:end \*\//);
  assert.ok(m, 'ca-theme-boot script not found in <head>');
  const attrs = {}, styleObj = {};
  const documentElement = { setAttribute: (k, v) => { attrs[k] = v; }, style: styleObj };
  vm.runInNewContext(m[1], { document: { documentElement }, localStorage: storage });
  return { theme: attrs['data-theme'], scheme: styleObj.colorScheme };
}

test('boot script: light by default, before first paint (it sits in <head>, before <style>)', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.indexOf('ca-theme-boot:begin') > -1 && head.indexOf('ca-theme-boot:begin') < head.indexOf('<style>'));
  assert.deepEqual(boot({ getItem: () => null }), { theme: 'light', scheme: 'light' });
});

test('boot script: applies a saved dark choice', () => {
  assert.deepEqual(boot({ getItem: (k) => (k === 'credentagent.theme' ? 'dark' : null) }), { theme: 'dark', scheme: 'dark' });
});

test('boot script: blocked storage falls back to light without throwing', () => {
  assert.deepEqual(boot({ getItem() { throw new Error('blocked'); } }), { theme: 'light', scheme: 'light' });
});
```
Put the `import vm from 'node:vm';` line at the **top** of the file with the other imports. Run the tests. Expected: 3 failures.

- [ ] **Step 2: Head.** Insert directly after `<meta name="viewport" content="width=device-width, initial-scale=1.0">`:
```html
<meta name="color-scheme" content="light dark">
<script>/* ca-theme-boot:begin */(function(){var t='light';try{if(localStorage.getItem('credentagent.theme')==='dark')t='dark';}catch(e){}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;})();/* ca-theme-boot:end */</script>
```

- [ ] **Step 3: Toggle button.** Replace:
```html
      <a class="npm-btn" href="https://www.npmjs.com/package/@openmobilehub/credentagent-gate">npm install</a>
```
with:
```html
      <button class="theme-toggle" id="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to dark theme"><span class="tt-icon" aria-hidden="true">☾</span><span class="tt-text">Dark</span></button>
      <a class="npm-btn" href="https://www.npmjs.com/package/@openmobilehub/credentagent-gate">npm install</a>
```

- [ ] **Step 4: CSS.** Insert right after the `.npm-btn:hover{…}` rule:
```css
  .theme-toggle{font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
  .theme-toggle:hover{border-color:var(--primary)}
  .theme-toggle:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
  html.theme-anim,html.theme-anim *{transition:background-color .15s ease,color .15s ease,border-color .15s ease!important}
```
Inside `@media (max-width:520px){ … }`, after `.demo-reset{margin-left:0}`, add `    .tt-text{display:none}`.

- [ ] **Step 5: Toggle script.** Insert a new `<script>` immediately after the `ca-demo-core` script's closing `</script>` (before the demo wiring script):
```html
<script>
// Theme toggle: light by default; the choice is remembered per device (applied pre-paint by ca-theme-boot in <head>).
(function(){
  var D = window.CADemo, root = document.documentElement, btn = document.getElementById('theme-toggle');
  if (!D || !btn) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  function current(){ return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paint(theme){
    var l = D.toggleLabel(theme);
    btn.querySelector('.tt-icon').textContent = l.icon;
    btn.querySelector('.tt-text').textContent = l.text;
    btn.setAttribute('aria-label', l.aria);
    btn.setAttribute('aria-pressed', l.pressed);
  }
  function apply(theme){
    if (!reduce) {
      root.classList.add('theme-anim');
      setTimeout(function(){ root.classList.remove('theme-anim'); }, 250);
    }
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    paint(theme);
    D.writeTheme(store, theme);
    document.dispatchEvent(new CustomEvent('ca-themechange', { detail: { theme: theme } }));
  }
  paint(current());
  btn.addEventListener('click', function(){ apply(D.nextTheme(current())); });
})();
</script>
```

- [ ] **Step 6: Picker sync** (demo wiring script, "In-browser agent demo" IIFE):
  - In `mountWidget`, change `context: { toolInfo: { tool: widget.tool } },` to
    `context: { toolInfo: { tool: widget.tool }, theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light' },`
  - Immediately after the line `var run = null;   // { token, frame, bridge, onMessage, readyTimer, ready }`, add:
```js
  document.addEventListener('ca-themechange', function(e){
    if (run && run.bridge && run.ready) run.bridge.setTheme(e.detail && e.detail.theme);
  });
```

- [ ] **Step 7: Verify.** Run:
  - `node --test "tests/*.test.mjs"` → 60 pass
  - the self-contained grep → `0`
  - the inline-script parse check:
```bash
python3 -c "import re,subprocess,tempfile,os;s=open('index.html').read();[ (open(os.path.join(tempfile.gettempdir(),f'ca-{i}.js'),'w').write(js), subprocess.run(['node','--check',os.path.join(tempfile.gettempdir(),f'ca-{i}.js')],check=True)) for i,js in enumerate(re.findall(r'<script>(.*?)</script>',s,re.S))];print('all inline scripts parse')"
```

- [ ] **Step 8: Commit**

```bash
git add index.html tests/theme.test.mjs
git commit -s -m "feat(theme): no-flash boot, remembered nav toggle, picker follows the theme" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Browser verification (controller)

**Files:** none (fix anything found with a failing test first, in the task that owns it).

- [ ] **Step 1: Screenshots.** With headless Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --screenshot`), capture the page:
  - light at 1280 and 400 px;
  - dark at 1280 and 400 px, using a copy with `<html lang="en" data-theme="dark">` and the boot script's `t='light'` changed to `t='dark'`.

  Review each section: hero animation colours, problem band, try-it tabs, how-it-works, quickstart code, what's new tabs (the code block must be ink with legible text in both themes), Honest-by-design (✓ green, ⚠ dashed amber), footer logo, colour bar, favicon.
- [ ] **Step 2: Toggle behaviour.** In Chrome via `claude-in-chrome`, on `http://localhost:8787/?v=<sha>` served by `/opt/homebrew/bin/python3 tools/dev-server.py`:
  - Click the toggle: the colours switch, `aria-pressed` flips and the label reads "☀ Light".
  - Reload: still dark, with no flash.
  - Toggle back to light.
  - Tab to the toggle: its focus ring is visible.
- [ ] **Step 3: Picker sync.** Run a scenario. Once the picker has loaded, toggle and confirm that a `ui/notifications/host-context-changed` message with the new theme is posted to the frame (instrument `postMessage` or check the widget's reaction), and that the chips and hand-off card recolour.
- [ ] **Step 4: Reduced motion.** With DevTools reduced-motion emulation: no cross-fade on toggle, the hero shows its static final state and there is no pulsing ring.

---

### Task 8: Docs, rebase, PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md`, Design section.** Replace:
```
- **Direction:** bold & dark — surf palette (electric blue, sea-green, violet) on deep indigo-ocean.
  Palette tokens live in `index.html` `:root` (`--bg`, `--teal` (blue), `--green`, `--purple`, etc.).
```
with:
```
- **Direction:** the CredentAgent brand, **light by default** with a remembered **☾/☀ toggle** to dark.
  Light: brand paper `#F2F4F0` + ink `#0E1220`, Precision-Hydration **purple** `#420A98` primary, **orange**
  `#FF5100` for attention only (the gate). Dark: brand ink + **volt** `#C6F53C` primary. Spec:
  `docs/superpowers/specs/2026-09-27-light-theme-design.md`.
- **Tokens:** all colour is semantic tokens in `index.html` — `:root` (light) and `:root[data-theme="dark"]`.
  No raw colour literal elsewhere; `--attention`/`--brand-mark` are never text; every text pair meets WCAG
  AA — `tests/theme.test.mjs` enforces all three. The theme is applied pre-paint by the `ca-theme-boot`
  script in `<head>` (key `localStorage["credentagent.theme"]`).
- **Logo:** mark + wordmark, where the wordmark is ONE element `<span class="wordmark">Credent<em>Agent</em></span>`
  (CredentAgent is a single word — never a gap). Font: Space Grotesk 600 subset, inline, SIL OFL 1.1;
  regenerate with `tools/build-wordmark-font.py`. Brand assets: the CredentAgent logo Drive folder (README palette).
```

- [ ] **Step 2: Final verification.** Run:
  - `node --test "tests/*.test.mjs"` → 60 pass
  - `node tests/contract.mjs` → all checks pass
  - the self-contained grep → `0`

- [ ] **Step 3: Commit, rebase on the latest `main`, push, and open the PR**

```bash
git add CLAUDE.md
git commit -s -m "docs: brand palette, light default + dark toggle, token and wordmark rules" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git fetch origin
git rebase origin/main
node --test "tests/*.test.mjs"
git push -u origin feat/light-theme
gh pr create --base main --title "Light theme by default + dark toggle, on the CredentAgent brand" --body "<summary, screenshots light/dark, verification output; end with the Claude Code attribution line>"
```
If the rebase conflicts in `CLAUDE.md` (the 0.5.0 docs PR touches other sections), keep both sides' content.
