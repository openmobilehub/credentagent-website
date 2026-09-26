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
- **Sections (top→bottom):** sticky nav → animated hero → problem band → try-it-live (YouTube demo +
  hosted connector) → how-it-works (3 cards) → quickstart (gate policy ladder with imports) →
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
  Note: the YouTube `<iframe>` embed is intentional and exempt from this check.
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

## Current state (2026-09-25)

- The site reflects the published **0.4.0** packages (not unreleased `main`). Hosted connector:
  `https://credentagent.ai/marketplace/mcp` (dev twin running `main`: `/marketplace-dev/mcp`).
- All repos and npm packages have been renamed: `openmobilehub/credentagent` (library),
  `openmobilehub/credentagent-website` (this repo), `@openmobilehub/credentagent-gate`,
  `@openmobilehub/credentagent-storefront`.
- Open ideas for "continue updating the website" (not yet done): an OG/social image; a docs/blog;
  splitting `index.html` into `styles.css` + `app.js` if it grows. (Custom domain: done — `credentagent.ai`
  via the router, no `CNAME` needed here.)
- **Idea — in-browser agent (2026-09-25, not started):** let visitors trigger the flow from the page itself,
  with no connector registration in Claude/ChatGPT/Gemini: drive the hosted MCP store, render the MCP app /
  product picker, fire the checkout, and hand the proof to the wallet — with a clear "install Multipaz
  Wallet" prompt. Open questions: scripted (no LLM) vs. a real LLM (needs a backend for the API key — not
  static); CORS on `credentagent.ai/marketplace/mcp`; this breaks the zero-network-calls convention, so it
  needs an explicit carve-out like the YouTube embed.
- **Idea — zero-install web wallet (2026-09-25, not started):** a browser-based wallet holding a generic
  demo credential, so a visitor can complete a proof without installing anything. Must stay labeled
  `presence-only-demo` per the honesty rule.

## Links

- **Library (public):** https://github.com/openmobilehub/credentagent
- **npm:** https://www.npmjs.com/package/@openmobilehub/credentagent-gate ·
  https://www.npmjs.com/package/@openmobilehub/credentagent-storefront
- **Reference demo + project dashboard (the cross-project hub, with `STATUS.md` + the design specs/plans):**
  https://github.com/openmobilehub/mcp-apps-shopping-demo
