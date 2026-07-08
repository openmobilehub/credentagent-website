# credentagent-website

The marketing/landing site for **CredentAgent — the consent layer for AI agents**.

> An AI agent proves a verifiable credential from the user's wallet before a consequential
> action completes. Identity leads; payments is one application.
> Library: https://github.com/openmobilehub/credentagent

## What this is

A single, self-contained static page (`index.html`) — inline CSS + vanilla JS, **zero runtime
dependencies**. No framework, no bundler, no build step. It renders identically opened directly
from `file://`.

## Local development

Open `index.html` in a browser. That's it. (Or `python3 -m http.server` and visit the page.)

## Deploy

GitHub Pages, via `.github/workflows/pages.yml`, on every push to `main`. Enable Pages once in
**Settings → Pages → Source: GitHub Actions**.

## Honesty rule (do not regress)

The **"Honest by design"** section mirrors the SDK's trust model. It must never claim a stronger
guarantee than the library actually provides. The canonical source is
`docs/reference/trust-model.md` in https://github.com/openmobilehub/credentagent. When the SDK's
`trust_level` advances (e.g. to issuer-verified), update the trust table here to match — the site
follows the SDK, never the reverse. Presence-only rails are labeled presence-only and are never
presented as a real safety control.

Apache-2.0 · An Open Mobile Hub project (Linux Foundation / OpenWallet Foundation).
