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

case "${1:-}" in
  down|stop|logs|ps)
    exec docker compose "$@"
    ;;
esac

if [[ "$(bw status | jq -r '.status')" == "locked" ]]; then
  echo "Unlock Bitwarden first: export BW_SESSION=\$(bw unlock --raw)" >&2
  exit 1
fi

export DOTENV_PRIVATE_KEY
DOTENV_PRIVATE_KEY="$(
  bw get item 'FLEET RELAY DOTENV_PRIVATE_KEY' --session "${BW_SESSION:?BW_SESSION is not set}" |
    jq -er '.notes'
)"

exec dotenvx run -f .env --no-armor --no-native --no-1password --no-bitwarden -- docker compose up --build "$@"
