# How to deploy — ONLINE with a paid option

For a demonstration that must not sleep, expire, or be reclaimed: one small
paid virtual server (VPS) running `docker-compose.online.yml`, plus a domain.
Typical cost at the time of writing: US$4–8/month for a 2 vCPU / 2–4 GB VPS
(Hetzner, DigitalOcean, Linode/Akamai, Vultr, or a Philippine provider) and
US$2–15/year for a domain. Verify current prices with the provider.

A managed-platform alternative (paid plans of Render/Railway/Fly.io plus a
managed PostgreSQL) is the same as the free Route 2 in
[deploy-online-free.md](./deploy-online-free.md) with sleeping and quotas
removed; use this guide's §5 for the differences.

Nothing here is vendor-specific in the repository: the compose stack only
needs a Linux host with Docker and two DNS names. Reference for every
variable and command: [deploy.md](./deploy.md).

```
 Internet ──▶ VPS (public IP)
               ├─ caddy    :80/:443  TLS (Let's Encrypt), api.<domain> + admin.<domain>
               ├─ api      :4100     Node, TRUST_PROXY=1
               ├─ admin    :3000     Next.js, API_BASE_URL=http://api:4100
               ├─ migrate  one-shot  prisma migrate deploy
               └─ postgres :5432     volume parada_online_pgdata (not published)
 Facility LAN ──▶ vision (on-site) ──HTTPS + X-API-Key──▶ api.<domain>      (hybrid)
```

## 1. Buy / create

1. VPS: Ubuntu 24.04, ≥ 2 GB RAM (4 GB if you also run `vision-demo`),
   a **public IPv4**. Note the IP.
2. Domain: create two `A` records → the VPS IP: `api.<domain>`,
   `admin.<domain>`. Wait until `dig +short api.<domain>` returns the IP.
3. SMTP: a transactional-mail account (paid or free tier) — values for
   `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`.
4. Expo account for EAS builds (free plan is enough; paid removes queue
   waits and raises the build quota).

## 2. Harden the host (once)

```bash
ssh root@<ip>
adduser parada && usermod -aG sudo parada
rsync --archive --chown=parada:parada ~/.ssh /home/parada     # copy your key
# then as parada:
sudo apt update && sudo apt -y upgrade
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl restart ssh
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker parada && newgrp docker
sudo apt -y install unattended-upgrades
```

PostgreSQL is never published outside the Docker network; RTSP never
reaches this host at all (cameras stay on the facility LAN).

## 3. Deploy

```bash
git clone <repo> parada && cd parada
git checkout <release tag or commit>
cp .env.online.example .env.online && chmod 600 .env.online
nano .env.online
#   API_DOMAIN=api.<domain>        ADMIN_DOMAIN=admin.<domain>      ACME_EMAIL=<you>
#   POSTGRES_PASSWORD=<strong>     DATABASE_URL=postgresql://parada:<strong>@postgres:5432/parada?schema=public
#   JWT_SECRET=<48 random bytes>   CAMERA_API_KEY=<32 random bytes>
#   MAIL_TRANSPORT=smtp SMTP_HOST= SMTP_PORT= SMTP_SECURE= SMTP_USER= SMTP_PASS= MAIL_FROM=
#   EXPO_PUBLIC_API_URL=https://api.<domain>   CAMERA_IDENTIFIER= CAMERA_ZONE_ID=
docker compose --env-file .env.online -f docker-compose.online.yml up -d --build
docker compose --env-file .env.online -f docker-compose.online.yml ps
```

Order enforced by the compose file: `postgres` healthy → `migrate`
(`prisma migrate deploy`, exits 0) → `api` healthy (`/health` = DB
connected) → `admin` → `caddy` (certificates on first request).

First admin and campus data (deploy.md §4.3), then remove the demo driver:

```bash
docker compose --env-file .env.online -f docker-compose.online.yml exec -w /app/packages/database \
  -e PARADA_SEED_ADMIN_PASSWORD='<strong>' -e PARADA_SEED_USER_PASSWORD='<strong>' api npx ts-node src/seed/index.ts
```

Verify: `curl https://api.<domain>/health`; open `https://admin.<domain>`;
run deploy.md §10.

## 4. Operate

| Task | Command |
|---|---|
| Logs | `docker compose --env-file .env.online -f docker-compose.online.yml logs -f api admin caddy` |
| Backup (daily cron) | `docker compose --env-file .env.online -f docker-compose.online.yml exec -T postgres pg_dump -U parada -Fc parada > /home/parada/backups/parada-$(date +%F).dump` |
| Restore | `docker compose … exec -T postgres pg_restore -U parada -d parada --clean --if-exists < file.dump` |
| Update to a new release | `git pull && docker compose --env-file .env.online -f docker-compose.online.yml up -d --build` (backup first; `migrate` re-runs automatically) |
| Roll back API/Admin | `git checkout <previous commit>` then the same `up -d --build`; database rollback = restore the pre-update dump (Prisma has no down migrations) |
| Rotate `CAMERA_API_KEY` | change it in `.env.online`, `up -d api`, then update every on-site vision runtime |
| Disable a camera | Admin → Cameras → OFFLINE (API returns 409 to it) |
| Vision demo without a camera | `mkdir -p deploy/vision-demo && cp <clip>.mp4 deploy/vision-demo/input.mp4` then `docker compose --env-file .env.online -f docker-compose.online.yml --profile demo up -d --build vision-demo` (needs ≥ 2 GB free RAM) |

## 5. Managed-platform variant (paid plans)

Same build/start commands as the free guide's Route 2, on non-sleeping
plans:

- **API**: paid web service, 512 MB–1 GB, health check `/health`,
  pre-deploy `npm run migrate:deploy -w @parada/database`, env from the API
  section of `.env.online.example`, `TRUST_PROXY=1`.
- **Admin**: paid web service (persistent Node process), `API_BASE_URL` =
  the API's private/internal URL when the platform offers one, else its
  public HTTPS URL.
- **PostgreSQL**: the platform's managed database or Neon/Supabase paid
  tier; `DATABASE_URL` with `sslmode=require`; enable automated backups.
- **Custom domains**: add `api.<domain>` / `admin.<domain>` in the platform
  and create the CNAME records it shows; TLS is handled by the platform.
- Keep the API at **one instance**; do not enable autoscaling (in-memory
  rate limits and SSE hub).

## 6. Mobile and Vision

Identical to the free guide: EAS `preview` APK with
`EXPO_PUBLIC_API_URL=https://api.<domain>`; Vision on-site
(`PARADA_API_URL=https://api.<domain>`) or the `vision-demo` profile.

## 7. Remaining manual steps

Provider account, VPS, domain and DNS, SMTP credentials, Expo project,
filling `.env.online`, the commands above, and the deploy.md §15 log.
