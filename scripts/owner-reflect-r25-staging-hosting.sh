#!/usr/bin/env bash
# OWNER-EXECUTED ONLY: Reflect R2.5 pinned PR #90 Firebase Hosting staging.
# No Grok calls, no production/main checkout, no Firestore Rules or secrets changes.
set -euo pipefail
REPO='TheGor-365/reflect'
BRANCH='feat/reflect-m1-evidence-hypothesis-review-2026-11-14'
SHA='ea22eebe4a929bb351e5314768da5f18a0d5a88d'
BASE="$HOME/reflect-stage78-diary-goals"
TARGET="$HOME/reflect-r25-hosting-${SHA:0:7}"
fail() { echo "STOP R2.5: $*" >&2; exit 1; }
for binary in git node npm firebase; do
  command -v "$binary" >/dev/null 2>&1 || fail "Missing $binary"
done
[[ -e "$BASE/.git" ]] || fail "Missing staging base $BASE (do not deploy from main)"
[[ -f "$BASE/.env.staging.local" ]] || fail "Missing private staging config at $BASE/.env.staging.local"
origin="$(git -C "$BASE" remote get-url origin)"
case "$origin" in
  "https://github.com/$REPO"|"https://github.com/$REPO.git"|"git@github.com:$REPO.git") ;;
  *) fail "Unexpected base GitHub origin" ;;
esac
echo "[R2.5] Base: $BASE"
echo "[R2.5] Node $(node --version) | npm $(npm --version) | Firebase $(firebase --version)"
git -C "$BASE" fetch --no-tags origin "refs/heads/$BRANCH"
actual="$(git -C "$BASE" rev-parse FETCH_HEAD)"
[[ "$actual" == "$SHA" ]] || fail "Branch SHA drifted ($actual), expected $SHA"
if [[ -e "$TARGET" ]]; then
  [[ -e "$TARGET/.git" ]] || fail "Existing target is not a Git worktree"
  [[ "$(git -C "$TARGET" rev-parse HEAD)" == "$SHA" ]] || fail "Existing target HEAD mismatch"
  echo "[R2.5] Reusing verified worktree: $TARGET"
else
  git -C "$BASE" worktree add --detach "$TARGET" "$SHA"
fi
install -m 600 "$BASE/.env.staging.local" "$TARGET/.env.staging.local"
cd "$TARGET"
if grep -q '^VITE_ENABLE_REFLECT_AI_RECOVERY=' .env.staging.local; then
  sed -i 's/^VITE_ENABLE_REFLECT_AI_RECOVERY=.*/VITE_ENABLE_REFLECT_AI_RECOVERY=true/' .env.staging.local
else
  printf '\nVITE_ENABLE_REFLECT_AI_RECOVERY=true\n' >> .env.staging.local
fi
chmod 600 .env.staging.local
export VITE_ENABLE_REFLECT_AI_RECOVERY=true
export REFLECT_STAGING_EXPECTED_SHA="$SHA"
[[ "$(git rev-parse HEAD)" == "$SHA" ]] || fail "Worktree HEAD changed"
npm run qa:staging:preflight
npm ci --no-audit --no-fund
npm test
npm run typecheck
npm run build -- --mode staging
npm run qa:staging:postbuild
node <<'R25_BUNDLE'
const fs = require('node:fs'), path = require('node:path');
const js = fs.readdirSync('dist/assets').filter(x => x.endsWith('.js'))
  .map(x => fs.readFileSync(path.join('dist/assets', x), 'utf8')).join('\n');
for (const marker of ['/v1/ai/attempt-status', 'Возможные объяснения',
  'Оценить гипотезу', 'Что учтено и что ещё нужно проверить']) {
  if (!js.includes(marker)) throw Error('STOP: Missing staging marker: '+marker);
}
console.log('[R2.5 BUNDLE PASS]');
R25_BUNDLE
firebase deploy \
  --config firebase.staging.json \
  --project reflect-ai-staging \
  --only hosting \
  --message "Reflect R2.5 PR90 ${SHA:0:12}"
printf '\n[R2.5 HOSTING DEPLOY COMPLETE]\nSHA=%s\nURL=https://reflect-ai-staging.web.app\n' "$SHA"
