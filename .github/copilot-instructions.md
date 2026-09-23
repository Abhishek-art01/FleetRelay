# Copilot instructions for FleetRelay

## Workspace layout

This repo is a pnpm monorepo with a few small apps and shared libraries:

- `artifacts/api-server`: Express API for health checks and WhatsApp send/webhook endpoints.
- `artifacts/mockup-sandbox`: Vite + React mockup/sandbox app.
- `artifacts/message-dispatcher`: Vite + React main dispatcher UI for importing duty sheets and sending WhatsApp messages.
- `lib/*`: shared workspace packages such as generated API clients (`api-zod`, `api-client-react`), API spec, and Drizzle/Postgres DB schema.
- `supabase/`: Supabase configuration and DB artifacts.
- `scripts/`: bootstrap helpers that load secrets from Bitwarden and `.env`.
- `docker/`: container build files used by the Docker Compose stack.

The main product flow is: import an Excel/CSV duty sheet in the dispatcher UI, validate the required columns, personalize a WhatsApp message per driver, send via the Express API, and poll delivery status back to the UI.

## Build, typecheck, and validation commands

Use pnpm; the repo intentionally rejects npm/yarn in the root `preinstall` script.

Common commands from the repo root:

- Install dependencies:
  - `pnpm install`
- Full project build:
  - `pnpm build`
- Root typecheck:
  - `pnpm typecheck`
- Run typecheck for one package:
  - `pnpm --filter @workspace/api-server typecheck`
  - `pnpm --filter @workspace/mockup-sandbox typecheck`
  - `pnpm --filter @workspace/message-dispatcher typecheck`
  - `pnpm --filter @workspace/db typecheck` (if a package has a typecheck script; `@workspace/db` does not, so prefer `pnpm --dir lib/db exec tsc --noEmit` only if needed)
- Build one app/package:
  - `pnpm --filter @workspace/api-server build`
  - `pnpm --filter @workspace/mockup-sandbox build`
  - `pnpm --filter @workspace/message-dispatcher build`

There are no dedicated test or lint scripts in this repo (`test`, `lint`, `eslint`, `vitest`, `jest`, etc. are not configured). The effective validation path is TypeScript checks and app builds, not a separate unit-test suite.

Runtime/dev commands:

- Start the full dockerized stack:
  - `export BW_SESSION="$(bw unlock --raw)"`
  - `./scripts/run-project.sh` (repo scripts load Bitwarden-backed env secrets via `dotenvx`)
  - or: `docker compose up --build`
- Local frontend dev:
  - `export BW_SESSION="$(bw unlock --raw)"`
  - `./scripts/run-web-dev.sh`
- Local API server dev:
  - `pnpm --filter @workspace/api-server dev`

## High-level architecture

The code is split intentionally around a few responsibilities:

- `artifacts/api-server` is the backend boundary. It creates the Express app, wires routing, logs with `pino`, applies `cors` and JSON parsing, and serves `/api/*` routes. The WhatsApp functionality is owned here, including signature verification, send calls to Meta's Graph API, webhook processing, and in-memory status tracking for message delivery states.
- `artifacts/message-dispatcher` is the user-facing business app. It imports spreadsheet rows, normalizes column names, validates required fields, generates personalized messages from the template, sends to the API, and polls WhatsApp status updates.
- `artifacts/mockup-sandbox` is a secondary Vite app, likely a design/mockup surface rather than the canonical production UI.
- `lib/api-spec` + generated client packages define the API contract used by both server and clients. The generated `@workspace/api-zod` and `@workspace/api-client-react` packages should be treated as contract artifacts: when the API shape changes, update the spec/generation step rather than hand-editing generated outputs.
- `lib/db` is the database layer. It is set up for Drizzle + PostgreSQL schema work and is intentionally minimal today (`src/schema/index.ts` is a placeholder export file).
- `supabase/` and environment variables power the app's external services. Secrets are expected to come from Bitwarden and `.env`, not from committed source files.

## Key conventions and repo-specific patterns

- Use pnpm workspaces and `@workspace/*` package names; do not switch to npm or yarn in this repo.
- The repo uses ESM (`"type": "module"`) across packages.
- Secret material is intentionally externalized. The README warns that WhatsApp access tokens must never be placed in frontend code, Excel files, or GitHub; the repo expects Bitwarden + `dotenvx` to supply runtime creds.
- Duty-sheet imports are strict: required columns are matched case-insensitively and punctuation is normalized. Rows with missing/invalid values are rejected before sending. Preserve that validation behavior when editing the importer.
- When modifying the WhatsApp API contract or server/client interfaces, update the generated client code intentionally; keep the server and client validation layers aligned.
- The project depends on Docker and Vite for local runtime, but the repo does not include a test runner or lint configuration; prefer compile-time correctness and package builds as the validation baseline.
- `pnpm-workspace.yaml` contains a package minimum release age guard and platform overrides; avoid introducing install workflows that bypass the workspace's secure package policy.

## Working in this repo

Prefer editing the smallest relevant workspace package and keep the frontend/backend contract in sync. The app is structured as a monorepo, not as a single app, so avoid assuming the frontend and API are a single package or a single build target.
