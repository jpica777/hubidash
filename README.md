# HubiDash

A full-stack web dashboard for Hubitat Elevation smart home hubs. Connects via the Maker API, shows real-time device status, and lets you control every device from any browser.

**Stack:** React 18 + Vite + TypeScript + Tailwind CSS · Node.js 20 + Express + WebSockets · Docker

---

## Quick start

### 1. Prerequisites

- Node.js 20+
- A Hubitat Elevation hub with the **Maker API** app installed
  - In Maker API settings, enable **"Allow Access via Cloud"** if using cloud mode
  - Note your **App ID** and **Access Token** from the Maker API page

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|---|---|
| `HUBITAT_MODE` | `local` or `cloud` |
| `HUBITAT_HOST` | Hub LAN IP, e.g. `http://192.168.1.42` *(local mode)* |
| `HUBITAT_APP_ID` | Maker API app ID |
| `HUBITAT_ACCESS_TOKEN` | Maker API local token *(local mode)* |
| `HUBITAT_CLOUD_TOKEN` | Cloud API token *(cloud mode)* |
| `HUBITAT_HUB_ID` | Hub ID shown in cloud Maker API URL *(cloud mode)* |
| `AUTH_PASSWORD` | Dashboard login password |
| `SESSION_SECRET` | Random secret for session signing (use `openssl rand -hex 32`) |

### 3. Run in development

```bash
npm install
npm run dev        # starts Vite (port 5173) + Express (port 3001) concurrently
```

Open `http://localhost:5173`.

### 4. Run with Docker (production)

```bash
docker compose up --build -d
```

Open `http://localhost:3001`.

---

## Deployment

### Railway (cloud, free tier)

1. Push this repo to GitHub.
2. Create a new Railway project → **Deploy from GitHub repo**.
3. Add all environment variables from `.env` in the Railway dashboard.
4. Set `HUBITAT_MODE=cloud` and fill in the cloud variables.
5. Railway sets `PORT` automatically — leave it unset in your Railway env vars.

### UGREEN NAS / self-hosted with Cloudflare Tunnel

1. Copy the project to your NAS.
2. Create `.env` with `HUBITAT_MODE=local` and your hub's LAN IP.
3. Run `docker compose up -d`.
4. In **Cloudflare Zero Trust → Tunnels**, point a subdomain to `http://localhost:3001`.

---

## Architecture

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│  React SPA  │◄─WSS─►│  Node.js Backend │◄─────►│ Hubitat Hub  │
│  (Vite)     │       │  (Express + ws)  │       │ (LAN or API) │
└─────────────┘       └──────────────────┘       └──────────────┘
```

- Backend polls the Maker API every **5 s** (local) or **8 s** (cloud), diffs device state, and pushes only changes over WebSocket.
- Optimistic UI updates apply immediately; the next WS push confirms or reverts.
- Devices are cached in memory; if the hub is unreachable the last-known state is returned with `stale: true`.

---

## Supported device types

| Category | Capabilities detected |
|---|---|
| Lights | Switch, SwitchLevel (dimmer), ColorControl |
| Sensors | WaterSensor, MotionSensor, ContactSensor, TemperatureMeasurement, RelativeHumidityMeasurement |
| Locks | Lock |
| Climate | Thermostat |

Unknown device types fall back to "Other" with a generic read-only display.

---

## Security notes

- The dashboard is protected by a single bcrypt-hashed password stored in `.env`.
- Sessions are signed with `SESSION_SECRET` and stored server-side (MemoryStore — fine for single-user use).
- WebSocket connections require a short-lived token issued at login.
- Rate limited to 100 requests/min per IP on all API routes.
- In production (`NODE_ENV=production`) the session cookie is marked `Secure`. Ensure you serve HubiDash behind HTTPS (Railway and Cloudflare Tunnel both handle TLS termination).
