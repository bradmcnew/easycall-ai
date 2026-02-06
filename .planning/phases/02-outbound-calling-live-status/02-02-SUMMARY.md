---
phase: 02-outbound-calling-live-status
plan: 02
subsystem: webhook-events-call-control
tags: [vapi-webhook, pusher, call-cancel, active-call, api-route]

dependency_graph:
  requires: [02-01]
  provides: [vapi-webhook-handler, pusher-auth, call-cancel-api, active-call-api]
  affects: [02-03]

tech_stack:
  added: []
  patterns: [webhook-to-pusher-fanout, private-channel-ownership-check, controlUrl-fallback-to-sdk-delete]

key_files:
  created:
    - src/app/api/webhooks/vapi/route.ts
    - src/app/api/pusher/auth/route.ts
    - src/app/api/call/cancel/route.ts
    - src/app/api/call/active/route.ts
  modified: []

decisions:
  - id: vapi-delete-dto
    choice: "Pass { id: vapiCallId } object to vapiClient.calls.delete() instead of plain string"
    reason: "SDK v0.11 DeleteCallDto interface requires object with id property, not a string"

metrics:
  duration: 4min
  completed: 2026-02-06
---

# Phase 02 Plan 02: Vapi Webhook & Call Control Routes Summary

**One-liner:** Vapi webhook handler receives status-update and end-of-call-report events, persists call_events, updates call status/timestamps, and fans out via Pusher; plus Pusher auth, call cancel, and active call detection endpoints.

## What Was Built

### Task 1: Vapi webhook handler and Pusher auth endpoint

- Created `POST /api/webhooks/vapi` with:
  - `x-vapi-secret` header validation (401 if mismatch)
  - `status-update` handling: maps Vapi statuses (queued/ringing/in-progress/ended) to app statuses (pending/dialing/on_hold/completed/failed)
  - Inserts call_event row with mapped event type and metadata
  - Updates call record: status, startedAt (on ringing), endedAt (on completion/failure), endedReason
  - Triggers Pusher `status-change` event on `private-call-{callId}` channel
  - `end-of-call-report` handling: finalizes call as completed or failed based on endedReason, triggers `call-ended` Pusher event
  - `hang` handler: returns empty JSON (do not hang up, stay on hold)
  - Always returns 200 to Vapi (prevents retries), even on internal errors

- Created `POST /api/pusher/auth` with:
  - BetterAuth session validation (403 if unauthenticated)
  - Form-encoded body parsing (socket_id, channel_name)
  - Call ownership check: extracts callId from channel name, verifies user owns the call
  - Returns `pusherServer.authorizeChannel()` response as JSON

### Task 2: Call cancel and active call check routes

- Created `POST /api/call/cancel` with:
  - BetterAuth authentication (401 if no session)
  - Zod validation of callId (UUID format)
  - Call ownership verification (404 if not found)
  - Terminal state guard (400 if already completed/failed)
  - Vapi termination via controlUrl POST (preferred) or SDK `calls.delete({ id })` (fallback)
  - Error-tolerant Vapi cancellation (call may have already ended)
  - Updates call to completed with "manually-canceled" endedReason
  - Inserts completion call_event and triggers Pusher call-ended event

- Created `GET /api/call/active` with:
  - BetterAuth authentication (401 if no session)
  - Queries most recent call where status is not completed/failed
  - Returns `{ hasActiveCall: true, callId }` or `{ hasActiveCall: false }`

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 88ef956 | feat(02-02): create Vapi webhook handler and Pusher auth endpoint |
| 2 | e22195c | feat(02-02): create call cancel and active call check routes |

## Decisions Made

1. **Vapi SDK DeleteCallDto** -- The SDK `calls.delete()` method expects a `DeleteCallDto` object `{ id: string }` not a plain string. Discovered during TypeScript compilation. This is consistent with the CreateCallsResponse union type quirk found in plan 02-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SDK calls.delete() expects DeleteCallDto object**
- **Found during:** Task 2 (tsc verification)
- **Issue:** `vapiClient.calls.delete(callRecord.vapiCallId)` fails TypeScript -- parameter type is `DeleteCallDto` not `string`
- **Fix:** Changed to `vapiClient.calls.delete({ id: callRecord.vapiCallId })`
- **Files modified:** src/app/api/call/cancel/route.ts
- **Commit:** e22195c

## Verification Results

- `npx tsc --noEmit` passes clean
- `npm run build` succeeds with no errors
- All 4 API routes appear in build output: /api/webhooks/vapi, /api/pusher/auth, /api/call/cancel, /api/call/active
- Webhook handler maps all Vapi status values (queued, ringing, in-progress, ended) to app statuses
- Webhook handler handles both status-update and end-of-call-report message types
- Pusher auth validates session and call ownership before authorizing channel
- Cancel route handles both controlUrl and SDK deletion approaches
- Active call route returns correct shape for both active and no-active-call cases

## Next Phase Readiness

Plan 02-03 (Call Status Page & Live UI) can proceed -- it depends on:
- `src/app/api/webhooks/vapi/route.ts` (exists) -- provides server-side event pipeline
- `src/app/api/pusher/auth/route.ts` (exists) -- authorizes private channel subscriptions
- `src/app/api/call/cancel/route.ts` (exists) -- enables cancel button on status page
- `src/app/api/call/active/route.ts` (exists) -- enables auto-redirect to active call
- `src/lib/pusher-client.ts` (exists from 02-01) -- client subscribes to call channel
- `src/lib/call-channel.ts` (exists from 02-01) -- shared channel name utility

## Self-Check: PASSED
