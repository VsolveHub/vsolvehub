#!/usr/bin/env bash
# Deploy the Django backend (api, worker, beat behind Caddy) from the current checkout.
#
#   bash scripts/deploy-backend.sh              build, check, migrate (asks for a snapshot), start
#   bash scripts/deploy-backend.sh --no-migrate same, but skip migrations
#
# The image is tagged with the git short SHA and retagged `current`. Each deploy is appended to
# ~/.vsolvehub-deploys, which scripts/rollback-backend.sh reads to find the previous SHA.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=infra/.env.production
COMPOSE=(docker compose -f infra/compose.production.yaml --env-file "$ENV_FILE")
HISTORY="$HOME/.vsolvehub-deploys"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Copy infra/env.production.example and fill it in."; exit 1; }
mode=$(stat -c %a "$ENV_FILE")
[ "$mode" = "600" ] || { echo "$ENV_FILE is mode $mode. Run: chmod 600 $ENV_FILE"; exit 1; }

APP_VERSION=$(git rev-parse --short HEAD)
export APP_VERSION

echo "==> Building vsolvehub-backend:$APP_VERSION"
"${COMPOSE[@]}" build api
docker tag "vsolvehub-backend:$APP_VERSION" vsolvehub-backend:current

echo "==> Starting postgres and redis"
"${COMPOSE[@]}" up -d --wait postgres redis

echo "==> Django production checks (fails here if a required variable is missing)"
"${COMPOSE[@]}" run --rm --no-deps api python manage.py check --deploy

if [ "${1:-}" != "--no-migrate" ]; then
  echo
  echo "STOP: take a Hostinger snapshot before migrating."
  echo "      hPanel -> VPS -> Snapshots & Backups -> Create snapshot, and wait until it finishes."
  read -r -p "Snapshot finished? Type 'yes' to run migrations: " answer
  [ "$answer" = "yes" ] || { echo "Stopped before migrating. Nothing else was changed."; exit 1; }
  "${COMPOSE[@]}" run --rm migrate
fi

echo "==> Starting api, worker, beat (waits for the api health check)"
"${COMPOSE[@]}" up -d --wait --force-recreate api worker beat
"${COMPOSE[@]}" up -d caddy

echo "$(date -u +%FT%TZ) deploy $APP_VERSION" >> "$HISTORY"
"${COMPOSE[@]}" ps

if curl -fsS --max-time 15 https://api.vsolvehub.com/api/v1/health/ready/; then
  echo
  echo "Deployed $APP_VERSION. https://api.vsolvehub.com is healthy."
else
  echo
  echo "Deployed $APP_VERSION and the api container is healthy, but https://api.vsolvehub.com"
  echo "did not answer yet. Check DNS and: ${COMPOSE[*]} logs caddy"
fi
