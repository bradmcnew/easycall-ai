# Phase 4 Plan 4: Vapi Warm Transfer Pivot Summary

**One-liner:** Replaced Twilio Conference transfer infrastructure with Vapi native warm-transfer-experimental, deleting 4 files (420 lines) and wiring transferCall tool end-to-end

---

## What Was Done

### Task 1: Delete Twilio Conference files and update stall prompt
**Commit:** `892dc68`

Deleted all Twilio Conference infrastructure:
- `src/lib/transfer-orchestrator.ts` (292 lines) -- conference orchestration state machine
- `src/lib/twilio-client.ts` (6 lines) -- shared Twilio client for conference APIs
- `src/app/api/webhooks/twilio/conference-status/route.ts` (64 lines) -- conference participant status callback
- `src/app/api/webhooks/twilio/conference-bridge/route.ts` (61 lines) -- TwiML conference bridge endpoint
- Removed entire `src/app/api/webhooks/twilio/` directory

Updated `src/lib/stall-prompt.ts` with warm-transfer-aware instructions:
- AI must call `transferCall` tool immediately after introducing itself
- Removed 30-second timeout (transfer assistant handles timeout)
- Removed "do not say goodbye" rule (AI auto-disconnects on warm transfer)
- Simplified to two-step flow: introduce, then transferCall

### Task 2: Add transferCall tool and update webhook handler
**Commit:** `136daee`

**call/start/route.ts:**
- Added `transferCall` tool to assistant `model.tools` with `warm-transfer-experimental` mode
- Configured transfer assistant (gpt-4o-mini, 45s max, 20s silence timeout, speaks first)
- Configured fallback plan (apologize and end call if user unavailable)
- Added `"transfer-update"` to `serverMessages` for transfer visibility
- User phone number from `userRecord.phoneNumber` as transfer destination

**webhooks/vapi/route.ts:**
- Removed `orchestrateTransfer` import (deleted module)
- Simplified `human_detected` handler: sets `transferring` status, returns stall instructions (no fire-and-forget orchestrator)
- Added warm transfer outcome detection in `end-of-call-report`:
  - `assistant-forwarded-call` -> status `connected` (successful transfer)
  - `warm-transfer-assistant-cancelled` -> status `failed` with `user-no-answer` reason
- Removed transfer-managed status guards from both `status-update` and `end-of-call-report` (Vapi end-of-call-report is now authoritative)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Vapi warm-transfer-experimental replaces Twilio Conference | Eliminates 4 files, separate phone number, conference webhooks, and complex call-leg management |
| AI calls transferCall tool (not server-side controlUrl) | Warm transfer is triggered by the AI, not by server-side orchestration |
| Transfer assistant uses gpt-4o-mini with 45s timeout | Lightweight model for brief "connecting you now" interaction |
| end-of-call-report is authoritative for transfer outcomes | No separate conference webhooks to manage status; Vapi reports transfer results directly |
| Removed transfer status guards | With Vapi managing the full transfer lifecycle, end-of-call-report events should update status normally |

## Deviations from Plan

None -- plan executed exactly as written.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `892dc68` | Delete Twilio Conference files and update stall prompt |
| 2 | `136daee` | Add transferCall tool and warm transfer webhook handling |

## Verification Results

All 8 verification checks passed:
1. `npm run build` -- zero errors
2. No `transfer-orchestrator` references in src/
3. No `twilio-client` references in src/
4. `transferCall` present in call/start/route.ts
5. `warm-transfer-experimental` present in call/start/route.ts
6. `assistant-forwarded-call` present in webhooks/vapi/route.ts
7. `transferCall` present in stall-prompt.ts
8. All 4 Twilio Conference files confirmed deleted

## Key Files

**Modified:**
- `src/app/api/call/start/route.ts` -- transferCall tool with warm-transfer-experimental config
- `src/app/api/webhooks/vapi/route.ts` -- simplified human_detected, warm transfer outcome handling
- `src/lib/stall-prompt.ts` -- transferCall directive in stall instructions

**Deleted:**
- `src/lib/transfer-orchestrator.ts`
- `src/lib/twilio-client.ts`
- `src/app/api/webhooks/twilio/conference-status/route.ts`
- `src/app/api/webhooks/twilio/conference-bridge/route.ts`

## Duration

~2 minutes

---

*Plan: 04-04 | Phase: 04-transfer-bridging | Completed: 2026-02-06*

## Self-Check: PASSED
