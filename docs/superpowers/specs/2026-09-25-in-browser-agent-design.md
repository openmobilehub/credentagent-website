# In-browser agent demo — design

**Date:** 2026-09-25 · **Status:** approved design, not yet implemented · **Site:** credentagent.ai

## Goal

Let a visitor experience the CredentAgent consent flow **from the website itself**, without registering
a connector in Claude / ChatGPT / Goose / Gemini. The visitor sees an agent conversation, shops in the
**real** MCP Apps product picker, hits the real gate, and proves the credential with Multipaz Wallet.

## Decisions (made during brainstorming)

| Question | Decision |
|---|---|
| Interaction model | **Scenario buttons (H2).** Button-driven, rendered as an agent conversation. Scripted: no LLM, no API key, no backend. |
| Scenarios | `🥃 Buy the whiskey (21+)` (age gate fires) and `🎧 Buy the headphones` (no age gate, payment only). The contrast shows that the *policy* decides what the agent must ask for. |
| Who adds to the cart | **The visitor, inside the real product picker.** The picker calls `set-quantity` and `checkout` itself; the page never calls them. |
| Wallet hand-off | **A hand-off card with a real "Continue to checkout ↗" link** that opens the gate's checkout page in a new top-level tab on the same device, where the gate calls the W3C Digital Credentials API. QR code of the checkout URL as the desktop fallback. |
| Placement | **A tab in "Try it live" (P1):** `▶ Right here` (default) · `In Claude / ChatGPT / Goose` (today's content). A hero link "Try it in your browser ↓". |
| Widget container | **The real widget in a seamless sandboxed iframe** (auto-sized, borderless: looks like a div). |
| Endpoint | **`/marketplace-dev/mcp`** (same-origin on credentagent.ai via the router). One constant, so switching to `/marketplace/mcp` is one line. |

## Verified facts this design relies on (probed 2026-09-25)

- `credentagent.ai/` and `credentagent.ai/marketplace-dev/*` are served by the same router
  (`deploy/router/vercel.json` in the library repo), so page → endpoint is **same-origin**: no CORS needed.
  Cross-origin preflight to the endpoint returns 405 (no CORS), so the GitHub Pages copy cannot run the demo.
- The endpoint is **stateless**: `tools/call` works with no `initialize` and no `mcp-session-id`.
  Replies are `text/event-stream` (`event: message` / `data: {json}`).
- `browse-products` returns the catalog and `_meta.ui.resourceUri`
  (`ui://product-picker/mcp-app-<hash>.html`). **The hash differs between dev and prod and changes per
  deploy**, so it must be read at runtime, never hard-coded.
- `resources/read` on that URI returns `text/html;profile=mcp-app` (~560 KB) with
  `_meta.ui.csp` (`resourceDomains`: picsum + data:, `connectDomains`: the demo-dev origin).
- The widget is built on `@modelcontextprotocol/ext-apps` (`App`, protocol `2026-01-26`). It:
  - calls `set-quantity` on + / −, and `checkout {items}` (its own cart lines) on Checkout
  - requests `ui/open-link {url: checkoutUrl}`
  - polls `<checkout origin>/checkout/order-status?orderId=…` itself (that route sends `Access-Control-Allow-Origin: *`)
  - on completion, calls `get-cart` and sends `ui/update-model-context`
- `checkout` for `oak-whiskey` → `requires`: age 21+ (required), membership (optional), payment.
  For `aurora-headphones` → membership (optional), payment (required). No age.
- Gate pages (`credential-gate/page.ts`, `dc-payment/page.ts`) call
  `navigator.credentials.get({ digital: { requests }, mediation: "required" })`. The supported-browser
  notice names **Chrome 141+ on Android or iOS 18+**. Without the API, the page points to its
  **instant demo** button.
- The checkout page sends no `X-Frame-Options`, but we deliberately do **not** embed it: the wallet APIs
  are unreliable in cross-origin iframes.

## Architecture

Everything stays in `index.html`: inline vanilla JS in its own IIFE, no library, no build step.
Four small units:

| Unit | Responsibility | Depends on |
|---|---|---|
| `mcp` | `call(method, params)` → `fetch` POST JSON-RPC to `ENDPOINT`; parse JSON or SSE `data:`; 15 s timeout via `AbortController`. | `ENDPOINT` only |
| `host` | MCP Apps host bridge. Loads the widget into `<iframe srcdoc sandbox="allow-scripts allow-forms">` (borderless, height from `size-changed`). Answers the handshake, relays the widget's `tools/call` through `mcp`, and emits `onToolCall` / `onOpenLink` / `onModelContext`. Accepts messages **only** where `event.source` is its own iframe. | `mcp` |
| `chat` | Renders user/agent bubbles, tool-call chips (`⚙ name {args} ✓ 180 ms` / `✗`), and the hand-off card. Presentation only. | none |
| `scenarios` | The two scripts. Each: user prompt → agent line → `browse-products` → narration ("Tap + on …, then Checkout") → then reacts to `host` events. | `host`, `chat` |

**Other rules:**
- `ENDPOINT = "/marketplace-dev/mcp"` (relative URL).
- **Lazy loading:** nothing loads until a scenario button is clicked, including the widget.
- **Origin guard:** if `location.hostname` isn't `credentagent.ai` or `www.credentagent.ai` (or localhost
  for the dev server), the "Right here" tab shows "Try it on credentagent.ai ↗" and makes no calls.

## Data flow

1. Visitor clicks a scenario → `chat` user bubble → agent: "Let me open the store."
2. `mcp` `tools/call browse-products` → chip → `_meta.ui.resourceUri`.
3. `mcp` `resources/read {uri}` → `host` creates the iframe.
4. **Handshake:**
   - widget → `ui/initialize`: reply with `protocolVersion`, `hostInfo`, `hostCapabilities` (open links,
     server tools, model context), `hostContext` (`theme: "dark"`, `displayMode: "inline"`)
   - widget → `ui/notifications/initialized`: send `ui/notifications/tool-input` (`{}`) then
     `ui/notifications/tool-result` (the `browse-products` result), and **all products render**
   - widget → `ui/notifications/size-changed`: set the iframe height
   - Exact field names are checked against the SDK schemas in the bundled widget during implementation.
5. Agent narrates: "Tap **+** on the Oak Reserve Whiskey, then **Checkout**."
6. Widget → `tools/call set-quantity` → relayed → chip.
7. Widget → `tools/call checkout` → relayed → chip. `scenarios` reads `requires`:
   - if a required `age` entry exists: "🔒 age 21+ required" → "I can't complete this. You need to prove you're 21+."
   - otherwise: "No age check needed. Approve the payment to finish."
8. Widget → `ui/open-link {checkoutUrl}` → reply `{}`, **no popup**; render the hand-off card:
   - `<a target="_blank" rel="noopener">Continue to checkout ↗</a>`
   - 📱 Needs Multipaz Wallet (https://apps.multipaz.org) · Chrome 141+ on Android or iOS 18+
   - desktop (non-coarse pointer): a QR code of `checkoutUrl`, labeled "Open this checkout on your phone"
   - "No wallet or unsupported browser? The checkout page has an instant-demo button."
   - 🔒 presence-only-demo · the wire crypto is real; the issuer trust anchor is not
9. On the gate tab: "Verify with my digital ID" → DC API → Multipaz → Pay.
10. The widget's own `order-status` polling sees `completed: true` → `get-cart` (relayed, chip) →
    `ui/update-model-context` → agent: "✓ Order placed: $124 USD."

**Honesty invariants:**
- Every chip is a real call with its real latency.
- Agent lines are scripted but only ever *react* to real results.
- The page never calls `set-quantity` or `checkout`.
- A ✓ is shown only after the widget reports completion.

## Error handling

| Situation | Behavior |
|---|---|
| Not on credentagent.ai | "Try it on credentagent.ai ↗"; no calls. |
| Endpoint timeout / non-200 / network error | Red chip; agent says "The demo store isn't responding right now." **Retry** button and a link to the connector tab (and its video). |
| Tool returns `isError` | Red chip with the message; the widget handles it as it would in Claude. |
| Handshake not completed in 10 s | "The product picker didn't load." Remove the iframe; offer Retry. |
| Scenario switch / Start over | Send `ui/resource-teardown`, remove the iframe, clear the chat. A per-run token drops late replies. |
| Visitor never finishes the proof | The card stays; Start over is available. No fake timeout, no fake success. |
| Browser without the DC API | The gate page detects it and offers instant demo; the card warns up front. |
| `prefers-reduced-motion` | No typing effect; bubbles appear instantly. |
| Accessibility | Chat log is `aria-live="polite"`; buttons and tabs work by keyboard; iframe has a `title`. |

## Testing

1. **Unit** (`tests/demo.test.mjs`, `node --test`, zero dependencies). Marker comments fence off the demo
   script in `index.html`; the test extracts it and runs the pure functions in a `vm` context. Covers:
   - SSE/JSON parsing
   - mapping `requires` to agent lines (unknown credentials named generically, never invented)
   - the bridge router, including rejecting foreign `event.source`
   - the per-run token
   - QR encoder against a known test vector
2. **Contract smoke** (`tests/contract.mjs`, against `marketplace-dev`):
   - the tool list contains `browse-products`, `set-quantity`, `checkout` and `get-cart`
   - `resourceUri` is present, and `resources/read` returns `profile=mcp-app`
   - whiskey `checkout` requires `age`; headphones `checkout` doesn't
3. **Local end-to-end** (`tools/dev-server.py`, stdlib only): mimics the router by serving `index.html` at
   `/` and proxying `/marketplace-dev/*` to `https://credentagent-demo-dev.vercel.app`. Drive in Chrome:
   scenario → all products → + whiskey → Checkout → card → gate page opens. Record a GIF for the PR.
4. **Real devices, after merge** (needs the live origin; there is no preview environment):
   - Android Chrome 141+ with Multipaz: the whiskey proof and the headphones payment
   - desktop: scan the QR with a phone
   - iOS 18
   - a non-DC-API browser: instant-demo fallback

## Conventions and docs

- `CLAUDE.md`:
  - add the carve-out, "same-origin `fetch` to `/marketplace*` for the in-browser demo is allowed" (next
    to the YouTube exemption)
  - document the `ENDPOINT` constant, the tests and the dev server
- The self-contained grep stays at 0: relative `fetch` URLs are not external resources.

## Known upcoming change: server migration ("MCP 728")

The library server is being migrated (Diego, 2026-09-25). We build now and retrofit. The design limits
the blast radius:
- transport changes (initialize/session, protocol version, reply format) → `mcp` only
- MCP Apps protocol changes → `host` only
- tool or shape changes → caught by `tests/contract.mjs`

Because `marketplace-dev` deploys from library `main`, run `tests/contract.mjs` in the migration PR. If it
must not block the migration, flip `ENDPOINT` to `/marketplace/mcp` until it settles.

## Out of scope (YAGNI)

- A real LLM or free-text input.
- The zero-install web wallet (separate idea: web pages can't act as DC API wallets today).
- Spending-grant scenarios.
- The GitHub Pages copy running the demo (it links to credentagent.ai instead).
