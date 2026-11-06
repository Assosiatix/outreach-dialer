# Outreach Dialer

Internal Twilio-powered browser dialer for the Assosiatix outreach team. Built from
[docs/build-plan.md](./docs/build-plan.md) — Phases 1–3. Phase 4 (React Native app) comes later and reuses the same `/api/token` and `/api/voice` endpoints.

**Stack:** Next.js 16 (App Router) · Twilio Voice JS SDK · Postgres + Prisma · Resend (email alerts).

## What it does

| Area | Details |
| --- | --- |
| Calling | Browser calls with a headset: click-to-call from any contact, or the keypad. Mute, DTMF keypad, hang up. |
| Caller ID | Picks a number from the destination country automatically (`twilio_numbers`), else same calling code, else the default. Can be overridden on the Dialer page. |
| Inbound | Rings **every available** team member at once (simul-ring, 22s). First to answer gets it. |
| No answer | Nobody online / nobody answers / caller hangs up → logged as **missed**, SMS + email alert to the team, voicemail recorded. Voicemail → status **voicemail** + email with a listen link. |
| Presence | Available / Away toggle. The open tab heartbeats every 20s; closed tab or logout = offline. Someone on a call isn't rung. |
| Contacts (CRM) | Business, website, country, issue identified, research notes, stage, owner, next follow-up. CSV import. |
| Wrap-up | After every call: notes, stage, next follow-up — written back to the contact so the teammate picks up with context. |
| History | Every call in `call_logs` with a clear final status; recordings & voicemails playable (proxied — Twilio creds never reach the browser). |
| Follow-ups | Today page shows overdue/today follow-ups; daily digest email per member. |
| SMS | Send follow-up SMS from a contact; replies land on the contact's timeline. |
| Analytics | Calls per day, per caller (connected, talk time, avg), outcomes, destination countries with connect rate, pipeline. |
| No silent drops | Out-of-order Twilio callbacks can never undo a final status; a call-level status callback finalizes anything left open; an hourly job reconciles stuck calls against the Twilio API. |

Out of scope (per plan): predictive dialing, call queues, IVR.

---

## 1. Twilio setup (Console)

1. **Account SID + Auth Token** — Console home page.
2. **API Key** — Account → API keys & tokens → *Create API key* (Standard). Copy the SID (`SK…`) and Secret.
3. **TwiML App** — Voice → Manage → TwiML apps → *Create*. Any URL for now (the app sets it for you, step 4 of deploy). Copy its SID (`AP…`).
4. **Geo Permissions** — Voice → Settings → Geo permissions: tick every country you'll call. Without this, calls fail with error 13227 (the app tells the caller this).
5. **Concurrency** — for 2+ simultaneous calls, open a (free) support ticket to raise the limit.
6. Put the values in `.env` (below). Everything stays server-side.

> **Verified Caller ID vs. a Twilio number.** A *Verified Caller ID* (Numbers & senders → Verified Caller IDs)
> is a number you own elsewhere; Twilio lets you show it as caller ID on **outbound** calls only. Inbound calls,
> voicemail, missed-call SMS and SMS follow-ups need a number **bought in Twilio** (Phone Numbers → Buy a number).
> *Import from Twilio* brings in both kinds; verified ones are marked "Caller ID only".

### Outbound-only mode (current setup)

The team currently calls **outbound only**, using the Verified Caller ID — no Twilio number has been bought yet.
The app detects this automatically (no purchased number in Settings → Numbers) and:

- hides the Available/Away toggle and the "Missed calls" card, and shows "Outbound only" in the sidebar;
- skips missed-call SMS (SMS needs a purchased number);
- still logs, records and prices every outbound call.

The caller ID (+1 662 930 0645) is a **Numero virtual number** (no SIM). When a prospect calls it back, the call rings in
the **Numero app**, not this dialer — keep Numero installed with incoming calls/voicemail on, and write the outcome on the
contact afterwards. Keep the Numero subscription active: if the number lapses, Twilio can no longer use it as caller ID
(outbound calls fail) and callbacks would reach whoever gets the number next. To switch inbound on later: buy a US number in Twilio (~$1.15/month), then
**Numbers → Import from Twilio → Configure webhooks**. Everything inbound (simul-ring, voicemail, alerts) is already built
and turns on by itself.

## 2. Run locally

```bash
cp .env.example .env            # fill TWILIO_* ; SESSION_SECRET + CRON_SECRET = long random strings
# Postgres on :5433 (any local Postgres works — just match DATABASE_URL)
pnpm install
pnpm db:deploy                  # create tables
pnpm db:seed                    # team members from SEED_MEMBERS + your TWILIO_DEFAULT_NUMBER
pnpm dev                        # http://localhost:3100
```

Twilio must reach the webhooks over HTTPS. For local testing start a tunnel
(`cloudflared tunnel --url http://localhost:3100` or `ngrok http 3100`), set `PUBLIC_BASE_URL`
to the tunnel URL, restart, then **Numbers → Configure webhooks**.

## 3. Deploy to the VPS

Manual deploy (no Docker), step by step: **[docs/deploy.md](./docs/deploy.md)**. In short:

1. DNS A record `dialer.assosiatix.com` → VPS. Create Postgres user + database `dialer`.
2. `git clone` into `/var/www/html/outreach-dialer`, create `.env` (`DATABASE_URL`, `PUBLIC_BASE_URL=https://dialer.assosiatix.com`,
   `SESSION_SECRET`, `CRON_SECRET`, all `TWILIO_*`, `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `SEED_MEMBERS`). Keep `TWILIO_SKIP_SIGNATURE="false"`.
3. `pnpm install --frozen-lockfile && pnpm db:deploy && pnpm db:seed && pnpm build`, then `pm2 start pnpm --name outreach-dialer -- start` (port 3107).
4. nginx site → `proxy_pass http://127.0.0.1:3107`, then `certbot --nginx -d dialer.assosiatix.com`. Crontab: `/api/cron` every 10 min.
5. Sign in as the admin → **Settings → Numbers**:
   - **Import from Twilio** (adds your numbers, sets the default),
   - **Configure webhooks** (points the TwiML App + every number's voice, status and SMS webhooks at the domain).
6. **Settings → Team**: set each member's *alert phone* (E.164) for missed-call SMS. Change the seed passwords.
7. Resend: verify the sender domain used in `ALERT_EMAIL_FROM`.

Logs: `pm2 logs outreach-dialer` (JSON lines). Backups: see [docs/deploy.md](./docs/deploy.md#daily-database-backup).

### Webhooks (set automatically by *Configure webhooks*)

| Where | URL |
| --- | --- |
| TwiML App → Voice request URL | `POST /api/voice` |
| TwiML App → Status callback | `POST /api/voice/status` |
| Each number → A call comes in | `POST /api/voice/inbound` |
| Each number → Call status changes | `POST /api/voice/status` |
| Each number → A message comes in | `POST /api/sms/inbound` |

All Twilio webhooks are verified with the `X-Twilio-Signature` header against `PUBLIC_BASE_URL`.

## Using it day to day

1. Open the app in Chrome, allow the microphone (and notifications — so a background tab alerts you on incoming calls). The sidebar shows **Available**.
2. Research a business → add it as a contact (stage *Researched*). It appears on **Today → Researched, not yet called**.
3. Read the research, click **Call**. After hanging up, fill the wrap-up (notes, stage, follow-up).
4. Missed calls appear on **Today** and **Calls** (highlighted) until someone writes a note.
5. Adding a local number for a new country: buy it in Twilio → *Import from Twilio* → *Configure webhooks*. Calls to that country now use it automatically.

## Notes

- **Recording:** `CALL_RECORDING="true"` records both sides of connected calls. With recording on, the called party hears
  `RECORDING_NOTICE` right after answering (two-party-consent US states: CA, FL, IL, PA, WA, …). Set it to `""` to turn the notice off.
- **Cost guard:** outbound calls to destinations above `MAX_CALL_RATE_USD` per minute (default `0.50`; US is `0.014`) are refused,
  and so are premium-rate / satellite numbers Twilio can't quote. The reason shows in the wrap-up and on the call page.
- **US numbers without +1:** `NEXT_PUBLIC_DEFAULT_COUNTRY="US"` lets callers type `(212) 555-0147`.
- **Webhook check:** if the TwiML App doesn't point at `PUBLIC_BASE_URL` (e.g. the dev tunnel URL changed), every page shows a
  banner until an admin runs *Numbers → Configure webhooks*.
- **Compliance:** research notes double as the record of why a business was contacted (B2B rules — PECR, EU, TCPA — differ by country).
- **Audio quality from Pakistan:** try `TWILIO_VOICE_EDGE="singapore"` (not `TWILIO_EDGE`: the Twilio library reads that name itself and breaks every API call).
- **Commands:** `pnpm test` (unit tests for status rules, caller-ID selection, phone parsing), `pnpm typecheck`, `pnpm lint`, `pnpm db:studio`.

## Code map

```
prisma/schema.prisma          team_members, contacts, call_logs, twilio_numbers, sms_messages
src/app/api/token             Voice access token (1h, auto-refreshed)
src/app/api/voice/*           TwiML webhooks: outbound, inbound simul-ring, voicemail, status callbacks
src/app/api/sms/*             SMS send / inbound / delivery status
src/app/api/cron              hourly: reconcile stuck calls + follow-up digest
src/components/dialer/*       Twilio Device provider, floating call panel, wrap-up dialog
src/lib/call-status.ts        status ordering rules (no late callback can undo an outcome)
src/lib/caller-id.ts          local-presence caller ID selection
```
