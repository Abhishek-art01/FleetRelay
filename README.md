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

## Duty sheet format

Import an `.xlsx`, `.xls`, or `.csv` file with one row per driver. The sheet
must include these columns:

- `Vehicle Number`
- `Driver Name`
- `Mobile Number`
- `Pending Duty Count`

Column names are matched case-insensitively and spaces/punctuation are ignored.
Rows missing any required value are rejected so only complete rows can be sent
through WhatsApp.

WhatsApp server credentials are loaded only by the API from the encrypted
`.env` file:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Never place the access token in frontend code, Excel files, or GitHub. Generate
a new Meta access token if one has been exposed.