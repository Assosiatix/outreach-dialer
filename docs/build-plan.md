# International Outreach Dialer — Build Plan

Nov 5, 2026 · @Assosiatix

This plan covers building an internal, Twilio-powered browser dialer (Next.js) for a 2-person outreach team to call international business clients, with a path to a mobile app later.

## Goals & Scope

Build an internal calling system — not a commercial dialer product — so the team can place and receive international business calls from the browser, and later from a mobile app, without depending on an external, unstable open-source repo.

- **Team size today:** 2 callers, both calling from the web (laptop + headset), no desk phones.
- **Calling direction:** both outbound (sales outreach) and inbound (callback from prospects), to and from any country.
- **Numbers owned:** one US Twilio number today; plan assumes more local numbers are added per target country as outreach expands.
- **Nature of the calling:** targeted B2B outreach to businesses that have a real, identifiable problem the team's service solves — not random cold-call blasting. Each call is preceded by research on that business (see Calling Philosophy below), which the system must support by storing notes against each contact.
- **Out of scope for v1:** predictive/auto-dialing, large call-center queueing, IVR trees. These can be added later if the team grows past a handful of callers.
- **Build method:** Next.js full-stack app, built incrementally with Claude Code, following the phased plan below.

## Calling Philosophy (why this matters for the build)

The team is doing researched B2B outreach: identifying a real business, studying what it does and where it is likely struggling, then calling to explain the specific issue and offer the service as the fix. This is different from blind cold-calling/spam in two ways that directly shape what the system needs:

1. **Every contact needs a research record**, not just a phone number — company name, website, what they do, the specific issue/angle identified, and notes from any prior contact. A caller should see this before dialing.
2. **Call outcomes feed back into that record** — what was said, next step, follow-up date — so the next call (by either of the 2 team members) picks up with context instead of starting cold.

This means the data model (below) is not just "phone number + call log" — it is closer to a lightweight CRM record per prospect, which the dialer is built around.

## Tech Stack & Architecture

**Stack:** Next.js (App Router) for both frontend and backend API routes. Twilio Voice JS SDK for browser calling. Postgres for data. Built incrementally with Claude Code.

| Layer | Choice | Role |
| --- | --- | --- |
| Frontend | Next.js + React | Login, dialer UI, contact/research notes, call history |
| Browser calling | Twilio Voice JS SDK | Lets a logged-in team member make/receive calls with headset, no desk phone |
| Backend API | Next.js API routes (or a small separate Node service if it grows) | Issues Twilio Access Tokens, triggers outbound calls, handles Twilio webhooks |
| Telephony | Twilio Programmable Voice | Actual call connection, in/outbound, recording, routing |
| Database | Postgres | Team members, contacts (with research notes), call logs, presence status |
| Auth | Simple email/password or magic link (NextAuth or similar) | Only the 2 (later more) team members can log in and dial |

**Core request flow:**

- *Outbound:* caller clicks a contact in the UI → browser asks backend for a short-lived Twilio Access Token → Twilio Voice SDK places the call from the browser → backend's `/voice` webhook returns TwiML telling Twilio to dial the real destination number, with the caller's chosen "From" number as caller ID.
- *Inbound:* someone calls the Twilio number → Twilio hits the backend's inbound webhook → backend returns TwiML that rings the online team member(s) (see Call Routing below) → whoever answers is bridged to the caller in their browser.

This keeps one backend and one database for both the web dialer now and the mobile app later — the mobile app will be a second client calling the same API and using Twilio's React Native Voice SDK.

## Data Model

| Table | Key fields | Purpose |
| --- | --- | --- |
| `team_members` | id, name, email, password\_hash, role, status (online/offline/on-call) | The 2 (later more) callers; `status` drives call routing |
| `contacts` | id, business\_name, website, country, phone\_number, issue\_identified, research\_notes, last\_contacted\_at, next\_follow\_up\_at, stage (new/researched/contacted/follow-up/won/lost) | The lightweight CRM record per prospect — holds the research done *before* calling, per the Calling Philosophy above |
| `call_logs` | id, contact\_id, team\_member\_id, direction (inbound/outbound), from\_number, to\_number, status (completed/no-answer/voicemail/missed), duration, recording\_url, notes, started\_at | Every call made or received, linked back to the contact so the next caller has full history |
| `twilio_numbers` | id, phone\_number, country, label | Each Twilio number owned (starts with 1 US number), used to auto-pick a local "From" number per destination country (see International Calling below) |

The `contacts.research_notes` field is what makes this different from a plain dialer: before a call, a team member studies the business and writes (or pastes) what they found; during/after the call, `call_logs.notes` + updated `next_follow_up_at` carry the outcome forward so either of the 2 team members can pick it up.

## Call Routing & Availability Logic

This is the part that decides what happens if a team member isn't at their screen when a call comes in.

&#91;embedded content: inbound call flow: ring free agents, then voicemail + alert on no answer\]

**Design for the 2-person team today:**

- **Presence:** when a team member logs into the web dialer, mark them `online` in `team_members.status`; logging out or closing the tab marks them `offline`.
- **Inbound ring:** Twilio's `<Dial>` rings *every currently-online* team member's browser client at once (simul-ring) — whoever answers first gets the call, the rest stop ringing.
- **Timeout (\~20-25 seconds):** if nobody answers (or nobody is online at all), Twilio falls back to `<Record>` for a voicemail, and the backend immediately sends a missed-call alert (SMS and/or email, cheaply done via the same Twilio account) to both team members with the caller's number.
- **Nothing is silently dropped:** every inbound call gets logged in `call_logs` with its outcome (`completed`, `voicemail`, or `missed`), so a missed international lead is always visible and followable up, not lost.
- **Later, once the team grows:** add a simple queue/hold-music step before voicemail, and business-hours rules (route after-hours calls straight to voicemail with a message).

## International Calling & Compliance

- **Concurrency:** Twilio accounts start with a low concurrent-call limit. Request an increase from Twilio support so both team members (and any future hires) can be on calls at the same time.
- **Geo permissions:** enable the destination countries under Twilio Console → Voice → Geo Permissions before calls to those countries will connect.
- **Caller ID / local presence:** calling other countries from only the US number works, but pickup rates are lower and the risk of spam-flagging is higher, especially at volume. As specific target countries emerge, buy a local Twilio number per country ($1-2/month each) and have the backend auto-select the "From" number based on the destination country code (a simple lookup against the `twilio_numbers` table).
- **Avoiding spam flags:** ramp call volume gradually on any one number, keep genuine call durations, and avoid blasting large unresearched lists — this aligns naturally with the research-first Calling Philosophy above, which is lower-volume and higher-intent by design.
- **Compliance:** this is B2B outreach, not consumer robocalling, which is treated more leniently under most telemarketing rules (UK PECR, EU country rules, US TCPA) — but rules differ by country and change over time. Keep records of why each business was contacted (the `research_notes` field doubles as this record) and do not call countries/sectors with outright B2B calling restrictions without checking first.

## Build Phases & Timeline

| Phase | What it delivers | Time |
| --- | --- | --- |
| 1 — Core calling MVP | Twilio Access Token endpoint, browser outbound call test, inbound webhook ringing one fixed browser client | 2-3 days |
| 2 — Team-usable dialer | Login for the 2 team members, contacts list with research notes, click-to-call, presence-based simul-ring, call logging, voicemail + missed-call alert fallback | +2 weeks |
| 3 — Mature / polished | Call recording & playback, follow-up reminders (`next_follow_up_at`), analytics (calls per agent, outcomes), SMS follow-up, local-number auto-selection per country, better error handling/logging | +2-4 weeks |
| 4 — Mobile app | React Native app using Twilio's RN Voice SDK, reusing the same backend/API and database | After Phase 3 is stable |

Total to a genuinely team-usable dialer: roughly **2-3 weeks**. To a mature, polished internal tool: **\~1-1.5 months**. Mobile app is additive after that, not a blocker to using the web dialer day-to-day.

## Twilio Account Setup Checklist

Do these in the Twilio Console before Claude Code starts Phase 1:

- [ ] Note the Account SID and Auth Token (Console home page)
- [ ] Confirm the existing US number is voice-enabled
- [ ] Create a TwiML App (Voice → TwiML Apps) — note its SID; its Voice Request URL will later point at the deployed app's `/api/voice` route
- [ ] Create an API Key + Secret (Account → API Keys) — used to generate Access Tokens for the browser SDK
- [ ] Voice → Geo Permissions — enable the countries to be called
- [ ] Request a concurrency limit increase if more than 1 simultaneous call is needed (support ticket, free)
- [ ] Decide on a messaging-capable number or the same number for SMS, if missed-call alerts will go out via SMS

## Instructions for Claude Code

Hand Claude Code this section (or the whole doc) as the build brief. Work through it in order; each step should be a working, testable increment.

1. **Scaffold** a Next.js (App Router, TypeScript) project. Add Postgres (local Docker Postgres is fine for dev) and an ORM (Prisma recommended) with the four tables from Data Model above: `team_members`, `contacts`, `call_logs`, `twilio_numbers`.
2. **Twilio Access Token endpoint:** `POST /api/token` — given a logged-in team member, returns a short-lived Twilio Voice Access Token (using the API Key/Secret and TwiML App SID from the setup checklist).
3. **Outbound call path:** frontend loads the Twilio Voice JS SDK with that token; dialer UI lets a team member enter/select a number and click Call; backend's `/api/voice` TwiML endpoint receives Twilio's request and returns `<Dial>` with the destination number and the correct "From" caller ID. Test with one real outbound call.
4. **Inbound call path (fixed target first):** point the Twilio number's Voice webhook at `/api/voice/inbound`; initially just `<Dial>` a single hardcoded browser client to prove inbound works end-to-end.
5. **Auth + team members:** add login (NextAuth or equivalent), seed the 2 team members, and track `status` (online/offline) — set online on login/socket-connect, offline on logout/disconnect.
6. **Presence-based simul-ring:** update `/api/voice/inbound` to `<Dial>` all currently-online team members' browser clients at once, with a \~20-25s timeout.
7. **Fallback on no answer:** add `<Record>` (voicemail) as the `<Dial>` action's fallback, and trigger a missed-call SMS/email to both team members right after. Log every inbound attempt's outcome to `call_logs`.
8. **Contacts & research notes:** build the contacts list UI (CRUD) with `research_notes`, `stage`, `next_follow_up_at`; make each contact's phone number click-to-call.
9. **Call logging on outbound too:** every outbound call writes a `call_logs` row (contact, team member, duration, outcome); show call history per contact.
10. **Polish (Phase 3):** recording + playback, follow-up reminders, basic analytics, local-number auto-selection from `twilio_numbers` by destination country code, SMS follow-up.
11. **Mobile app (Phase 4):** new React Native client using Twilio's RN Voice SDK, reusing `/api/token` and `/api/voice` from the same backend.

**Guardrails to tell Claude Code explicitly:** keep Twilio Account SID/Auth Token/API Secret only in server-side env vars, never in frontend code; every inbound/outbound call must end up in `call_logs` with a clear status (no silent drops); don't build predictive dialing, large queues, or IVR — out of scope per Goals & Scope.
