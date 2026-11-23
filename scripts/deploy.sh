#!/usr/bin/env bash
# Build the app and publish hosting + Firestore rules to the ratio-quality Firebase project.
# Run from the repository root (e.g. in Google Cloud Shell after `firebase login --no-localhost`).
set -euo pipefail
npm i -g pnpm >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm --filter @workspace/ratio-quality build
npx --yes firebase-tools deploy --only hosting,firestore:rules --project ratio-quality
