---
phase: 02-outbound-calling-live-status
plan: 01
subsystem: call-initiation
tags: [vapi, pusher, outbound-calling, api-route, schema-migration]

dependency_graph:
  requires: [01-foundation]
  provides: [call-start-api, vapi-singleton, pusher-singletons, call-schema-v2]
  affects: [02-02, 02-03]

tech_stack:
  added: ["@vapi-ai/server-sdk@0.11.0", "pusher@5.3.2", "pusher-js@8.4.0"]
  patterns: [transient-assistant-per-call, webhook-secret-via-headers, db-record-before-api-call]

key_files:
  created:
    - src/lib/vapi.ts
    - src/lib/pusher-server.ts
    - src/lib/pusher-client.ts
    - src/lib/call-channel.ts
    - src/app/api/call/start/route.ts
    - src/components/start-call-button.tsx
    - drizzle/0002_square_maximus.sql
  modified:
    - src/db/schema.ts
    - src/app/confirm/page.tsx
    - package.json

decisions:
  - id: vapi-silence-timeout-untyped
    choice: "Spread silenceTimeoutSeconds via type assertion (SDK v0.11 omits it from CreateAssistantDto)"
    reason: "API accepts it but SDK type doesn't include it; critical for hold music survival"
  - id: webhook-secret-via-headers
    choice: "Pass VAPI_WEBHOOK_SECRET via server.headers['x-vapi-secret'] instead of server.secret"
    reason: "SDK Server type has no 'secret' field; headers is the typed alternative"
  - id: vapi-response-narrowing
    choice: "Narrow CreateCallsResponse union with 'id' in check before accessing call properties"
    reason: "vapiClient.calls.create returns Call | CallBatchResponse union type"

metrics:
  duration: 6min
  completed: 2026-02-06
---

# Phase 02 Plan 01: Call Initiation Pipeline Summary

**One-liner:** Vapi/Pusher packages installed, call table extended with vapiControlUrl and endedReason columns, library singletons created, POST /api/call/start wired from confirm page with transient assistant config.

## What Was Built

### Task 1: Install packages, add schema columns, create library singletons
- Installed `@vapi-ai/server-sdk@0.11.0`, `pusher@5.3.2`, `pusher-js@8.4.0`
- Added `vapiControlUrl` (text, nullable) and `endedReason` (text, nullable) columns to `call` table
- Generated and applied Drizzle migration `0002_square_maximus.sql`
- Created four library singletons:
  - `src/lib/vapi.ts` -- VapiClient with token from env
  - `src/lib/pusher-server.ts` -- Pusher server instance with TLS
  - `src/lib/pusher-client.ts` -- Pusher client factory with private channel auth
  - `src/lib/call-channel.ts` -- Shared channel name utility

### Task 2: Create call start API route and wire confirm page
- Created `POST /api/call/start` with:
  - BetterAuth session authentication (401 if unauthenticated)
  - Zod validation of ispId (UUID) and issueCategoryId (UUID)
  - Active call check (409 if user has non-completed/non-failed call)
  - ISP lookup with supportPhone validation (400 if missing)
  - DB record created BEFORE Vapi API call (prevents webhook race condition)
  - Transient assistant: gpt-4o-mini, Elliot voice, Deepgram nova-2, 45min max, 1hr silence timeout
  - Webhook secret passed via server headers
  - Stores vapiCallId and vapiControlUrl on success
  - Marks call as failed on Vapi error with call_event logged
- Created `StartCallButton` client component:
  - Loading state with spinner animation
  - Redirects to `/call/[callId]` on 201
  - Redirects to active call on 409
  - Error toast via sonner
- Updated confirm page: replaced disabled button + "coming soon" with working StartCallButton

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 8373a9b | feat(02-01): install packages, add schema columns, create library singletons |
| 2 | 1d234fa | feat(02-01): create call start API route and wire confirm page |

## Decisions Made

1. **silenceTimeoutSeconds via type assertion** -- The Vapi SDK v0.11 CreateAssistantDto type omits `silenceTimeoutSeconds` (present on TransferAssistant but not CreateAssistantDto). Since the Vapi API still accepts it and it's critical for hold music survival (preventing premature hangup), we spread it via `Record<string, unknown>` type assertion.

2. **Webhook secret via headers** -- The SDK's `Server` type has no `secret` field. Passed `VAPI_WEBHOOK_SECRET` through `server.headers['x-vapi-secret']` instead. The webhook handler (built in plan 02-02) will validate this header.

3. **CreateCallsResponse union narrowing** -- `vapiClient.calls.create()` returns `Call | CallBatchResponse`. We check for `"id" in vapiCall` to narrow to `Call` type before accessing properties.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SDK type missing silenceTimeoutSeconds**
- **Found during:** Task 2
- **Issue:** `silenceTimeoutSeconds` is not in `CreateAssistantDto` type in SDK v0.11
- **Fix:** Used spread with type assertion `...({ silenceTimeoutSeconds: 3600 } as Record<string, unknown>)`
- **Files modified:** src/app/api/call/start/route.ts
- **Commit:** 1d234fa

**2. [Rule 3 - Blocking] SDK Server type missing secret field**
- **Found during:** Task 2
- **Issue:** SDK `Server` interface has no `secret` property, only `url`, `headers`, `timeoutSeconds`, etc.
- **Fix:** Passed webhook secret via `server.headers['x-vapi-secret']` instead of `server.secret`
- **Files modified:** src/app/api/call/start/route.ts
- **Commit:** 1d234fa

**3. [Rule 1 - Bug] CreateCallsResponse union type error**
- **Found during:** Task 2 (tsc verification)
- **Issue:** `vapiClient.calls.create()` returns `Call | CallBatchResponse` union; accessing `.id` directly fails TypeScript check
- **Fix:** Added `"id" in vapiCall` type guard before accessing call properties
- **Files modified:** src/app/api/call/start/route.ts
- **Commit:** 1d234fa

## Verification Results

- `npm run build` succeeds with no type errors
- Three new packages verified: @vapi-ai/server-sdk@0.11.0, pusher@5.3.2, pusher-js@8.4.0
- Database has vapiControlUrl and endedReason columns (migration 0002 applied)
- Four lib files exist with correct exports
- Confirm page shows enabled Start Call button (no "coming soon" text)
- `npx tsc --noEmit` passes clean

## Next Phase Readiness

Plan 02-02 (Vapi Webhook & Pusher Events) can proceed -- it depends on:
- `src/lib/vapi.ts` (exists)
- `src/lib/pusher-server.ts` (exists)
- `src/lib/call-channel.ts` (exists)
- `call` table with `vapiControlUrl` and `endedReason` columns (migrated)
- `POST /api/call/start` sends webhooks to `/api/webhooks/vapi` (configured in transient assistant)

**Note:** ISP support phone numbers need to be populated in seed data for end-to-end testing. The API checks for `supportPhone` and returns 400 if missing.

## Self-Check: PASSED
