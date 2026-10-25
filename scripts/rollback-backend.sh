#!/usr/bin/env bash
# Put api, worker and beat back on the previous deployed image. Never runs migrations and never
# touches the database.
#
#   bash scripts/rollback-backend.sh          roll back to the previous deployed SHA
#   bash scripts/rollback-backend.sh <sha>    roll back to a specific image tag
#
# If the release you are leaving ran migrations, older code may not match the schema. Restore
# the Hostinger snapshot taken before that migration instead.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f infra/compose.production.yaml --env-file infra/.env.production)
HISTORY="$HOME/.vsolvehub-deploys"

running=$(docker inspect --format '{{.Config.Image}}' vsolvehub-api-1 2>/dev/null | sed 's/.*://' || true)
previous=$(awk '$2 == "deploy" { print $3 }' "$HISTORY" 2>/dev/null | grep -vx "${running:-none}" | tail -n 1 || true)
TAG=${1:-$previous}

if [ -z "$TAG" ]; then
  echo "No previous deploy recorded in $HISTORY. Images on this server:"
  docker image ls vsolvehub-backend --format '  {{.Tag}}\t{{.CreatedSince}}'
  echo "Usage: bash scripts/rollback-backend.sh <sha>"
  exit 1
fi
docker image inspect "vsolvehub-backend:$TAG" > /dev/null 2>&1 \
  || { echo "No image vsolvehub-backend:$TAG on this server."; exit 1; }

echo "Running: ${running:-unknown}. Rolling api, worker and beat back to: $TAG (no migrations)."
read -r -p "Type 'yes' to continue: " answer
[ "$answer" = "yes" ] || exit 1

docker tag "vsolvehub-backend:$TAG" vsolvehub-backend:current
APP_VERSION=$TAG "${COMPOSE[@]}" up -d --wait --no-build --force-recreate api worker beat

echo "$(date -u +%FT%TZ) rollback $TAG" >> "$HISTORY"
"${COMPOSE[@]}" ps
echo "Now running $TAG."
