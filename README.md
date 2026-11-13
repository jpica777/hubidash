# HubiDash

A real-time dashboard and remote control for a **Hubitat Elevation** hub, built on the Maker API. It runs as one service: an Express + WebSocket backend that also serves the React UI.

- Device status updates live over WebSocket. The server polls the hub and pushes only what changed.
- Controls for switches, dimmers, color bulbs, locks (unlock asks for confirmation) and thermostats.
- Alerts for water leaks, critical battery (<20%), smoke/CO, and unlocked doors.
- Two hub modes: **cloud** (through `cloud.hubitat.com`, works from anywhere) or **local** (direct LAN). Switch between them by changing `HUBITAT_MODE`.
- Login with one password. The session cookie lasts 30 days.
- **Automations:** simple if/then rules that HubiDash runs itself. They trigger on a device state, a cron schedule or a time of day, can have optional "only if" conditions, and send commands through the Maker API.
- **Rule Machine** (optional): list your hub's Rule Machine rules and run, pause or resume them.

```
React SPA ◄──WSS──► Express + ws ──► Hubitat hub (LAN)          [local]
                                 └─► cloud.hubitat.com/api      [cloud]
```

## Hubitat setup

1. On the hub, go to **Apps → Add Built-In App → Maker API**.
2. Pick the devices to expose, then click **Done**.
3. Open the Maker API app and note:
   - the **app ID**: the number in `/apps/api/<ID>/...`
   - **Local mode:** the access token and the hub's LAN IP
   - **Cloud mode:** from a cloud URL `https://cloud.hubitat.com/api/<HUB_ID>/apps/<ID>/devices?access_token=<TOKEN>`, the hub UUID and the token

## Configuration

Copy `.env.example` to `.env` and fill it in. The file documents every variable.

| Variable | Mode | Purpose |
| --- | --- | --- |
| `HUBITAT_MODE` | both | `cloud` (default) or `local` |
| `HUBITAT_APP_ID` | both | Maker API app ID |
| `HUBITAT_HOST` | local | Hub address, e.g. `http://192.168.1.50` |
| `HUBITAT_ACCESS_TOKEN` | local | Maker API local token |
| `HUBITAT_HUB_ID` | cloud | Hub UUID from the cloud URL |
| `HUBITAT_CLOUD_TOKEN` | cloud | Maker API cloud token |
| `AUTH_PASSWORD` | both | Dashboard password, bcrypt-hashed at startup |
| `SESSION_SECRET` | both | Cookie signing secret (`openssl rand -hex 32`) |
| `PORT` | both | HTTP port; default `3001`, Railway sets its own |
| `RULE_MACHINE_URL` | optional | Rule Machine endpoint base, e.g. `https://cloud.hubitat.com/api/<hubId>/apps/<rmAppId>` |
| `RULE_MACHINE_TOKEN` | optional | Rule Machine's own access token (not the Maker API token) |
| `TIMEZONE` | optional | IANA timezone for schedules, e.g. `America/New_York`; defaults to the server's (UTC on Railway) |
| `LATITUDE` / `LONGITUDE` | optional | Hub location; enables "only if it's dark/light" conditions |
| `DATA_DIR` | optional | Where `automations.json` lives; default `data/` (`/app/data` in Docker) |

The server checks its configuration at startup. If anything is missing it exits with a clear error. The Rule Machine variables are optional: when they aren't set, the Rules tab is hidden.

## Automations

Open the **Automations** tab and press **+**. Each automation has three parts:

- **When:** a device attribute changes to a value (e.g. *Basement Leak → water: wet*), a cron schedule (presets for hourly, daily or weekdays, or a custom expression), or a time of day on chosen weekdays.
- **Only if** (optional, all must be true): a device attribute is, is not, is above, or is below a value; the time is after or before HH:MM; or it is dark or light outside (needs `LATITUDE`/`LONGITUDE`).
- **Then:** an ordered list of device commands and waits. Reorder them by dragging, or with the arrows on mobile.

Behaviour to know about:

- **Command path:** actions use the same path as the dashboard's own controls, so every command is a GET to the Maker API. If one action fails, it is logged and the remaining actions still run.
- **Repeat protection:** an automation won't re-trigger within 5 s of finishing, so its own actions can't loop it.
- **Background polling:** while at least one device-triggered automation is enabled, the server keeps polling the hub even with no browser open (every 8 s in cloud mode, 5 s in local).
- **Test:** runs the actions immediately and skips conditions. This works in the editor before you save, too.
- **Run log:** the last 100 runs are kept in memory and shown on each card. Live toasts appear in any open dashboard.

**Persistence:** automations are saved to `data/automations.json` using atomic writes.
- **docker compose:** it mounts the `hubidash-data` volume at `/app/data`.
- **Railway:** without a volume, automations are lost on every redeploy. To keep them, add a volume mounted at `/app/data` and set the variable `RAILWAY_RUN_UID=0`; Railway volumes are owned by root, and the container runs as a non-root user.

## Rule Machine

Rule Machine has its own endpoint and token, separate from Maker API. Set `RULE_MACHINE_URL` (the base URL up to and including the Rule Machine app ID) and `RULE_MACHINE_TOKEN`. If you paste a full endpoint URL that ends in `/trigger?access_token=…`, the extra part is stripped automatically.

The Rules tab lists rules from `getRuleList` and calls these endpoints:
- `trigger/runRuleAct=<id>`: Run
- `trigger/runRule=<id>`: Evaluate
- `trigger/pauseRule=<id>`: Pause
- `trigger/resumeRule=<id>`: Resume

A rule's paused state comes from the "(Paused)" marker Hubitat adds to paused rule names.

## Development

Requires Node 20.19+.

```bash
npm install
cp .env.example .env    # then fill it in

npm run dev:server      # API + WebSocket on :3001 (auto-restarts on changes)
npm run dev:client      # Vite on :5173, proxies /api and /ws to :3001
```

Open http://localhost:5173.

```bash
npm run build           # builds client/dist and server/dist
npm start               # serves everything from :3001
npm run typecheck
```

## Deploy: Railway

Railway builds from the `Dockerfile` and runs a single service.

1. Connect the GitHub repo. Every push to `main` deploys.
2. Set these service variables: `HUBITAT_MODE=cloud`, `HUBITAT_HUB_ID`, `HUBITAT_APP_ID`, `HUBITAT_CLOUD_TOKEN`, `AUTH_PASSWORD`, `SESSION_SECRET`.
3. Under **Networking**, generate a domain with target port **8080**. Railway sets `PORT=8080`, and the server reads it.

Railway provides HTTPS automatically. The app sets `trust proxy`, so rate limiting and secure cookies work behind Railway's proxy.

## Deploy: Docker / NAS (e.g. UGREEN)

```bash
cp .env.example .env    # set HUBITAT_MODE=local plus the local variables
docker compose up -d --build
```

The dashboard is then at `http://<nas-ip>:3001`. The container runs as a non-root user and has a health check on `/api/health`.

To move from Railway to the NAS, set `HUBITAT_MODE=local`, `HUBITAT_HOST` and `HUBITAT_ACCESS_TOKEN`. Nothing else changes. Local mode polls every 5 s instead of 8 s and keeps working without internet access.

For remote access to the NAS, put it behind a reverse proxy with HTTPS (or Tailscale). Session cookies are marked `Secure` automatically when the request arrives over HTTPS.

## API

All routes are under `/api`, rate-limited to 100 requests/min per IP. Login allows 10 failed attempts per 15 minutes.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{ status, mode, uptime }` |
| POST | `/api/login` | – | `{ password }` → session cookie + `{ wsToken, mode }` |
| POST | `/api/logout` | – | Destroys the session and closes its WebSockets |
| GET | `/api/me` | cookie | `{ authenticated, wsToken, mode }` or 401 |
| GET | `/api/devices` | cookie | `{ devices, stale, lastUpdated, mode }` |
| GET | `/api/devices/:id` | cookie | `{ device, stale }` |
| POST | `/api/devices/:id/command` | cookie | `{ command, value? }` |
| GET | `/api/rules/status` | cookie | `{ configured }` |
| GET | `/api/rules` | cookie | `[{ id, name, paused }]`, or `[]` when not configured |
| POST | `/api/rules/:id/run` · `evaluate` · `pause` · `resume` | cookie | Rule Machine actions |
| GET | `/api/automations` | cookie | All automations |
| GET | `/api/automations/:id` | cookie | One automation |
| POST | `/api/automations` | cookie | Create (body without `id` or timestamps) |
| PUT | `/api/automations/:id` | cookie | Update |
| DELETE | `/api/automations/:id` | cookie | Delete |
| POST | `/api/automations/:id/toggle` | cookie | Flip enabled, or pass `{ enabled }` |
| POST | `/api/automations/:id/test` | cookie | Run the actions now; returns the log entry |
| POST | `/api/automations/test` | cookie | Test an unsaved draft |
| GET | `/api/automations/log` | cookie | The last 50 runs, newest first |
| GET | `/api/automations/meta` | cookie | `{ timezone, sunConditionsAvailable }` |

If the hub can't be reached, device endpoints return the last known state with `stale: true`.

**WebSocket** (`/ws`): the client sends `{ type: "auth", token }` within 5 s of connecting. The server then sends `auth_ok` and a `snapshot`, followed by `update` messages (only changed devices), `status` messages, and `automation` messages (one per automation run). The client can send commands as `{ type: "command", requestId, deviceId, command, value? }` and gets a `commandResult` back.

Every Maker API call, commands included, is an HTTP **GET**. Command responses are read and discarded without JSON parsing, because the hub often returns HTML or an empty body.

## Project layout

```
client/   React 18 + Vite + Tailwind 3 SPA
server/   Express + ws backend (TypeScript, ESM)
  services/hubitat.ts      Maker API client (local/cloud URLs, GET-only commands)
  services/deviceCache.ts  polling, diffing, stale fallback
  services/wsManager.ts    /ws upgrade, token auth, broadcast
  services/rules.ts        optional Rule Machine client
  services/automationEngine.ts  triggers, conditions, actions, persistence, run log
  services/automationValidation.ts  input validation for automations
  services/sunTimes.ts     sunrise/sunset maths for dark/light conditions
data/     automations.json (created at runtime, gitignored)
```
