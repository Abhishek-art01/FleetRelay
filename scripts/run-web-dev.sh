#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v bw >/dev/null 2>&1; then
  echo "Bitwarden CLI (bw) is required." >&2
  exit 1
fi

if ! command -v dotenvx >/dev/null 2>&1; then
  echo "dotenvx is required." >&2
  exit 1
fi

if [[ "$(bw status | jq -r '.status')" == "locked" ]]; then
  echo "Unlock Bitwarden first: export BW_SESSION=\$(bw unlock --raw)" >&2
  exit 1
fi

export DOTENV_PRIVATE_KEY
DOTENV_PRIVATE_KEY="$(
  bw get item 'FLEET RELAY DOTENV_PRIVATE_KEY' --session "${BW_SESSION:?BW_SESSION is not set}" |
    jq -er '.notes'
)"

exec dotenvx run -f .env --no-armor --no-native --no-1password --no-bitwarden -- \
  pnpm --filter @workspace/vehicle-message-dispatcher dev
