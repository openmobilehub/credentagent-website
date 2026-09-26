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
co-presented with Multipaz. Two npm packages, versioned in lockstep, both live at `0.4.0`:
`@openmobilehub/credentagent-gate` (the Gate — `new CredentAgent()`, `credentagent.mount(app)`, policy of
`required()`/`optional()` credentials, plus `orders`, `grants`, `webhooks`, `defineHost()`, `doctor()`,
`branding`) and `@openmobilehub/credentagent-storefront`.

## Design

- **Direction:** bold & dark — surf palette (electric blue, sea-green, violet) on deep indigo-ocean.
  Palette tokens live in `index.html` `:root` (`--bg`, `--teal` (blue), `--green`, `--purple`, etc.).
- **Hero:** the animated **"Watch the agent ask"** consent-handshake: a user prompt types out → an agent
  pauses → a 🔒 gate pulses → a 📱 wallet proves two credentials (age_over_21, then payment · usd) →
  the action completes → loops (~9s). It **honors `prefers-reduced-motion`** (renders the final state
  statically, no motion).
- **Sections (top→bottom):** sticky nav → animated hero → problem band → try-it-live (tabs: **▶ Right
  here** — the in-browser agent demo — and **In Claude / ChatGPT / Goose** — YouTube demo + hosted
  connector) → how-it-works (3 cards) → quickstart (gate policy ladder with imports) →
  **what's new** (tabbed code: orders / grants / defineHost / webhooks + doctor/branding/iPhone cards) →
  gate-any-credential → **Honest by design** (the trust table) → built-on-open-standards →
  for-developers → footer.
- **Full rationale:** `docs/2026-06-28-attesto-website-design.md` (a synced copy; the canonical version
  lives in the demo repo — see Links).

## Conventions — do not regress

- **Self-contained:** no external `<script src>` / `<link rel="stylesheet">` / `<img src="http…">` /
  `url(http…)`. Everything inline. Verify before committing:
  ```bash
  grep -ioE '<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src=|url\(\s*https?:' index.html | grep -i http | wc -l   # must be 0
  ```
  Note: the YouTube `<iframe>` embed is intentional and exempt from this check. So is the in-browser
  demo's **same-origin** `fetch` to `/marketplace-dev/mcp` (the credentagent.ai router proxies it; the
  `ENDPOINT` constant in the demo script switches to `/marketplace/mcp` for the published 0.4.0 build).
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
- Unit tests (zero deps): `node --test "tests/*.test.mjs"`
- Live contract vs. the endpoint: `node tests/contract.mjs` — run it in any library PR that changes the
  storefront's tools, transport, or MCP Apps widget (e.g. the MCP 728 migration).
- QR round trip (macOS): `node tests/qr-roundtrip.mjs`
- Local same-origin run: `python3 tools/dev-server.py` → http://localhost:8787/#try (hard-reload after
  edits — the stdlib server lets Chrome cache the page). If the proxy fails with
  `SSLCertVerificationError`, your `python3` is the python.org build without CA certs: run its
  `Install Certificates.command` once, or use Homebrew's `/opt/homebrew/bin/python3`.
- The demo only runs on `credentagent.ai` (and localhost); the GitHub Pages copy links there instead.
- **Known limitation (library, not this site):** the hosted storefronts run `statelessMcp`, so the
  cart the product picker shows and edits is **one shared cart for every visitor** (`extra.sessionId`
  is absent → shared key; see `statelessMcp` in `packages/credentagent-storefront/src/server.ts`).
  Checkout itself is per-visitor (the widget sends its on-screen items), but concurrent visitors can
  see each other's cart lines.

## Current state (2026-09-25)

- The site reflects the published **0.4.0** packages (not unreleased `main`) — except the in-browser
  demo, which deliberately targets `/marketplace-dev/mcp` (library `main`), so a library merge can change
  or break it; `node tests/contract.mjs` catches that. Hosted connector:
  `https://credentagent.ai/marketplace/mcp` (dev twin running `main`: `/marketplace-dev/mcp`).
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
