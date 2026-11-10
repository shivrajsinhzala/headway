#!/usr/bin/env bash
# Builds Headway, ships it as a new release and swaps it live in one step. Visitors never see a
# half-copied site. If the live checks fail, the previous release goes back automatically.
#
#   deploy/deploy.sh            build, upload, go live
#   deploy/deploy.sh rollback   back to the previous release
set -euo pipefail

cd "$(dirname "$0")/.."
SSH_HOST="${DEPLOY_SSH:-stopwatch}"
BASE="${DEPLOY_PATH:-/var/www/headway}"
CHECK_URL="${DEPLOY_CHECK_URL:-http://127.0.0.1}"
HOST_HEADER=headway.shivrajsinh.in
export PUBLIC_GA_ID="${PUBLIC_GA_ID:-G-L1NMK5XV5F}"
# Checked after the swap: a page of each type, and what Google and riders' browsers fetch.
CHECKS="/ /au/brisbane /au/brisbane/route-272 /au/vline-coaches/from/cranbourne/to/phillip-island /us/phoenix/stop/13785 /sitemap.xml /robots.txt /search.json /data/au/brisbane/route-272.json"

check_live() {
  # shellcheck disable=SC2029
  ssh "$SSH_HOST" "for p in $CHECKS; do c=\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: $HOST_HEADER' \"$CHECK_URL\$p\"); [ \"\$c\" = 200 ] || { echo \"FAILED \$c \$p\"; exit 1; }; done"
}

if [ "${1:-}" = rollback ]; then
  ssh "$SSH_HOST" "set -e; cd $BASE/releases; now=\$(basename \"\$(readlink $BASE/current)\"); prev=\$(ls -1 | grep -v \"^\$now\$\" | sort | tail -1); [ -n \"\$prev\" ] || { echo 'no previous release'; exit 1; }; ln -sfn $BASE/releases/\$prev $BASE/current.new; mv -T $BASE/current.new $BASE/current; echo \"live: \$prev (was \$now)\""
  exit 0
fi

npm run build

# A .gz beside every text file, for nginx's gzip_static. A release is about 10 MB, so each is a full copy.
find dist -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.json' -o -name '*.xml' -o -name '*.svg' -o -name '*.txt' \) -exec gzip -9 -k -n -f {} +

STAMP="$(date -u +%Y%m%dT%H%M%S)"
NEW="$BASE/releases/$STAMP"
ssh "$SSH_HOST" "mkdir -p $BASE/releases"
rsync -az --delete dist/ "$SSH_HOST:$NEW/"

# Cloudflare keeps HTML for up to a day, so cached pages still ask for the last release's hashed
# scripts. Keep them in the new release, or those pages lose their next-bus and stop picker.
ssh "$SSH_HOST" "if [ -d $BASE/current/_astro ]; then cp -aln $BASE/current/_astro/. $NEW/_astro/ 2>/dev/null || true; fi"

PREVIOUS="$(ssh "$SSH_HOST" "readlink $BASE/current || true")"
ssh "$SSH_HOST" "ln -sfn $NEW $BASE/current.new && mv -T $BASE/current.new $BASE/current"

# The first upload happens before nginx knows the site, so there is nothing to check yet (deploy/README.md).
if [ "${DEPLOY_SKIP_CHECKS:-}" != 1 ] && ! check_live; then
  echo "Live checks failed." >&2
  if [ -n "$PREVIOUS" ]; then
    # The failed release goes too, or a later rollback would land on it.
    ssh "$SSH_HOST" "ln -sfn $PREVIOUS $BASE/current.new && mv -T $BASE/current.new $BASE/current && rm -rf $NEW"
    echo "Went back to $PREVIOUS" >&2
  fi
  exit 1
fi

# Keep the live release and the one before it, for rollback.
ssh "$SSH_HOST" "cd $BASE/releases && ls -1 | sort | head -n -2 | xargs -r rm -rf"
echo "live: $STAMP"
