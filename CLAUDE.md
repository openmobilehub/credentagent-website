# CLAUDE.md — credentagent-website

Project context for Claude (and humans). Read before editing. This repo is the **marketing/landing
site for CredentAgent** — "the consent layer for AI agents."

## What this is

A single, **self-contained** static landing page (`index.html`) — inline CSS + vanilla JS, **zero
runtime dependencies**, no framework, no bundler, no build step. It renders identically opened
directly from `file://`.

- **Live:** https://credentagent.ai/ — the `credentagent.ai` router (in the library repo, `deploy/router`)
  serves this same page under that domain; also at https://openmobilehub.github.io/credentagent-website/
  (GitHub Pages, **GitHub Actions** source). All serve the identical `index.html`.
- **Deploy:** `.github/workflows/pages.yml` deploys on every push to `main`. Pages is already enabled
  (Settings → Pages → Source: GitHub Actions). A merge to `main` auto-redeploys.
- **Local dev:** open `index.html` in a browser, or `python3 -m http.server` and visit it.

## The product it markets (so the copy stays accurate)

CredentAgent: an AI agent proves a verifiable credential from the user's wallet **before** a consequential
action completes. **Identity leads; payments is one application.** An OpenMobileHub / OpenWallet
Foundation / AAIF Foundation project, heading to the Global Digital Collaboration Conference (Sept 1–2)
co-presented with Multipaz. Two npm packages, versioned in lockstep, both live at `0.5.0`:
`@openmobilehub/credentagent-gate` (the Gate — `new CredentAgent()`, `credentagent.mount(app)`, policy of
`required()`/`optional()` credentials, plus `orders`, `grants`, `webhooks`, `defineHost()`, `doctor()`,
`branding`) and `@openmobilehub/credentagent-storefront`.

## Design

- **Direction:** the CredentAgent brand, **light by default** with a remembered **☾/☀ toggle** to dark.
  Light: brand paper `#F2F4F0` + ink `#0E1220`, Precision-Hydration **purple** `#420A98` primary, **orange**
  `#FF5100` for attention only (the gate). Dark: brand ink + **volt** `#C6F53C` primary. Spec:
  `docs/superpowers/specs/2026-09-27-light-theme-design.md`.
- **Tokens:** all colour is semantic tokens in `index.html` — `:root` (light) and `:root[data-theme="dark"]`.
  No raw colour literal elsewhere; `--attention`/`--brand-mark` are never text; every text pair meets WCAG
  AA — `tests/theme.test.mjs` enforces all three. The theme is applied pre-paint by the `ca-theme-boot`
  script in `<head>` (key `localStorage["credentagent.theme"]`). Trust-table labels: `✓ real crypto`
  (`--ok`), `device-signed · demo` (`--accent2`), and every `*-demo` level as a `⚠` dashed `--warn` badge.
- **Logo:** mark + wordmark, where the wordmark is ONE element `<span class="wordmark">Credent<em>Agent</em></span>`
  (CredentAgent is a single word — never a gap). Font: Space Grotesk 600 subset, inline, SIL OFL 1.1;
  regenerate with `tools/build-wordmark-font.py`. Brand assets: the CredentAgent logo Drive folder (README palette).
- **Audience (2026-09-27 redesign):** MCP server developers who build for merchants. Goals: npm installs and
  demo runs, with a visible path to production. Copy says what it is in the first screen ("an open-source Node
  library for MCP servers"); one primary CTA (Get started) + one demo CTA; release news is a one-line strip.
- **Hero:** headline + install line (copy button) on the left; on the right a policy code card above the
  animated **"Watch the agent ask"** consent-handshake: a user prompt → an agent pauses → a 🔒 gate pulses →
  a 📱 wallet proves two credentials (age_over_21, then payment · usd) → the action completes → loops (~9s).
  The first loop opens mid-conversation so the first frame is never empty. It **honors
  `prefers-reduced-motion`** (renders the final state statically, no motion). The heading's accent class is
  `.h1-ask` — `.ask` belongs to the demo dock's Ask form.
- **Sections (top→bottom):** sticky nav → hero → **how it works** (4-actor sequence diagram, an ordered
  list ≤880px) → try-it-live (tabs: **▶ Right here** — opens the in-browser agent demo in its chat-window
  dock — and **In Claude / ChatGPT / Goose** — YouTube demo + hosted connector) → **get started** (3 steps
  on `orders.serve` / `orders.create` / `orders.retrieve`, prerequisites, go-live box, gate-vs-storefront
  chooser) → use cases (policy line per tile) → go further (tabbed code: grants / defineHost / webhooks /
  defineCredential) → **Status · honest by design** (real / demo-grade / before-production summary + the
  full trust table in a `<details>` + **check a credential yourself** (`#verify`: open the wallet's ISO
  mdoc in tools.multipaz.org's viewer / verifier / X.509 viewer; demo issuer = Utopia Demo IACA; says
  plainly the gate doesn't check the issuer signature) → built-on-open-standards → footer. The
  `inspectPresentations` line there is labeled "coming in the next gate release" (library PR #223) —
  drop that label once it ships. Every code sample must match the
  published gate README — verify against the library's release tag before changing one.
- **Full rationale:** `docs/2026-06-28-attesto-website-design.md` (a synced copy; the canonical version
  lives in the demo repo — see Links).

## Conventions — do not regress

- **Self-contained:** no external `<script src>` / `<link rel="stylesheet">` / `<img src="http…">` /
  `url(http…)`. Everything inline. Verify before committing:
  ```bash
  grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l   # must be 0
  ```
  Note: the YouTube `<iframe>` embed is intentional and exempt from this check. So is the in-browser
  demo's **same-origin** `fetch` to `/marketplace-dev/mcp` — the dev twin running library `main`, so
  unreleased changes show on the site first (switched 2026-09-27; the credentagent.ai router proxies it).
  Point the `ENDPOINT` constant in the demo script back at `/marketplace/mcp` to use the latest published
  release instead. Also exempt: the **Ask AI**
  box's same-origin `POST /api/ask` (see below).
- **No framework / bundler / build step.** A single hand-authored page is the right size — YAGNI on tooling.
- **Accessibility:** keep the `@media (prefers-reduced-motion: reduce)` guard and the responsive
  breakpoints (`@media (max-width:880px)` and `…520px`).
- **DCO:** sign off every commit with `git commit -s` (the OpenWallet Foundation org enforces it).
- **Workflow:** make changes on a branch and open a PR to `main`; merging auto-deploys via Pages. Don't
  push straight to `main` without sign-off.
- **Honesty rule (load-bearing):** the **"Honest by design"** trust table mirrors the SDK's
  `trust_level`. The site must **never** claim a stronger guarantee than the library actually provides.
  Canonical source: `docs/reference/trust-model.md` in https://github.com/openmobilehub/credentagent. When the
  SDK's `trust_level` advances (e.g. to issuer-verified), update the table here — **the site follows the
  SDK, never the reverse.** Presence-only rails are labeled presence-only and are never presented as a
  real safety control.

## In-browser agent demo — test & run

- Spec: `docs/superpowers/specs/2026-09-25-in-browser-agent-design.md`; plan:
  `docs/superpowers/plans/2026-09-25-in-browser-agent.md`. Logic lives in the pure `ca-demo-core` script
  (between `/* ca-demo-core:begin */` and `/* ca-demo-core:end */`); the DOM script after it wires it up.
- **Where it renders — the dock:** `#demo` lives in a chat-style panel (`#dock`, fixed bottom-right;
  full-screen under 520px) opened by the floating `▶ Try it live` launcher, the hero CTA, the nav link and
  the **▶ Right here** tab — anything with `data-open-demo`. It sits there from page load and is only
  shown/hidden, **never moved** (moving an iframe reloads it and would drop the picker's cart). Esc closes
  it and returns focus to the opener.
- Unit tests (zero deps): `node --test "tests/*.test.mjs"`
- Live contract vs. the endpoint: `node tests/contract.mjs` defaults to the production store (the hosted
  connector) — **not** the store the demo uses. `node tests/contract.mjs https://credentagent.ai/marketplace-dev/mcp`
  checks library `main`, which the in-browser demo uses — run it in any library PR that changes the
  storefront's tools, transport, or MCP Apps widget, and again after it merges (that merge is what the
  live demo runs).
- QR round trip (macOS): `node tests/qr-roundtrip.mjs`
- Local same-origin run: `python3 tools/dev-server.py` → http://localhost:8787/#try (hard-reload after
  edits — the stdlib server lets Chrome cache the page). If the proxy fails with
  `SSLCertVerificationError`, your `python3` is the python.org build without CA certs: run its
  `Install Certificates.command` once, or use Homebrew's `/opt/homebrew/bin/python3`.
- The demo only runs on `credentagent.ai` (and localhost); the GitHub Pages copy links there instead.
- **Carts are per conversation (library 0.5.0+):** the first cart-related call (the demo's
  `browse-products`) issues a signed `cartId`; the picker widget sends it back on `set-quantity` /
  `checkout`, so each visitor gets their own cart and an invented or edited id is refused. The page needs
  no code for this — it forwards the `browse-products` result to the widget. (Before 0.5.0 the hosted
  stores ran `statelessMcp` with one shared cart key for every visitor; verified fixed on both
  `/marketplace-dev` and `/marketplace` on 2026-09-26.) A completed order **empties** that cart, even
  when the completion lands on a different serverless instance than the checkout (library #227, live on
  `/marketplace-dev` 2026-09-27). Before it, "Order complete" could be followed by a `get-cart` that still
  listed the bought items — a store bug, not the page's: the page only shows what `get-cart` returns.
- **Keep the dock minimal (less is more):** opened, it shows one sentence, **one** start button (🥃 whiskey,
  the gated path), and the Ask input pinned at the bottom — no intro paragraph, no second scenario, no
  wallet box (the checkout card says which wallet, when it matters). The agent does what the button
  says: `browse-products` → **`add-to-cart`** (the scenario's `productId`, with the signed `cartId`) → the
  picker opens on that result with the item already in the cart, so the visitor's one step is Checkout. ↺ Start over sits in the header and
  appears only once something happened. The checkout card has one help line and no "I've finished"
  button: `watchOrder` re-reads the settled order every 4 s and on tab return (bounded, stopped on reset).
- **Order complete is a moment:** when the settled order comes back, `celebrate()` collapses the checkout
  card to its honesty badge, adds a big **✓ Order complete · $X paid** card with a receipt (`doneSummary`)
  and fires `ca-order-complete`. Every receipt row is read from the settled order record or the checkout
  the page received — never assumed: Order id; "Age 21+ ✓ proven" only if the checkout required it (the
  gate refuses to complete an age-gated order without the proof); "Member discount −$X (N% off)" only if
  less was charged than the checkout total; "Paid with" from `order.method` + `settlement.provider/network`
  (e.g. Passkey · x402 on Hedera testnet); "Transaction" `settlement.txId`, linked only to an https
  `hashscanUrl`; the dock script throws ~2.5 s of canvas confetti
  in the brand tokens (`confetti()` in `ca-demo-core`). Dock closed at that moment → the launcher turns
  green "✓ Order complete" and the confetti plays on open. `prefers-reduced-motion` → the card, no confetti.
- **Ask AI (the input pinned at the bottom of the dock):** visitors ask about their order, cart or the products;
  the page POSTs `{ question, context: { cartId?, orderId? }, history }` to the same-origin `/api/ask`, a
  Vercel function on the credentagent.ai router (library repo `deploy/router/api/ask.mjs`). It runs Z.ai's
  `glm-5` → `glm-4.5-air` → free `glm-4.5-flash` (paid from a prepaid
  Z.ai balance, ~$0.005 a question) with the store's read tools **plus the cart edits** (`add-to-cart`,
  `set-quantity`, `remove-from-cart`, on the visitor's own signed cartId). It can **never check out, pay,
  or touch a grant** — the visitor checks out in the picker, where 21+ items ask for the wallet proof. The
  router also refuses to let an answer claim a cart change no tool made. The `ZAI_API_KEY` lives on the
  `credentagent-router` Vercel project. The page only builds the request and shows the reply
  (`askRequest` / `cartIdFrom` / `askReplyLine` / `askChipStatus` in `ca-demo-core`). Answers are labeled
  **✦ AI answer** with the tools used (the chip says "edited your cart" when it did); keep that label and
  the "can edit your cart, never checks out" note (honesty rule). Locally, `tools/dev-server.py` relays `/api/ask` to
  credentagent.ai, or to `ASK_TARGET` (e.g. a local copy of the function).
- **Ask AI renders MCP Apps (library PR #216+):** when the AI calls a tool that declares a `ui://`
  resource (e.g. "show me the products" → `browse-products` → the product picker), `/api/ask` returns
  `app: { tool, resourceUri, result }`. The page (`askApp` + `showApp`) renders it as any MCP host would:
  its own `tools/list` must declare that same `ui://` for the tool, then `resources/read` and the usual
  `mountWidget` bridge with the AI's tool result. One live app at a time: a later UI tool reply while it's
  open (e.g. the AI's `add-to-cart`) is pushed into the open picker as a new `tool-result`, so its cart
  updates in place. Picker actions go page → store via the bridge, never through the AI.

## Current state (2026-09-27)

- The site reflects the published **0.5.0** packages (released 2026-09-26: claude.ai's MCP 2026-07-28
  revision, wallet-signed spending grants, a cart per conversation). The in-browser demo uses the dev
  store `/marketplace-dev/mcp` (library `main`, since 2026-09-27). Hosted connector: `https://credentagent.ai/marketplace/mcp`
  (dev twin running library `main`: `/marketplace-dev/mcp`).
- **A library fix reaches the live demo on merge — no release needed.** The library's `deploy-dev`
  workflow redeploys `/marketplace-dev` on every merge to `main`; confirm with
  `curl https://credentagent.ai/marketplace-dev/version` (`"build": "dev.<sha>"`). A release only matters
  for the hosted connector (`/marketplace`) and the npm packages — don't tell someone a demo fix is
  waiting on one.
- **Trust levels (0.5.0):** `presence-only-demo` (age, membership, payment), `device-signed` (wallet-signed
  grants: real device signature over the grant's limits, no issuer anchor — still a demo),
  `server-issued-demo` (opt-in click-to-approve grants), `issuer-verified` (only via an external verifier;
  none ships). The library's `docs/reference/trust-model.md` had not caught up with `device-signed` at
  0.5.0 — the table follows the gate README's "Honest status" and `types.ts` until it does.
- All repos and npm packages have been renamed: `openmobilehub/credentagent` (library),
  `openmobilehub/credentagent-website` (this repo), `@openmobilehub/credentagent-gate`,
  `@openmobilehub/credentagent-storefront`.
- Open ideas for "continue updating the website" (not yet done): an OG/social image; a docs/blog;
  splitting `index.html` into `styles.css` + `app.js` if it grows. (Custom domain: done — `credentagent.ai`
  via the router, no `CNAME` needed here.)
- **Idea — zero-install web wallet (2026-09-25, not started):** a browser-based wallet holding a generic
  demo credential, so a visitor can complete a proof without installing anything. Must stay labeled
  `presence-only-demo` per the honesty rule.

## Links

- **Library (public):** https://github.com/openmobilehub/credentagent
- **npm:** https://www.npmjs.com/package/@openmobilehub/credentagent-gate ·
  https://www.npmjs.com/package/@openmobilehub/credentagent-storefront
- **Reference demo + project dashboard (the cross-project hub, with `STATUS.md` + the design specs/plans):**
  https://github.com/openmobilehub/mcp-apps-shopping-demo
