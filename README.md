# FleetRelay

## Run with Docker

The project runs as three containers:

- API: <http://localhost:3000>
- Mockup Sandbox: <http://localhost:5173>
- Web App: <http://localhost:5174>

Docker names: `fleetrelay-api`, `fleetrelay-mockup`, and `fleetrelay-web`.

The encrypted `.env` key is loaded from Bitwarden at runtime. No `.env.keys`
file is required.

```bash
export BW_SESSION="$(bw unlock --raw)"
./scripts/run-project.sh
```

Stop the stack with `Ctrl+C`. To remove the containers and network:

```bash
docker compose down
```

For local Vite development with Supabase variables loaded from Bitwarden:

```bash
export BW_SESSION="$(bw unlock --raw)"
./scripts/run-web-dev.sh
```