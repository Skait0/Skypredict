#!/bin/bash
# Vercel's "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = SKIP this build, exit 1 = BUILD.
#
# WHY (owner, 14 Oct 2026): the Vercel bill was almost all Build CPU minutes -
# ~340 builds in ten days at ~3 min on a 4-core machine (~$0.05 each), because
# every push builds and re-bakes the board, including pushes that change
# nothing a visitor can see, and every side branch builds a preview.
#
# Fails OPEN: anything this cannot work out builds, so it can never skip a
# change that matters.

# Only main deploys. A preview is made on purpose with `vercel` when wanted.
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  echo "ignore-build: branch '$VERCEL_GIT_COMMIT_REF' is not main - skipping"
  exit 0
fi

# Compare with the last deployed commit. If it is unknown or not in this
# (shallow) clone, build.
PREV="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$PREV" ] || ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "ignore-build: no previous deploy to compare against - building"
  exit 1
fi

# Nothing the build reads changed: tests, docs, notes and tooling only.
if git diff --quiet "$PREV" HEAD -- . \
    ':(exclude)test' ':(exclude)docs' ':(exclude)*.md' \
    ':(exclude).github' ':(exclude).superpowers' \
    ':(exclude)graphify-out' ':(exclude)graphify-src' \
    ':(exclude)public/promo' ':(exclude)data/promo-queue.json' ':(exclude)data/promo-log.json' \
    ':(exclude)scripts/tgwebhook.js' ':(exclude)scripts/ignore-build.sh'; then
  # The bot's menu texts run from the Telegram workflow, and this file only decides builds (22 Oct 2026).
  # Promo cards, clips and the Telegram queue and log (owner, 22 Oct 2026): the site never
  # reads them; posts take them from the repo through jsDelivr (scripts/promodrop.js).
  echo "ignore-build: only tests/docs/notes/promo changed since $PREV - skipping"
  exit 0
fi

echo "ignore-build: site files changed since $PREV - building"
exit 1
