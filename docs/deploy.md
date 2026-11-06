# Deploy: Outreach Dialer on the Assosiatix VPS (manual, no Docker)

| | |
| --- | --- |
| Domain | `dialer.assosiatix.com` |
| Folder | `/var/www/html/outreach-dialer` |
| App port | `3107` (`pnpm start`, run by pm2; nginx proxies to it) |
| Database | the VPS's Postgres, database + user `dialer` |
| Background job | crontab calls `/api/cron` every 10 minutes |

```
Browser / Twilio ──https──▶ nginx (certbot SSL) ──▶ 127.0.0.1:3107 (Next.js, pm2) ──▶ Postgres :5432
                                                          ▲
                                     crontab, every 10 min: GET /api/cron
```

---

## 1. DNS

In the domain panel, add an **A record**: `dialer` → the VPS IP (the same IP as the other `*.assosiatix.com` sites).

Check it from the VPS:

```bash
getent hosts dialer.assosiatix.com
```

## 2. Check the VPS

```bash
node -v                  # needs v20.9+ (v22 recommended)
pnpm -v                  # missing → corepack enable && corepack prepare pnpm@10.30.1 --activate
pm2 -v                   # missing → npm i -g pm2
psql --version           # missing → apt install -y postgresql && systemctl enable --now postgresql
ss -tlnp | grep 3107     # must print NOTHING (the port is free)
free -h                  # next build needs ~2 GB free RAM
```

Not enough RAM? Add swap:
`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`

## 3. Database

```bash
openssl rand -hex 24     # → DB password (hex only, because it goes inside a URL)
sudo -u postgres psql -c "CREATE USER dialer WITH PASSWORD '<hex password>';"
sudo -u postgres psql -c "CREATE DATABASE dialer OWNER dialer;"
```

## 4. Code (from GitHub)

```bash
cd /var/www/html
git clone <your-github-repo-url> outreach-dialer
cd outreach-dialer
```

## 5. `.env`

The `.env` file is never in git. Create it from the example:

```bash
cp .env.example .env && chmod 600 .env
openssl rand -base64 48  # → SESSION_SECRET
openssl rand -base64 48  # → CRON_SECRET
nano .env
```

Fill these in. The Twilio values are the same as your local `.env`:

```env
DATABASE_URL="postgresql://dialer:<hex password>@localhost:5432/dialer?schema=public"
PUBLIC_BASE_URL="https://dialer.assosiatix.com"
SESSION_SECRET="<new>"
CRON_SECRET="<new>"
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_API_KEY_SID="..."
TWILIO_API_KEY_SECRET="..."
TWILIO_TWIML_APP_SID="..."
TWILIO_DEFAULT_NUMBER="+16629300645"
TWILIO_SKIP_SIGNATURE="false"
RESEND_API_KEY="..."
ALERT_EMAIL_FROM="Outreach Dialer <dialer@assosiatix.com>"
SEED_MEMBERS="Rehan|rehan@assosiatix.com|<strong password>|admin|;Caller Two|caller2@assosiatix.com|<strong password>|caller|"
```

- `PUBLIC_BASE_URL` must be exactly `https://dialer.assosiatix.com`, with no trailing `/`. Twilio signatures are checked against it.
- `NEXT_PUBLIC_DEFAULT_COUNTRY` is baked in at build time. If you change it, rebuild.

## 6. Build and start

```bash
cd /var/www/html/outreach-dialer
pnpm install --frozen-lockfile
pnpm db:deploy                               # create tables (migrations)
pnpm db:seed                                 # FIRST TIME ONLY: team members from SEED_MEMBERS
pnpm build
pm2 start pnpm --name outreach-dialer -- start   # next start -p 3107
pm2 save
curl -sI http://127.0.0.1:3107/login | head -1   # HTTP/1.1 200 OK
```

If pm2 isn't set up to start on boot yet, run `pm2 startup` once and follow what it prints.

## 7. nginx

Create `/etc/nginx/sites-available/dialer.assosiatix.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name dialer.assosiatix.com;

    client_max_body_size 10m;          # contacts CSV import

    location / {
        proxy_pass http://127.0.0.1:3107;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/dialer.assosiatix.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 8. HTTPS

```bash
certbot --nginx -d dialer.assosiatix.com      # choose "redirect" if asked
curl -sI https://dialer.assosiatix.com/login | head -1    # HTTP/2 200
```

HTTPS is required for two reasons: browsers allow the microphone only on https, and Twilio only calls https webhooks.

## 9. Background job (crontab)

This job finalizes call costs, sends budget alerts, fixes stuck calls and sends the daily follow-up digest.

Open the crontab with `crontab -e` and add this line. Use the same `CRON_SECRET` value as in `.env`:

```cron
*/10 * * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:3107/api/cron > /dev/null 2>&1
```

Test it by hand:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:3107/api/cron
```

It should return JSON, not `401`.

## 10. Point Twilio at the server

1. Open https://dialer.assosiatix.com and sign in as the admin from `SEED_MEMBERS`.
2. Go to **Settings → Numbers**. Click **Import from Twilio**, then **Configure webhooks**.
3. In **Settings → Team**, change the seed passwords.
4. In Resend, make sure the `assosiatix.com` domain is verified (it's the sender in `ALERT_EMAIL_FROM`).
5. Make a test call to your own mobile. **Calls** should show it with a status and, for the admin, a cost.

> **Local dev after this:** there is only one TwiML App, and *Configure webhooks* now points it at the VPS.
> That means calls from your local tunnel stop working. For a clean split, create a second TwiML App in Twilio
> for dev and put its SID only in your local `.env`.

---

## Update to a new version

Push from your PC to GitHub first. Then on the VPS:

```bash
cd /var/www/html/outreach-dialer
git pull
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm build
pm2 restart outreach-dialer
```

## Daily database backup

Create the backup folder:

```bash
mkdir -p /root/backups
```

Then add this line with `crontab -e`:

```cron
0 3 * * * sudo -u postgres pg_dump dialer | gzip > /root/backups/dialer-$(date +\%F).sql.gz && find /root/backups -name 'dialer-*.sql.gz' -mtime +14 -delete
```

To restore: `gunzip -c /root/backups/dialer-YYYY-MM-DD.sql.gz | sudo -u postgres psql dialer`

## Handy commands

| What | Command |
| --- | --- |
| Status | `pm2 status` |
| Logs | `pm2 logs outreach-dialer` |
| Restart (after editing `.env`) | `pm2 restart outreach-dialer` |
| DB shell | `sudo -u postgres psql dialer` |

## If something breaks

| Symptom | Check |
| --- | --- |
| `502 Bad Gateway` | Run `pm2 status` and `pm2 logs outreach-dialer`. Either the app isn't running, or it isn't on port 3107. |
| Calls fail instantly, logs show `403` on `/api/voice` | `PUBLIC_BASE_URL` isn't exactly the domain. Fix it, run `pm2 restart outreach-dialer`, then click *Configure webhooks* again. |
| Webhook banner on every page | Go to *Settings → Numbers* and click *Configure webhooks*. |
| The browser never asks for the microphone | The site isn't on https. Redo step 8. |
| `pnpm build` is killed | Not enough RAM. Add swap (step 2). |
| `P1000` authentication error | The password in `DATABASE_URL` doesn't match the one from step 3. |
