#!/usr/bin/env bash
# sync.sh — distribute the canonical brain-core dist to all project copies.
#
# Same shape as ~/Code/bot-guards/sync.sh: refuses on dirty git, runs
# tests, stamps VERSION (timestamp + git SHA + content hash), copies
# dist/* into every target's lib/brain-core/, verifies post-copy hash
# parity.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# ── 1. Sanity ──────────────────────────────────────────────────────────
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "FATAL: $HERE is not a git repo."; exit 1
fi
if ! git diff-index --quiet HEAD --; then
  echo "FATAL: uncommitted changes in $HERE."
  git status --short
  exit 1
fi

# ── 2. Targets ─────────────────────────────────────────────────────────
TARGETS=(
  "/Users/milaaj/Code/nisria-techops/platform/lib/brain-core"
  "/Users/milaaj/Code/jensen-pa/lib/brain-core"
  "/Users/milaaj/Code/capetown-halaal-landing/src/lib/brain-core"
)

# ── 3. Build ───────────────────────────────────────────────────────────
echo "→ rebuilding dist/"
rm -rf dist
npm run --silent build

# ── 4. Test ────────────────────────────────────────────────────────────
echo "→ running tests"
if ! npm test --silent >/tmp/brain-core-test.log 2>&1; then
  echo "FATAL: tests failed."
  tail -20 /tmp/brain-core-test.log
  exit 1
fi
TEST_LINE=$(grep -E "^# (tests|pass|fail)" /tmp/brain-core-test.log | tr '\n' ' ')
echo "  $TEST_LINE"

# ── 5. Stamp ───────────────────────────────────────────────────────────
SHA=$(git rev-parse --short HEAD)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PKG_VER=$(node -p "require('./package.json').version")
CONTENT_HASH=$(
  find dist -type f \( -name "*.js" -o -name "*.d.ts" \) -not -name "*.map" \
  | sort | xargs cat | md5 | awk '{print $1}'
)
cat > dist/VERSION <<EOF
package: @sinanagency/brain-core
version: $PKG_VER
git_sha: $SHA
built_at: $TS
content_hash: $CONTENT_HASH
EOF
echo "→ stamped dist/VERSION (v$PKG_VER, $SHA, hash=${CONTENT_HASH:0:8})"

# ── 6. Distribute ──────────────────────────────────────────────────────
for T in "${TARGETS[@]}"; do
  # Brain-core target dirs do not exist yet on first sync — create them.
  mkdir -p "$T"
  echo "→ syncing → $T"
  # Remove ALL files in target to prevent stale files from lingering.
  # This catches files that were removed from the source but still exist
  # in the target (e.g., webhook-guard.js from a prior manual addition).
  rm -f "$T"/*.{js,d.ts,js.map,d.ts.map} 2>/dev/null || true
  rm -f "$T/VERSION" 2>/dev/null || true
  cp -R dist/. "$T/"
  REMOTE_HASH=$(
    find "$T" -maxdepth 1 -type f \( -name "*.js" -o -name "*.d.ts" \) -not -name "*.map" \
    | sort | xargs cat | md5 | awk '{print $1}'
  )
  if [ "$REMOTE_HASH" != "$CONTENT_HASH" ]; then
    echo "FATAL: post-sync hash mismatch at $T"
    echo "  expected: $CONTENT_HASH"
    echo "  got:      $REMOTE_HASH"
    exit 1
  fi
  echo "  ✓ hash matches canonical"
done

echo
echo "✓ sync complete. $PKG_VER ($SHA) deployed to ${#TARGETS[@]} targets."
