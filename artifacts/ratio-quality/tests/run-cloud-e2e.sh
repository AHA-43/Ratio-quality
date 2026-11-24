#!/usr/bin/env bash
# Builds the app against the emulators, serves it, and runs the multi-user test inside emulators:exec.
set -euo pipefail
cd "$(dirname "$0")/.."
OUTDIR="${OUT:-$(mktemp -d)}"; export OUT="$OUTDIR"
npx vite build --mode emu --outDir "$OUTDIR/emu-dist" --emptyOutDir >/dev/null
pkill -f "vite.js preview --mode emu" 2>/dev/null || true
npx vite preview --mode emu --outDir "$OUTDIR/emu-dist" --port 4183 --strictPort >/dev/null 2>&1 &
PREVIEW=$!; trap 'kill $PREVIEW 2>/dev/null || true' EXIT
sleep 3
cd ../..
npx --yes firebase-tools@14 emulators:exec --only auth,firestore --project demo-ratio "node artifacts/ratio-quality/tests/e2e-cloud.mjs"
