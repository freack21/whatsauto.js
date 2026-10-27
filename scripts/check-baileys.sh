#!/usr/bin/env bash
# Report whether the installed Baileys matches the latest npm release.
# Always exits 0 so it can be used from hooks or CI without failing them.
cd "$(dirname "$0")/.." || exit 0

pkg="@whiskeysockets/baileys"
installed=$(node -p "require('./node_modules/$pkg/package.json').version" 2>/dev/null || echo "not installed")
declared=$(node -p "require('./package.json').dependencies['$pkg']" 2>/dev/null || echo "unknown")
latest=$(timeout 20 npm view "$pkg" dist-tags.latest 2>/dev/null || echo "unknown")

if [ "$latest" = "unknown" ]; then
  echo "[baileys] latest version could not be fetched (installed: $installed, declared: $declared)."
elif [ "$installed" = "$latest" ] && [ "$declared" = "^$latest" ]; then
  echo "[baileys] up to date: $latest."
else
  echo "[baileys] UPDATE REQUIRED: latest $latest, installed $installed, declared $declared." \
    "Run: npm install $pkg@latest, then npm run typecheck && npm test, and commit package.json + package-lock.json."
fi
exit 0
