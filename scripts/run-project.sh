#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if ! command -v bw >/dev/null 2>&1; then
  echo "Bitwarden CLI (bw) is required to load the encrypted .env key." >&2
  exit 1
fi

if ! command -v dotenvx >/dev/null 2>&1; then
  echo "dotenvx is required to decrypt .env at runtime." >&2
  exit 1
fi


local_value() {
  dotenvx get "$1" -f .env.local --no-armor --no-native --no-1password --no-bitwarden
}

if [[ -f .env.local ]]; then
  : "${BW_CLIENTID:=$(local_value BW_CLIENTID)}"
  : "${BW_CLIENTSECRET:=$(local_value BW_CLIENTSECRET)}"
  : "${BW_MASTER_PASSWORD:=$(local_value BW_MASTER_PASSWORD)}"
  export BW_CLIENTID BW_CLIENTSECRET BW_MASTER_PASSWORD
fi

case "${1:-}" in
  down|stop|logs|ps)
    exec docker compose "$@"
    ;;
esac

bitwarden_status="$(bw status | jq -r '.status')"

if [[ "$bitwarden_status" == "unauthenticated" && -n "${BW_CLIENTID:-}" && -n "${BW_CLIENTSECRET:-}" ]]; then
  bw login --apikey >/dev/null
  bitwarden_status="locked"
fi

if [[ "$bitwarden_status" != "unlocked" ]]; then
  if [[ -z "${BW_MASTER_PASSWORD:-}" ]]; then
    echo "Bitwarden is locked and BW_MASTER_PASSWORD is not configured in .env.local." >&2
    exit 1
  fi
  export BW_SESSION
  BW_SESSION="$(bw unlock --passwordenv BW_MASTER_PASSWORD --raw)"
fi

export DOTENV_PRIVATE_KEY
DOTENV_PRIVATE_KEY="$(
  bw get item 'FLEET RELAY DOTENV_PRIVATE_KEY' --session "${BW_SESSION:?BW_SESSION is not set}" |
    jq -er '.notes'
)"

dotenv_value() {
  dotenvx get "$1" -f .env --no-armor --no-native --no-1password --no-bitwarden
}

for variable in \
  PORT BASE_PATH DATABASE_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD \
  SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY SUPABASE_JWKS_URL \
  VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY \
  WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN WHATSAPP_APP_SECRET \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN
do
  value="$(dotenv_value "$variable")"
  if [[ -z "$value" || "$value" == encrypted:* ]]; then
    echo "Could not decrypt $variable from .env." >&2
    exit 1
  fi
  export "$variable=$value"
done

docker compose build --no-cache
exec docker compose up "$@"
