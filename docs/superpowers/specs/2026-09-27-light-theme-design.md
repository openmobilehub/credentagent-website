# Light theme (default) + dark toggle, on the CredentAgent brand — design

**Date:** 2026-09-27 · **Status:** implemented on `feat/light-theme` · **Branch:** `feat/light-theme`

## Goal

Make credentagent.ai **light by default** (cleaner), with a **toggle to dark**, and move both themes onto
the **CredentAgent brand palette** plus Precision Hydration's **purple and orange** as accents. Replace
today's dark-only blue/teal "surf" look.

## Decisions (made during brainstorming, with mockups)

| Question | Decision |
|---|---|
| First visit (no saved choice) | **Always light**, regardless of OS dark mode. The toggle's choice is **remembered per device**. |
| Light direction | **A · brand paper + purple:** paper page, ink text, **purple primary**, **orange for attention only** (the gate), volt-lt only in the logo. |
| Dark direction | **Brand ink + volt:** ink page, **volt primary**, same purple/orange accents. Replaces the "surf" dark theme. |
| Wordmark | **Two-tone, one word:** "Credent" in ink/paper + "Agent" in volt/volt-lt, **no gap** — CredentAgent is a single word. |
| Wordmark font | **Space Grotesk 600, embedded subset for the logo only** (glyphs `C r e d n t A g`); body text stays the system font. |
| Implementation approach | **Semantic CSS tokens + one `data-theme` attribute** on `<html>` (light = `:root` defaults; `:root[data-theme="dark"]` overrides). |

## Sources

- **CredentAgent brand kit** (Google Drive folder `1mK81Yw1N9fPAkkKsSH_H6dj53Oy2tR9G`, `README.txt`):
  ink `#0E1220` · volt `#C6F53C` (on ink / dark only) · volt-lt `#7FA800` (light backgrounds) · paper `#F2F4F0`.
  Wordmark: Space Grotesk 600, letter-spacing −0.015em, "Credent" in ink/paper, "Agent" in volt.
  Mark: 96-unit grid, stroke 9, square caps; favicon = tighter crop (viewBox `12 8 78 78`) on an ink tile.
- **Precision Hydration** (precisionhydration.com, site CSS): purple `#420A98`, magenta `#8A1A9B`,
  orange `#FF5100` (also `#FFF200` yellow, `#1D1D1F` near-black — not used).

## Contrast facts (WCAG, computed) that shape usage

| Pair | Ratio | Consequence |
|---|---|---|
| ink on paper | 16.85 | body text |
| purple `#420A98` on paper | 10.98 · white on purple 12.15 | primary: buttons, links, headline |
| magenta `#8A1A9B` on paper | 7.02 | secondary accent |
| orange `#FF5100` on paper | **2.95 — fails as text** · ink on orange 5.71 | **fills/rings only** (ink text on it) |
| volt-lt `#7FA800` on paper | **2.53 — fails as text** | **logo only** |
| volt on ink | 14.68 | dark primary |

## Tokens

All colour is semantic tokens. `:root` = light (default); `:root[data-theme="dark"]` overrides the same names.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | page | `#F2F4F0` | `#0E1220` |
| `--surface` | cards, chat, panels | `#FFFFFF` | `#151A2C` |
| `--ink` | text | `#0E1220` | `#F2F4F0` |
| `--mut` | secondary text | `#4A5163` | `#9AA1B4` |
| `--line` | borders | `#DCE0D8` | `#232A40` |
| `--primary` | buttons, headline accent, user bubbles | `#420A98` | `#C6F53C` |
| `--on-primary` | text on primary | `#FFFFFF` | `#0E1220` |
| `--link` | inline links | `#420A98` | `#C9A7FF` |
| `--accent2` | eyebrows, secondary accent | `#8A1A9B` | `#D78AE6` |
| `--attention` | gate pulse/ring, highlights — **never text** | `#FF5100` | `#FF5100` |
| `--brand-mark` | logo check, "Agent" — **logo only** | `#7FA800` | `#C6F53C` |
| `--ok` | "✓ real crypto", success | `#4F6B00` | `#C6F53C` |
| `--warn` | "⚠ presence-only-demo" (dashed badge) | `#A04A00` | `#FFB072` |
| `--err` | errors | `#B42318` | `#F87171` |
| `--code-bg` / `--code-ink` | code blocks (ink in both themes) | `#0E1220` / `#F2F4F0` | `#0A0D18` / `#F2F4F0` |
| `--c-key` `--c-fn` `--c-str` `--c-num` | syntax colours (shared) | `#C9A7FF` `#C6F53C` `#FFB38A` `#F0A8FF` | same |
| `--nav-bg` | sticky nav (translucent) | `rgba(242,244,240,.92)` | `rgba(14,18,32,.92)` |

**Rules**
- The **52 hard-coded colour literals** in today's `<style>` are replaced by tokens (glows use translucent
  forms of tokens, e.g. `color-mix(in srgb, var(--attention) 15%, transparent)`); no raw colour literal outside
  the two token blocks.
- `--attention` and `--brand-mark` are never used as a text colour.
- **Honesty labels:** "✓ real crypto" (`--ok`, ✓ glyph) and "⚠ presence-only-demo" (`--warn`, ⚠ glyph,
  dashed outline) differ by glyph and shape, not colour alone; presence-only must never read as brand orange.
- Every text/background pair meets **WCAG AA** (4.5:1 normal text; 3:1 large text & UI borders) in both themes.

## Toggle, persistence, no-flash

- **Button** in the sticky nav, before "npm install": shows the theme you'd switch **to** ("☾ Dark" / "☀ Light";
  icon-only on phones, where nav links hide). Real `<button>` with an action label (`aria-label` "Switch to
  dark/light theme", matching the visible text; no `aria-pressed` — an action-named button must not also carry a
  pressed state) and a visible focus ring.
- **Persistence:** `localStorage["credentagent.theme"]` = `"light" | "dark"`; absent/invalid → light. Storage
  failures (private mode, blocked) are caught: the toggle still works for the page view.
- **No flash:** a tiny inline script at the top of `<head>` (before `<style>`) applies the saved theme before
  first paint. `<meta name="color-scheme">` and CSS `color-scheme` follow the theme.
- **Transition:** colours cross-fade ~150 ms; none under `prefers-reduced-motion`.

## Embedded product picker (MCP Apps widget)

- `createHostBridge` reports the **current** theme in `hostContext.theme` (was hard-coded `'dark'`).
- New `bridge.setTheme(theme)` posts `ui/notifications/host-context-changed` `{ theme }`; the toggle calls it
  when a picker is open. `.d-frame` `color-scheme` follows the theme.
- Whether the widget restyles is up to the widget; the page informs it the standard way.

## Brand elements

- **Nav logo:** inline SVG mark (frame stroke `currentColor`, check `var(--brand-mark)`) + the wordmark as **one
  element**: `<span class="wordmark">Credent<em>Agent</em></span>` (no whitespace; the flex `gap` must sit outside
  it). Replaces the letter-spaced "CREDENTAGENT" text. The version pill stays.
- **Font:** Space Grotesk 600 subset (`C r e d n t A g`), inline as a `data:font/woff2;base64,…` `@font-face`,
  used only by `.wordmark`; SIL OFL 1.1 notice in a comment beside it. Fallback: system font.
- **Favicon:** the brand kit's favicon SVG inlined as `<link rel="icon" href="data:image/svg+xml,…">`.
- **Colour bar:** a 4 px strip (purple · magenta · orange · `--brand-mark`) on top of the sticky nav, both themes.
- **Footer:** small logo beside the licence line.
- **Hero animation:** colours from tokens (gate ring pulses `--attention`; proved credentials/✓ use `--ok`);
  motion and the reduced-motion guard unchanged.
- Responsive breakpoints (880 / 520 px) unchanged; the toggle stays visible at every width.

## Testing

- **Unit (`node --test`, zero deps), new:**
  - contrast: parse both token blocks from `index.html`, assert the text/background pairs above meet AA;
  - no raw colour literals in `<style>` outside the token blocks;
  - wordmark: every `.wordmark` has exact text `CredentAgent` (no whitespace) and one per logo;
  - theme core (in `ca-demo-core`): `readTheme(storage)` → light by default, tolerates throwing storage;
    `writeTheme(storage, theme)` never throws; bridge `setTheme()` posts `host-context-changed` and
    `ui/initialize` reports the given theme.
- **Unchanged:** the 46 existing tests, the self-contained grep (0 — favicon/font are `data:` URIs), `tests/contract.mjs`.
- **Browser:** headless screenshots of the whole page, both themes, 1280 px and 400 px; no-flash with a saved dark
  choice; toggle by mouse and keyboard, its action label, persistence across reload; demo scenario → toggle while
  the picker is open → `host-context-changed` observed, chips/card recolour; reduced motion.

## Docs

- `CLAUDE.md` Design section: replace "bold & dark — surf palette" with the brand palette (light default, dark
  toggle), the token rules, the wordmark rule and the font licence pointer.

## Out of scope

- Updating the site's copy from 0.4.0 to 0.5.0 (tracked separately in `CLAUDE.md` "Current state").
- OG/social image; any layout or content changes beyond colour, logo, toggle.
- Following the OS dark-mode setting (explicitly declined).
