# How to deploy — LOCAL / on-premise (with optional tunnelling)

The research architecture: everything runs inside the facility. This guide
covers a single always-on machine on the facility LAN (a small server, a
mini-PC, or a laptop for a demo), and then two optional ways to let people
outside the building use that same deployment: a **tunnel** (free, no port
forwarding) or a **VPN** (private, for evaluators and for camera access).

Reference for every variable and command: [deploy.md](./deploy.md)
(§B). Nothing in this guide changes application behaviour — it is the same
build as ONLINE with a different `.env`.

```
                     FACILITY LAN (e.g. 192.168.1.0/24)
 ┌──────────────┐  RTSP  ┌──────────────────────────────────────────────────┐
 │ IP camera(s) │ ─────▶ │ PARADA host                                      │
 └──────────────┘        │  vision (one process per camera)                 │
                         │      └─HTTP──▶ api :4100 ──▶ postgresql :5442    │
 ┌──────────────┐        │                 ▲                                │
 │ phones/Wi-Fi │ ──────────────────────────┘        admin :3000 ◀── browsers│
 └──────────────┘        └──────────────────────────────────────────────────┘
                                   │ optional: tunnel or VPN
                                   ▼
                              evaluators elsewhere
```

## 1. Host prerequisites

- Linux (Ubuntu 22.04/24.04 verified via WSL for the build path), or the
  Windows development setup from
  [run-and-test-locally.md](./run-and-test-locally.md).
- Node.js 20+, npm 9+, Python 3.11, PostgreSQL 16+ — or Docker for the
  database only (`docker-compose.yml`).
- A **static LAN address** for the host (DHCP reservation on the router).
  Phones and cameras must find it at the same address every day.
- Outbound internet once, for `npm ci`, `pip install`, and the EasyOCR
  weights (~94 MB into `~/.EasyOCR/model`).

## 2. Configure

```bash
git clone <repo> parada && cd parada
cp .env.local.example ~/parada-local.env      # reference copy, keep it outside the repo
cp services/api/.env.example services/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp services/vision/.env.example services/vision/.env
```

Fill in (names only here — values never go in git):

| File | Set | Notes |
|---|---|---|
| `services/api/.env` | `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=4100`, `DATABASE_URL`, `JWT_SECRET`, `CAMERA_API_KEY`, `MAIL_TRANSPORT=smtp` + `SMTP_*`, `MAIL_FROM` | Leave `TRUST_PROXY` empty unless §5/§6 applies. `NODE_ENV=development` is acceptable for a pure LAN demo without SMTP (console mail) but disables the production guards — say so in the demo. |
| `apps/admin/.env.local` | `API_BASE_URL=http://127.0.0.1:4100` | Server-only. |
| `services/vision/.env` | `PARADA_API_URL=http://<host LAN IP>:4100` (or `127.0.0.1` on the same host), `CAMERA_API_KEY`, `CAMERA_IDENTIFIER`, `CAMERA_ZONE_ID`, `CAMERA_SOURCE=rtsp`, `VIDEO_SOURCE=rtsp://…` | One copy per camera; exported into the process, not auto-loaded. |
| Mobile build | `EXPO_PUBLIC_API_URL=http://<host LAN IP>:4100` | Baked at build time; see §4. |

Windows Firewall / `ufw`: allow inbound TCP 4100 (API) and 3000 (Admin) on
the LAN profile only.

## 3. Database, build, run

```bash
# PostgreSQL: either the facility server (create db `parada`, role `parada`)
# or the bundled container:
POSTGRES_PASSWORD=<strong> docker compose up -d postgres        # listens on 127.0.0.1:5442

npm ci
npm run build                                                   # all workspaces (mobile = expo export, harmless)
DATABASE_URL="postgresql://parada:<pw>@127.0.0.1:5442/parada?schema=public" npm run migrate:deploy -w @parada/database

# first admin + campus zones/cameras (see deploy.md §4.3 for the cleanup afterwards)
cd packages/database && DATABASE_URL="…" PARADA_SEED_ADMIN_PASSWORD="<strong>" PARADA_SEED_USER_PASSWORD="<strong>" npx ts-node src/seed/index.ts && cd ../..

# run (three long-lived processes)
(cd services/api && node dist/index.js)                         # reads services/api/.env
PORT=3000 npm run start -w @parada/admin                        # reads apps/admin/.env.local
npm run setup -w @parada/vision && (cd services/vision && set -a && . ./.env && set +a && npm run camera -w @parada/vision -- run)
```

Keep them alive with systemd (Linux). Minimal unit for the API — copy the
pattern for Admin and each Vision camera:

```ini
# /etc/systemd/system/parada-api.service
[Unit]
Description=PARADA API
After=network-online.target postgresql.service
[Service]
User=parada
WorkingDirectory=/opt/parada/services/api
EnvironmentFile=/opt/parada/services/api/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=15
[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/parada-vision@.service   (instance name = camera identifier)
[Service]
User=parada
WorkingDirectory=/opt/parada/services/vision
EnvironmentFile=/opt/parada/services/vision/%i.env
ExecStart=/opt/parada/services/vision/.venv/bin/python -m app.camera.cli run
Restart=always
RestartSec=5
```

`systemctl enable --now parada-api parada-admin parada-vision@CAM-A01`;
logs with `journalctl -u parada-api -f`.

Windows alternative: `npm run dev` (`scripts/run-dev.cjs`) starts DB, API
and Admin for a demo session; it is a development runner, not a service.

## 4. Mobile on the LAN

```bash
cd apps/mobile
printf 'EXPO_PUBLIC_API_URL=http://<host LAN IP>:4100\n' > .env
npx eas build --platform android --profile preview          # APK, or:
npx expo run:android --variant release                       # local Android SDK
```

Phones must be on the facility Wi-Fi. Android release builds refuse
cleartext `http://` by default; for a LAN-only demo build either use the
`development`/`preview` profile through Expo Go/`expo start` (development
only), front the API with HTTPS (§5), or add a network-security config for
the single LAN host as an explicit, documented exception — do not disable
cleartext protection globally.

## 5. Optional: tunnel the LAN deployment to the Internet

A tunnel gives the LAN deployment public HTTPS URLs without opening router
ports. The tunnel terminates TLS, so the API now sits behind exactly one
proxy hop: set **`TRUST_PROXY=1`** in `services/api/.env` and restart the
API, otherwise every remote user shares one login rate-limit budget. Admin's
`Secure` cookie works because the browser sees `https://`.

Free options at the time of writing (check each provider's current terms):

| Tool | What you get | Notes |
|---|---|---|
| **Cloudflare Tunnel** (`cloudflared`) | Stable hostnames on a domain you control (`api.yourdomain`, `admin.yourdomain`), free plan | Needs a domain on Cloudflare DNS (a cheap domain, or a free subdomain service pointed at Cloudflare). Supports SSE; the 25 s API heartbeat keeps streams alive. |
| **ngrok** | One free static domain per account, random domains otherwise | Two tunnels (API + Admin) need two hostnames; the free static domain covers one — use it for the API (the mobile build bakes the URL) and a random one for Admin. |
| **Tailscale Funnel / Serve** | HTTPS on a `*.ts.net` name | Funnel = public; Serve = tailnet-only (see §6). |

Cloudflare Tunnel example:

```bash
cloudflared tunnel login
cloudflared tunnel create parada
# ~/.cloudflared/config.yml
#   tunnel: <id>
#   credentials-file: /home/parada/.cloudflared/<id>.json
#   ingress:
#     - hostname: api.yourdomain.tld   service: http://127.0.0.1:4100
#     - hostname: admin.yourdomain.tld service: http://127.0.0.1:3000
#     - service: http_status:404
cloudflared tunnel route dns parada api.yourdomain.tld
cloudflared tunnel route dns parada admin.yourdomain.tld
cloudflared tunnel run parada           # or: cloudflared service install
```

Then rebuild the mobile app with `EXPO_PUBLIC_API_URL=https://api.yourdomain.tld`.
Cameras, Vision, PostgreSQL and RTSP remain LAN-only — a tunnel exposes
only the two HTTP ports you list.

## 6. Optional: VPN instead of a public tunnel

For evaluators who may join a private network, or to let an off-site Vision
host reach the cameras (hybrid option B in deploy.md §A.4):

- **Tailscale / WireGuard** on the PARADA host (and on the evaluator's
  device). Everyone reaches `http://<tailnet address>:4100` and `:3000`
  privately; `tailscale serve` adds HTTPS on the tailnet without exposing
  anything publicly. Advertise the camera subnet
  (`tailscale up --advertise-routes=192.168.1.0/24`) only if Vision must run
  off-site.
- Still never publish RTSP itself; a VPN keeps it private by construction.

## 7. Verify (LOCAL smoke set)

- `curl http://<host LAN IP>:4100/health` → `{"data":{"status":"ok","database":"connected"}}`
- Admin login on a LAN browser → dashboard; `document.cookie` shows nothing.
- Mobile: register → verification mail arrives (SMTP) → login → Primary
  Vehicle → recommendation → reserve → cancel.
- Vision: `npm run camera -w @parada/vision -- test` prints
  `Vision pipeline OK`; `run` logs `event … outcome=ok` and Admin → Cameras
  shows it; Admin → Zones occupancy moves without reload.
- Then the full list in deploy.md §10.
