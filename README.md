# HubiDash

A real-time dashboard and remote control for a **Hubitat Elevation** hub, built on the Maker API. It runs as one service: an Express + WebSocket backend that also serves the React UI.

- Device status updates live over WebSocket. The server polls the hub and pushes only what changed.
- Controls for switches, dimmers, color bulbs, locks (unlock asks for confirmation) and thermostats.
- Alerts for water leaks, critical battery (<20%), smoke/CO, and unlocked doors.
- Two hub modes: **cloud** (through `cloud.hubitat.com`, works from anywhere) or **local** (direct LAN). Switch between them by changing `HUBITAT_MODE`.
- Login with one password. The session cookie lasts 30 days.

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

The server checks its configuration at startup. If anything is missing it exits with a clear error.

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

If the hub can't be reached, device endpoints return the last known state with `stale: true`.

**WebSocket** (`/ws`): the client sends `{ type: "auth", token }` within 5 s of connecting. The server then sends `auth_ok` and a `snapshot`, followed by `update` messages (only changed devices) and `status` messages. The client can send commands as `{ type: "command", requestId, deviceId, command, value? }` and gets a `commandResult` back.

Every Maker API call, commands included, is an HTTP **GET**. Command responses are read and discarded without JSON parsing, because the hub often returns HTML or an empty body.

## Project layout

```
client/   React 18 + Vite + Tailwind 3 SPA
server/   Express + ws backend (TypeScript, ESM)
  services/hubitat.ts      Maker API client (local/cloud URLs, GET-only commands)
  services/deviceCache.ts  polling, diffing, stale fallback
  services/wsManager.ts    /ws upgrade, token auth, broadcast
```
