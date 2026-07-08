# CredentAgent Website — Storefront First-Class & Rebrand

_Date: 2026-06-29 · Status: approved design · Next: implementation (writing-plans)_

## Summary

Three coordinated changes to `index.html`:

1. **Brand rename** — "Attesto" → "CredentAgent" everywhere on the site (product brand only; npm package names are published and do not change).
2. **Hero animation update** — demo product changes from `"Order the 2021 reserve cabernet."` to `"Add the whiskey and check out."` to match the real catalog item (`oak-whiskey`, 21+) and the attesto-storefront example script.
3. **New "Try it live" section** — adds attesto-storefront as a first-class citizen alongside attesto-gate, with a hosted connector URL and two-column layout.

## Rename: Attesto → CredentAgent

**Scope: website only.** npm package names (`@openmobilehub/attesto-gate`, `@openmobilehub/attesto-storefront`), GitHub repo names, and all external URLs are unchanged — they are already published and cannot be renamed here.

**Affected in `index.html`:**

| Location | Before | After |
|---|---|---|
| `<title>` | `Attesto — the consent layer…` | `CredentAgent — the consent layer…` |
| `<meta name="description">` | `An AI agent proves…` | `An AI agent proves…` (unchanged, no brand name in it) |
| `og:title` | `Attesto — the consent layer…` | `CredentAgent — the consent layer…` |
| Nav wordmark `.wordmark` | `ATTESTO` | `CREDENTAGENT` |
| Nav pill `.pill` | `v0.1 · OPENWALLET FOUNDATION` | unchanged |
| Hero eyebrow | `THE CONSENT LAYER FOR AI AGENTS` | unchanged |
| Hero H1 | `AI agents are learning to act.` / `Make them ask first.` | unchanged |
| `aria-label` on `.chat` | `An AI agent pauses…` | unchanged (describes the animation, not the brand) |
| Footer | `Apache-2.0 · GitHub · npm · An Open Mobile Hub project…` | unchanged |

The eyebrow, H1, subhead, and section copy do not contain the brand name — no changes there.

## Hero animation: cabernet → whiskey

**One line change in the JS block:**

```js
// before
var MSG = "Order the 2021 reserve cabernet.";

// after
var MSG = "Add the whiskey and check out.";
```

This matches the actual demo catalog item (`oak-whiskey`, 21+) and the `examples/storefront.mjs` comment: _"Try: 'add the whiskey and check out'"_. The typewriter timing and all animation beats are unchanged.

## New section: "Try it live"

### Placement

Between the **Problem band** and **How it works** (`#how`). In the existing section order:

```
sticky nav
→ hero
→ problem band        (background: --bg2)
→ [NEW] try it live   (background: --bg)
→ how it works        (background: --bg, id="how")
→ quickstart          (background: --bg2)
→ gate any credential
→ honest by design    (background: --bg2)
→ built on open standards
→ for developers      (background: --bg2)
→ footer
```

### Hosted connector

The public URL is `https://mcp-apps-nine.vercel.app/mcp` (Vercel deployment of `openmobilehub/mcp-apps-shopping-demo`). Confirmed live — returns a valid MCP `initialize` response. Works with all three clients over HTTPS; no local server or tunnel needed.

### Section content

**Section label:** `Try it live`

**H2:** `A complete MCP storefront — no setup required.`

**Subhead:** `attesto-storefront is a ready-to-run MCP server: nine shopping tools, a product widget, and a gated checkout. Add the hosted connector and order the whiskey — the age gate fires automatically.`

**Layout:** Two columns (`grid-template-columns: 1.1fr 1fr`), consistent with the existing `.hero` two-column pattern. Left: steps + dev note. Right: demo transcript card + module cards.

**Left column — steps:**

Prominent URL block at the top:
```
[hosted connector — add to any client]
https://mcp-apps-nine.vercel.app/mcp   [↗ add as connector]
[Claude] [ChatGPT] [Goose]
```

Three steps below:
1. **Add the connector** — paste the URL above into Claude / ChatGPT / Goose as an MCP connector.
2. **Order the whiskey** — ask your agent to browse, add the whiskey, and check out.
3. **Age gate fires** — the `checkout` tool returns an `age_over_21` requirement. Prove it on your device; order completes.

Dev note (below steps, muted, smaller text):
> Want to customize it? Run locally: `node examples/storefront.mjs` — inject your catalog, own the code.

**Right column — demo transcript card:**

A mock agent-session card (same visual language as the hero `.chat` card, static — no animation):

```
● ● ●  claude · attesto-storefront
──────────────────────────────────
👤  Add the whiskey and check out.
🤖  Added Oak Whiskey · $124. Checking out…
    🔒 age_over_21   ← gate chip (teal border)
       → checkout link · prove on your device
✓  Age verified. Order placed — $124 USD.
```

**Right column — module cards (below demo card):**

Two equal-weight cards in a `1fr 1fr` grid:

| Card | attesto-storefront | attesto-gate |
|---|---|---|
| Role label | Demo app | Gate library |
| Package | `@openmobilehub/attesto-storefront` | `@openmobilehub/attesto-gate` |
| Heading | Run & customize | Gate any app |
| Body | Nine MCP tools, a product widget, gated checkout. Inject your catalog, own the code. | Mount on any Express app. `required()` / `optional()` over any credential. |

### Styling

Reuse existing CSS variables and patterns — no new variables needed:

- Section uses `background: var(--bg)` (alternates correctly with surrounding `--bg2` sections)
- URL block: `background: var(--code)`, `border: 1px solid var(--line)`, `border-radius: 12px`
- Hosted URL text: `font-family: ui-monospace, Menlo, monospace`, `color: #7dd3fc` (matches existing `.c-num`)
- Compatibility badges: `border: 1px solid var(--line)`, `color: var(--teal)`, small pill style
- Step numbers: teal circle, `background: var(--code)`, `border: 1px solid rgba(45,212,191,.4)`
- Demo card: same `.chat` / `.chat-head` / `.chat-body` structure as the hero (reuse those classes), but static (no JS animation)
- Module cards: same `.card` class as the how-it-works grid cards
- Dev note: `color: var(--dim)`, `font-size: .85rem`

### Responsive

- At `≤880px`: columns stack (`grid-template-columns: 1fr`), demo card moves below steps
- At `≤520px`: URL text truncates with `overflow: hidden; text-overflow: ellipsis` or wraps

### Honesty

The hosted connector is `https://mcp-apps-nine.vercel.app/mcp` — a real deployed server, confirmed live. The demo transcript accurately describes the real flow (the `checkout` tool returns a `requires` manifest with `age_over_21`; the user proves it on the checkout page; the order completes). No fabricated claims. The section does not mention the trust level — that remains in the existing "Honest by design" section further down the page.

## Self-review

- **Placeholders:** None. The hosted URL is confirmed live. Package names and GitHub links are unchanged from the existing page.
- **Internal consistency:** Rename scope is clearly bounded to the website. The "Try it live" section's demo transcript matches the actual tool behavior described in `packages/attesto-storefront/src/server.ts` and `examples/storefront.mjs`.
- **Scope:** Focused. Three changes to one file (`index.html`). No new files, no new dependencies.
- **Ambiguity:** The `og:description` and `twitter:card` meta tags don't contain the brand name — confirmed no change needed there.
