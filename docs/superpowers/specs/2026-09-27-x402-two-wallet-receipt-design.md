# x402 two-wallet receipt — design

**Date:** 2026-09-27 · **Status:** approved design, not started · **Repos:** `openmobilehub/credentagent`
(library + hosted store) and `openmobilehub/credentagent-website` (this repo).

## Problem

The in-browser demo ends with `✓ Order placed — $124 USD.` (`index.html`, `settledLine`). A newcomer can't
tell whether anything happened beyond a database row, and the most persuasive fact about CredentAgent gets
lost: **money could not move until the wallet proved the credential.**

Today the hosted stores (`/marketplace`, `/marketplace-dev` → `examples/quickstart/server.mjs`) pass **no
`settle` hook**, so nothing settles. Real x402 settlement exists only in the older reference demo
(`mcp-apps-shopping-demo/payment-gate/hedera-settlement/`: Hedera testnet, HBAR, blocky402 facilitator).
Meanwhile the storefront's checkout page labels the passkey rail **"Pay with x402 Hedera · Passkey"** even
though nothing settles. That overclaims, which the honesty rule forbids.

## Goal

After a demo checkout, a first-time visitor sees a real testnet payment move between **two named wallets**
and can **verify it themselves on a public block explorer**, on either of two chains. They also see that
the transfer happened only *after* the credential proof.

**Success test:** someone new to x402 and verifiable credentials can click one link from the receipt, land
on HashScan or BaseScan, and find the same amount, the same two addresses and a timestamp matching what the
page showed.

## Decisions (made during brainstorming)

| Question | Decision |
|---|---|
| Chain | **Both, switchable:** Hedera testnet (HBAR, HashScan) and Base Sepolia (USDC, BaseScan). Delivered in two phases: Hedera first, because its code exists, then Base. |
| Payer | **One site-funded "agent wallet" per chain**, custodial, public, and labeled as such. Topped up from faucets. |
| Payee | **One "merchant wallet" per chain**, also ours and public. |
| What to show | **A:** a two-wallet receipt card, plus **B:** a "why it's safe" timeline. **C** (a live public ledger strip) is deferred to phase 3. |

## Design

### 1. Library / hosted store (`credentagent` repo)

**1a. Settlement adapters.** Two adapters implement the existing `settle(order) → SettlementRecordLike`
seam (`packages/credentagent-gate/src/ceremony/completion.ts`). A throw keeps meaning "authorized, not
completed".

- `hedera`: ported from `mcp-apps-shopping-demo/payment-gate/hedera-settlement/`. It uses the static
  agent account (the `HEDERA_CUSTOMER_ID` path), **not** the per-order session wallet, so balances
  before and after tell one continuous story.
- `base-sepolia`: an x402 `exact`-scheme USDC payment (EIP-3009 `transferWithAuthorization`), settled
  through the public x402.org facilitator, and ported from `strongbox-backed-x402-wallet` /
  `stripe-x402` step 02. The asset is Base Sepolia USDC.

Both adapters live in `examples/quickstart/settlement/` (example code, not a published package API).
They get promoted only if a second consumer appears (YAGNI).

**1b. The settlement record gets a chain-neutral shape.** The widget currently reads `hashscanUrl`, which
is Hedera-specific. Both adapters return:

```ts
{
  network: "hedera-testnet" | "base-sepolia",
  txId: string,                       // Hedera tx id or EVM tx hash
  status: "settled",
  explorerUrl: string,                // tx page
  payer: { address: string, label: "Agent wallet (demo, custodial)", explorerUrl: string },
  payTo: { address: string, label: "Merchant wallet (demo)", explorerUrl: string },
  amount: { value: string, asset: "HBAR" | "USDC", decimals: number },
  orderTotal: { value: number, currency: "USD" },  // what the cart said
  scale: number,                      // settled = orderTotal × scale (see §4)
  balances?: { payer: { before: string, after: string }, payTo: { before: string, after: string } },
  settledAt: string, settledInMs: number,
  steps?: { name: "requirements" | "signed" | "settled", at: string }[],
}
```

`hashscanUrl` remains as an alias on Hedera records for the existing widget until it reads `explorerUrl`.
`get-order-status` and `/checkout/order-status` already forward `order.settlement` unchanged.

**1c. Choosing a chain per order.** The quickstart store accepts an optional `settleOn` on checkout
(`"hedera"` | `"base-sepolia"`):
- The server validates it against an allowlist and defaults to `hedera`.
- It is carried on the order and read by the `settle` dispatcher.
- An unknown value is refused, never guessed.

The exact field placement (checkout tool arg vs. cart-level preference) is settled in the library PR. The
requirement is that the choice is per order, validated on the server, and can't change after the gate
has authorized.

**1d. `GET /checkout/wallets`** (same origin, cached for about 10 s) returns
`{ chains: [{ network, agent: {address, balance, explorerUrl}, merchant: {…} }] }`.
- Balances are read on the server: the Hedera mirror node for Hedera, a Base Sepolia RPC `balanceOf` for
  Base.
- The website stays free of cross-origin calls, which keeps the self-contained rule intact.
- The adapters also record balances before and after on each settlement.

**1e. Guardrails.**
- **Scaled amounts:** the default is `scale = 1/10 000`, so a $124 order settles 0.0124 USDC, or the HBAR
  equivalent at the existing demo peg.
- **Per-visitor rate limit:** keyed by IP or `cartId`; the default is 5 settlements per hour.
- **Daily spend cap** per chain.
- **Low-balance check** before settling.

When a guardrail trips or the facilitator fails, the order completes as **authorized, not settled**, with
a stated reason (`"demo wallet empty"`, `"rate limited"`, `"facilitator unavailable"`). It is never shown
as settled. Note the difference from a configured `settle` that throws: this is a deliberate skip
decided before settling, recorded as `settlement: { status: "skipped", reason }`.

**1f. Honesty fix to the rail label.** `server.ts` "Pay with x402 Hedera · Passkey" becomes "Pay with
Passkey" when no `settle` is configured, and "Pay with Passkey · settles via x402 (testnet)" when one is.
This ships in phase 1 regardless of the rest.

**1g. Secrets.** Signing keys for the agent wallets (Hedera operator/customer key, Base Sepolia private
key) live only in the Vercel env of `credentagent-demo` / `credentagent-demo-dev`. They are never in a
repo and never in a response. The dev store gets its own wallets.

### 2. Website (`credentagent-website`, `index.html`)

**2a. Chain toggle.** A two-option segmented control in the demo dock, **Settle on: Hedera · Base**:
- It defaults to Hedera and is remembered in `localStorage` (a per-viewer convenience, wrapped in
  try/catch).
- It is sent as `settleOn` with checkout.
- It stays disabled mid-order.

**2b. Two-wallet receipt card.** It is rendered from `order.settlement` after `order-status` reports
completion, and replaces the bare `✓ Order placed` line when a settlement exists.

```
 ✓ Paid — real testnet transfer on Base Sepolia
 ┌──────────────────┐   0.0124 USDC   ┌──────────────────┐
 │ 🤖 Agent wallet   │ ──────────────▶ │ 🏪 Merchant wallet│
 │ 0x3f…a91c ↗      │                 │ 0x7b…02de ↗      │
 │ 4.2100 → 4.1976  │                 │ 1.0312 → 1.0436  │
 └──────────────────┘                 └──────────────────┘
 tx 0x9c1e…44b0 · 2.1 s · Verify on BaseScan ↗
 Order total $124 · settled at 1/10,000 scale · testnet, no real money
```

- Every ↗ opens the explorer in a new tab (`rel="noopener"`). Links go through the existing
  "absolute https URL only" check, extended with an explorer-host allowlist (`hashscan.io`,
  `sepolia.basescan.org`).
- The amount moving across is a CSS transition. Under `prefers-reduced-motion` it renders the final state
  statically.
- If `balances` is absent, the card shows the addresses without before/after and says nothing false.
- It is responsive: the two cards stack vertically at ≤520px, with the arrow rotated downward.

**2c. "Why it's safe" timeline.** A compact list of steps under the card, each with a timestamp from the
order record:

1. 🔒 Gate asked for `age_over_21` + `payment · usd`
2. 📱 Wallet proved them *(presence-only-demo)*
3. 💳 x402 payment requirements issued (amount, asset, `payTo`)
4. ✍️ Agent wallet signed the payment
5. ⛓️ Facilitator settled on-chain: **tx ↗**

It carries one line of plain language: *"The payment in step 5 could not happen until steps 1–2
succeeded. That's the gate."*

Timestamps come only from the record:
- step 2 uses `completedAt`'s authorization time;
- step 5 uses `settlement.settledAt`;
- steps 3–4 appear only if the adapter records them as `settlement.steps[]`.

The wording describes what the adapter actually does. For example, it says "402 Payment Required" only if
a real HTTP 402 round trip happened. Timestamps are never invented.

**2d. Not settled.** For `settlement.status === "skipped"` or an absent settlement, the page shows
`✓ Order authorized — not settled on-chain (<reason>)` with a muted style and no receipt card.

**2e. Where the wallets live on the page.** The receipt appears only in the demo dock. A small caption
below the demo reads *"Every demo payment is public: agent wallet on HashScan ↗ · on BaseScan ↗"*, with
addresses fetched once from `/checkout/wallets`. The caption is hidden if that fetch fails, and it doubles
as a public audit trail.

**2f. The GitHub Pages copy** has no demo, so nothing changes there beyond the trust-table row.

### 3. "Honest by design" table

Add one row that mirrors the library's own wording once it lands:

> **x402 settlement (demo stores)**: a real transfer on a public **testnet** (Hedera or Base Sepolia),
> paid from a **custodial demo wallet we fund**, verifiable on the explorer. No real money. The payment
> credential that authorizes it is still `presence-only-demo`. **Status:** `real testnet transfer · demo
> custody`.

This row must not suggest the visitor's wallet paid or that the credential step became stronger. Add it
only after the library's README "Honest status" describes the same thing (the site follows the SDK).

### 4. Why scale the amount

Settling the full $124 in test USDC would drain faucet-funded wallets in a few orders. Settling a flat
$0.01 would break the link between the cart and the chain. A fixed, stated scale keeps the two
proportional and checkable ("$124 → 0.0124 USDC"), and the receipt always prints the scale.

## Phasing

| Phase | Library (`credentagent`) | Website |
|---|---|---|
| **1 — Hedera** | Hedera adapter; neutral settlement record; `/checkout/wallets`; guardrails; rail-label fix; env on dev, then prod store | Receipt card + timeline + not-settled state; wallets caption; trust row (after the library README) |
| **2 — Base Sepolia** | Base adapter; `settleOn` dispatch | Chain toggle; BaseScan in the allowlist |
| **3 — later** | Persist recent settlements | "Live ledger" strip (C) |

Each phase is validated first on `/marketplace-dev/mcp` (`node tests/contract.mjs
https://credentagent.ai/marketplace-dev/mcp`), then released and switched to `/marketplace/mcp`.

## Testing

- **Library:**
  - Adapter unit tests with a mocked facilitator: the record shape, and that a throw means no completion.
  - Guardrail tests: rate limit, cap and low balance each produce `skipped`, never `settled`.
  - A `settleOn` allowlist test.
  - A rail-label test covering both states.
- **Website** (`node --test "tests/*.test.mjs"`, pure `ca-demo-core`):
  - `settlementView(order)` maps a settled Hedera record, a settled Base record, a skipped record and a
    missing settlement to the right view model.
  - Explorer URLs outside the allowlist are dropped.
  - Balance deltas are formatted with the asset's decimals.
  - The timeline omits missing timestamps.
- **Contract** (`tests/contract.mjs`): after a scripted checkout on the dev store, `order.settlement` has
  the neutral shape, and its `explorerUrl` host is on the allowlist.
- **Manual:** one real order per chain on dev. Click through to the explorer and confirm the amount, both
  addresses and the time match the card.

## Out of scope

- The visitor's own wallet paying (MetaMask, HashPack, StrongBox wallet). That is a separate idea next to
  the zero-install web wallet.
- Mainnet or real money.
- Changing the credential trust level. This work makes settlement real on testnet only; it does not make
  the proof any stronger.
