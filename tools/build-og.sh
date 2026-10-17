#!/bin/sh
# Rebuild og.png (the social card) from tools/og-card.html with headless Chrome. macOS path; override with CHROME=.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot="$PWD/og.png" "file://$PWD/tools/og-card.html"
