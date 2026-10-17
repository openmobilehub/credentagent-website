# CredentAgent — make AI agents ask before they buy

**Let AI agents shop your store. CredentAgent makes them ask first.**

> An open-source Node library for MCP servers. Put any tool — checkout, a 21+ item, a member price — behind
> proof from the shopper's phone wallet. The agent does the shopping; the human approves what matters, and
> your server enforces it.

v0.5 · Apache-2.0 · Express + any MCP client (Claude, ChatGPT, Goose) · OpenID4VP · pre-1.0, honest status

```sh
npm i @openmobilehub/credentagent-gate
```

## How it works

Your tool returns a link, not a yes. The shopper's wallet decides.

1. The shopper asks the agent: "Buy the Oak Whiskey."
2. The agent calls your checkout tool.
3. Your server answers: needs `age_over_21` + payment, and here's the approve link.
4. The agent hands the link (or a QR) to the shopper.
5. The shopper opens it and approves in their wallet.
6. The wallet presents the credentials to your server (OpenID4VP).
7. Your server verifies the proof and re-prices the order itself, then completes it.
8. The agent sees the order settled and carries on.

- **The agent never holds a credential.** It carries a link. The proof travels wallet → your server.
- **Enforced on your server.** Amount and policy are re-derived server-side; there's no button the agent can click past.
- **Works in any MCP client.** Claude, ChatGPT, Goose — the tool just returns text and a link. No client plugin.

## Try it live

- In your browser: https://credentagent.ai/#try
- As a hosted MCP connector (add it to Claude, ChatGPT or Goose, then ask the agent to order the whiskey):
  `https://credentagent.ai/marketplace/mcp`
- The unreleased build (library `main`): `https://credentagent.ai/marketplace-dev/mcp`
- To prove credentials on your device, install [Multipaz Wallet](https://apps.multipaz.org) (Android & iOS).

## Get started — gate your first tool in three steps

**1. Install the gate.** One package, types included, no MCP SDK dependency.

```sh
npm i @openmobilehub/credentagent-gate
```

**2. Wire the checkout once, at startup.** `orders.serve(app)` adds the approve page and the wallet proof rails to your Express app.

```js
import { CredentAgent, age, payment, required } from "@openmobilehub/credentagent-gate";

const credentagent = new CredentAgent({
  walletOrigin: "https://shop.example", // your public origin
});
credentagent.orders.serve(app); // approve page + proof rails
credentagent.on("order.settled", ({ id }) => fulfill(id)); // fires once the shopper approves
```

**3. Return an approve link from your checkout tool.** A status tool reads `orders.retrieve(id)` — MCP has no push, so the agent polls it.

```js
// inside your MCP checkout tool
const { id, approveUrl } = await credentagent.orders.create({
  order, // { id, total, currency, lines }, priced by your server
  policy: [required(age.over(21)), required(payment.in("usd"))],
});
return { content: [{ type: "text", text: `Approve here: ${approveUrl}` }] };

// inside your order-status tool
await credentagent.orders.retrieve(id);
// → { ok: true, completion } or { ok: false, pending: true, approveUrl }
```

You'll need Node 20+ and an Express-style app, any MCP server, and a phone with Multipaz Wallet to approve
gated orders. Before you go live, `credentagent.doctor({ print: true })` flags an ephemeral `GATE_SECRET`, a
localhost `walletOrigin` and in-memory stores.

Two packages, versioned in lockstep:

- [`@openmobilehub/credentagent-gate`](https://www.npmjs.com/package/@openmobilehub/credentagent-gate) — gate
  the tools you already have; bring your own catalog and order store with `defineHost()`.
- [`@openmobilehub/credentagent-storefront`](https://www.npmjs.com/package/@openmobilehub/credentagent-storefront) —
  a ready-to-run MCP store: nine shopping tools, a product widget and a gated checkout.

## Use cases — one policy line per rule

| Rule | Policy |
|---|---|
| Age-restricted goods | `required(age.over(21))` |
| Member pricing | `optional(membership.discount(10))` |
| Payment approval | `required(payment.in("usd"))` |
| Any credential (prescription, license, employee status) | `defineCredential({ id: "prescription", … })` |

Going further: **spending grants** (the shopper's wallet signs a bounded budget; the agent buys against it
unattended, every rule re-checked server-side), **`defineHost()`** (your own catalog and order store),
**signed `order.settled` webhooks**, and **custom credentials** via DCQL.

## Status — honest by design

Pre-1.0. The site follows the SDK's own `trust_level` and never claims more than the library enforces.

- **Real today:** passkey approvals (real WebAuthn, origin-bound, replay-protected); signed `order.settled`
  webhooks (HMAC-SHA256); wallet device signatures over a spending grant's exact limits; server-side
  enforcement (amount and policy re-derived on completion).
- **Demo-grade today:** wallet credentials (age, membership, payment) are `presence-only-demo` — the wire
  crypto is real, but with no issuer trust anchor a self-crafted credential would pass. Wallet-signed grants
  are `device-signed` (real signature, demo trust anchor). Click-to-approve grants are for demos and CI only.
- **Before production:** issuer-verified trust (mdoc issuer/device signatures via Multipaz) is the next
  milestone; relaying an external verifier has an interface but no adapter yet.

## Links

- Docs: https://github.com/openmobilehub/credentagent/tree/main/docs/reference
- Examples: https://github.com/openmobilehub/credentagent/tree/main/examples
- GitHub: https://github.com/openmobilehub/credentagent
- Release notes: https://github.com/openmobilehub/credentagent/releases
- For agents: https://credentagent.ai/llms.txt
- About · Contact · Privacy: https://credentagent.ai/about · https://credentagent.ai/contact · https://credentagent.ai/privacy

Built on OpenID4VP, WebAuthn, ISO mdoc, AP2, MCP and Multipaz. An Open Mobile Hub project (Linux Foundation)
with the OpenWallet Foundation and the AAIF Foundation. Apache-2.0.
