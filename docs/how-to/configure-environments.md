# How to configure environments (every run case)

PARADA is one application. Nothing in the code switches on a "mode": each
process reads its own environment, and the values you put there decide which
case you are running. This page lists which file each process reads, then
gives the values for every supported case.

Never commit a filled-in env file. `.gitignore` ignores every `.env*` file
except the `*.example` templates.

## 1. Which file each process reads

| Process | Reads | Template | Loaded by |
|---|---|---|---|
| API (`services/api`) | `services/api/.env`, then the process environment (process environment wins) | [`services/api/.env.example`](../../services/api/.env.example) | `dotenv`, relative to the working directory, so start the API from `services/api` (the npm scripts do) |
| Admin (`apps/admin`) | `apps/admin/.env.local` (or `.env`), then the process environment | [`apps/admin/.env.example`](../../apps/admin/.env.example) | Next.js |
| Mobile (`apps/mobile`) | `apps/mobile/.env` (`EXPO_PUBLIC_API_URL`) and `apps/mobile/.env.local` (`REACT_NATIVE_PACKAGER_HOSTNAME`) | [`apps/mobile/.env.example`](../../apps/mobile/.env.example) | Expo CLI, when it bundles or builds. The value is baked into the app |
| Vision (`services/vision`) | **the process environment only** | [`services/vision/.env.example`](../../services/vision/.env.example) | Nothing. Export the file yourself (section 2) |
| Database CLI and seed (`packages/database`) | `packages/database/.env` | [`packages/database/.env.example`](../../packages/database/.env.example) | Prisma CLI and the seed's `dotenv`. The `db:*`, `seed` and `test` npm scripts set `DATABASE_URL` themselves (embedded database), so the file only matters for `migrate:dev`, `migrate:deploy` and the seed passwords |
| `docker-compose.yml` (local PostgreSQL container) | root `.env` | [`.env.example`](../../.env.example) | Docker Compose variable substitution |
| `docker-compose.online.yml` (ONLINE stack) | the file passed with `--env-file` | [`.env.online.example`](../../.env.online.example) | Docker Compose |
| Reference sheets | not loaded by anything | [`.env.local.example`](../../.env.local.example), [`.env.online.example`](../../.env.online.example) | Copy each section into the file the table above names |

No process reads the root `.env` except Docker Compose. Copying it does not
configure the API, Admin, Mobile or Vision.

## 2. Exporting the Vision environment

Vision has no dotenv loader (`services/vision/app/config.py` reads
`os.environ`). Copy the template, fill it in, then export it into the shell
that starts the camera runtime.

bash, WSL, macOS, Linux:

```bash
cd services/vision
set -a; . ./.env; set +a
npm run camera -- run
```

From WSL on a Windows checkout (`core.autocrlf=true`), the file has CRLF line
endings and every value would end in `\r`. Strip them while loading:
`set -a; . <(tr -d '\r' < .env); set +a`. (Git Bash ignores the `\r` itself.)

Windows PowerShell (for a file copied from `services/vision/.env.example`,
which has no inline comments):

```powershell
cd services\vision
Get-Content .env | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
  ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$($k.Trim())" $v.Trim().Trim('"') }
npm run camera -- run
```

In production use a systemd `EnvironmentFile=` or the container environment
instead (see [deploy.md](deploy.md) §7).

## 3. The cases

### 3.1 Local development, one PC (simulator or emulator)

The default developer setup. Embedded PostgreSQL, console mail, no camera key.

```bash
cp services/api/.env.example services/api/.env      # then set JWT_SECRET
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
npm run db:prepare
PARADA_SEED_ADMIN_PASSWORD=... PARADA_SEED_USER_PASSWORD=... npm run seed -w @parada/database
npm run dev
```

| Process | Value |
|---|---|
| API | Template defaults. `DATABASE_URL` already points at the embedded database (`127.0.0.1:5442`). Generate `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. `MAIL_TRANSPORT=console` prints verification codes to the API console |
| Admin | `API_BASE_URL=http://127.0.0.1:4100` |
| Mobile | iOS Simulator: `http://localhost:4100`. Android Emulator: `http://10.0.2.2:4100`. **Note:** `npm run dev` rewrites this value to your LAN address before Expo starts (next case). A simulator or emulator can also reach the LAN address |
| Vision | Optional. `PARADA_API_URL=http://127.0.0.1:4100`, `CAMERA_SOURCE=file` with the fixture clip. Leave `CAMERA_API_KEY` empty only while the API's key is empty too |

Use `127.0.0.1`, not `localhost`, for server-to-server URLs on Windows.
`localhost` resolves to `::1` first, the API binds IPv4, and every fresh
connection from Python waits about 2 s before falling back
([phase14-evaluation.md](../vision/phase14-evaluation.md)).

### 3.2 Local development with a physical phone (same Wi-Fi)

Same as 3.1, plus the phone must reach the PC.

- The root `npm run dev`, and `npm run dev`, `dev:lan` or `start` inside
  `apps/mobile`, first run `apps/mobile/scripts/set-lan-ip.js`. It detects the PC's LAN
  address, writes `EXPO_PUBLIC_API_URL=http://<LAN-IP>:<port>` into
  `apps/mobile/.env` and `REACT_NATIVE_PACKAGER_HOSTNAME=<LAN-IP>` into
  `apps/mobile/.env.local` (the port is kept from the existing value, default
  4100). It prefers a Wi-Fi adapter and skips VirtualBox, VMware,
  WSL, Hyper-V, Docker, Tailscale, ZeroTier and link-local adapters.
- It only rewrites `EXPO_PUBLIC_API_URL` while the value is missing or a
  plain-http loopback/private-LAN address (`localhost`, `127.x`, `10.x`,
  `172.16–31.x`, `192.168.x`, `10.0.2.2`). An `https://` URL or a public host
  is kept and the hook says so; the packager hostname is still updated.
- If it picks the wrong adapter, run `node scripts/set-lan-ip.js <ip>` in
  `apps/mobile`, then start Expo directly with
  `npx expo start --host lan --port 8082`. npm runs the pre-hook only for npm
  scripts, so the direct command keeps your value.
- Windows Firewall must allow inbound TCP 4100 (API) and 8082 (Metro) for
  `node.exe` on the **active** network profile of that adapter.
- The phone needs Expo Go installed.

### 3.3 Offline, one Windows PC (no internet)

`run-offline.cmd` at the repository root drives the whole stack on one PC
with no connection: embedded PostgreSQL, API, Admin, Expo, optional Vision,
a gate-traffic simulator and the test suites.

```text
run-offline.cmd prepare     ONE TIME, while online: npm install, builds,
                            Vision venv, EasyOCR weights, fixture clip, test DBs
run-offline.cmd check       readiness report only (changes nothing)
run-offline.cmd start       start the stack
run-offline.cmd simulate    send simulated gate-camera events
run-offline.cmd test        run the automated suites
run-offline.cmd status      processes, ports, zone occupancy
run-offline.cmd stop        stop everything the launcher started
```

| Process | What the launcher does |
|---|---|
| API | Offers to create `services/api/.env` from the template with a generated `JWT_SECRET` and `CAMERA_API_KEY` (asks first, never prints them). Runs the API with `NODE_ENV=development` and console mail, because SMTP cannot work offline |
| Admin | Sets `API_BASE_URL=http://127.0.0.1:4100` in `apps/admin/.env.local` when it is missing. Serves the production build when `prepare` made one (fonts embedded), otherwise the dev server |
| Mobile | Same LAN rules as 3.2. Expo Go must be installed on the phone while online |
| Vision | Starts the runtime with `PARADA_API_URL=http://127.0.0.1:4100`, the chosen zone id and the API's `CAMERA_API_KEY` |

State (answers, process ids, logs) lives in `.offline/`, which ignores
itself in git.

### 3.4 Automated tests

No env file is needed. The `test` npm scripts set a hermetic environment:
the API and database suites point `DATABASE_URL` at the `parada_test_api` and
`parada_test` databases and refuse to run against anything else.

```bash
npm run db:start
npm run db:test:setup -w @parada/database
npm run test
npm run test -w @parada/vision
```

Two Vision tests drive real OCR into a running API and are skipped unless
these are set (use a throwaway database, because they create real events):

| Variable | Value |
|---|---|
| `PARADA_TEST_API_URL` | e.g. `http://127.0.0.1:4100` |
| `PARADA_TEST_CAMERA_API_KEY` | the API's `CAMERA_API_KEY` (omit if the API has none) |
| `PARADA_TEST_ZONE_ID` | id of the zone the camera belongs to (`GET /zones`) |
| `PARADA_TEST_CAMERA_IDENTIFIER` | a camera registered on that zone, e.g. `cam-a-main-gate` from the seed |

### 3.5 LOCAL deployment (on-premise, facility LAN)

Everything runs inside the facility. Reference sheet:
[`.env.local.example`](../../.env.local.example). Step by step:
[deploy-local.md](deploy-local.md).

| Process | Value |
|---|---|
| API | `NODE_ENV=production`, `HOST=0.0.0.0`, real `DATABASE_URL`, `JWT_SECRET`, `CAMERA_API_KEY` (required in production), `MAIL_TRANSPORT=smtp` + `SMTP_*` (console mail is refused in production). `TRUST_PROXY` empty unless a tunnel or reverse proxy is in front |
| Admin | `API_BASE_URL=http://127.0.0.1:4100`. With `NODE_ENV=production` the session cookie is `Secure`, so serve Admin over HTTPS |
| Mobile | `EXPO_PUBLIC_API_URL=http://<server-LAN-IP>:4100`. Android release builds block cleartext HTTP, so a release build needs HTTPS (tunnel or LAN certificate) |
| Vision | `PARADA_API_URL=http://<server-LAN-IP>:4100` (or `127.0.0.1` on the same host), same `CAMERA_API_KEY`, `CAMERA_SOURCE=rtsp`, `VIDEO_SOURCE=rtsp://…` |

A plain-HTTP LAN demo without SMTP can run the API with
`NODE_ENV=development`. That turns off the production guards, so say so in
the demo.

### 3.6 ONLINE deployment (API, Admin, PostgreSQL hosted remotely)

Reference sheet: [`.env.online.example`](../../.env.online.example). Guides:
[deploy-online-free.md](deploy-online-free.md),
[deploy-online-paid.md](deploy-online-paid.md).

| Process | Value |
|---|---|
| API | Always `NODE_ENV=production`. `DATABASE_URL` from the provider (usually `?sslmode=require`), or `postgres:5432` inside `docker-compose.online.yml`. `TRUST_PROXY=1` (compose sets it; on a managed platform use its hop count) |
| Admin | compose sets `API_BASE_URL=http://api:4100`. On a managed platform use the API's private or public HTTPS URL |
| Mobile | `EXPO_PUBLIC_API_URL=https://api.<domain>` in EAS (`eas env:create`) or in `apps/mobile/.env` on the build machine. The `npm run dev` / `start` pre-hook keeps an `https://` value (it only rewrites loopback/LAN `http://` URLs) |
| Vision | Not online. Cameras stay on the facility LAN (next case) |

### 3.7 HYBRID deployment (recommended for the capstone)

ONLINE values for API, Admin, PostgreSQL and Mobile, plus Vision on the
facility LAN posting events over HTTPS:

| Process | Value |
|---|---|
| Vision | `PARADA_API_URL=https://api.<domain>`, the API's `CAMERA_API_KEY`, `CAMERA_IDENTIFIER` and `CAMERA_ZONE_ID` as registered in Admin, `CAMERA_SOURCE=rtsp`, `VIDEO_SOURCE=rtsp://<camera-LAN-IP>/…` |

RTSP streams and raw frames never leave the site; only the event JSON does.
See [deploy.md](deploy.md) §A.3.

## 4. Camera sources (any case that runs Vision)

| `CAMERA_SOURCE` | Also set | Use |
|---|---|---|
| `file` | `CAMERA_FILE_PATH` (e.g. `tests/fixtures/videos/clear_plate.mp4`) | No hardware. Deterministic demos and tests |
| `usb` | `CAMERA_DEVICE_INDEX` (`0`, `1`, …) | Webcam on the Vision host |
| `rtsp` | `VIDEO_SOURCE=rtsp://user:pass@host:554/path` (or `rtsps://`) | IP camera. Credentials are redacted from logs and responses |

Every case also needs `CAMERA_IDENTIFIER` and `CAMERA_ZONE_ID` to match a
camera registered in Admin → Cameras, and the same
`OCR_PLATE_CONFIDENCE_THRESHOLD` on Vision and the API. Details:
[add-a-camera.md](add-a-camera.md), [services/vision/README.md](../../services/vision/README.md).

## 5. Common mistakes

| Symptom | Cause |
|---|---|
| Every camera event gets 401 | `CAMERA_API_KEY` differs between API and Vision, or the API was not restarted after the key changed |
| Camera event gets 409 about the zone | `CAMERA_ZONE_ID` is not the zone the camera is registered under |
| Phone shows network errors, emulator works | `EXPO_PUBLIC_API_URL` is `localhost` (the phone itself), or the firewall blocks the active profile |
| Release build cannot log in, dev build can | `EXPO_PUBLIC_API_URL` is `http://` (cleartext blocked), e.g. still the LAN value `set-lan-ip.js` writes for development |
| Admin login loops back to the login page in production | Admin served over plain HTTP on a LAN address while the cookie is `Secure` (browsers drop it; only `localhost` is exempt) |
| API exits at start in production | Missing `CAMERA_API_KEY`, `MAIL_TRANSPORT` not `smtp`, or missing `JWT_SECRET` / `DATABASE_URL`. The message names the variable |
| Each camera event takes about 2 s on Windows | `PARADA_API_URL` uses `localhost`; use `127.0.0.1` |
