# Phase 4 Plan 02: Webhook Transfer Wiring Summary

**One-liner:** Wire human_detected webhook to fire-and-forget transfer orchestrator with stall instructions, guarding transfer statuses from Vapi overwrite

## Plan Details

- **Phase:** 04-transfer-bridging
- **Plan:** 02
- **Type:** execute
- **Subsystem:** webhooks, transfer
- **Tags:** vapi, transfer, webhook, stall-prompt, status-guard

## Dependency Graph

- **Requires:** 04-01 (transfer orchestrator, stall prompt, Twilio client, conference webhooks)
- **Provides:** Transfer triggering from human_detected, stall instructions to AI, status guards
- **Affects:** 04-03 (UI states depend on transfer statuses flowing correctly)

## Tech Stack

- **Added:** None (uses existing libraries)
- **Patterns:** Fire-and-forget async orchestration, transfer-managed status guards

## Key Files

### Modified

- `src/app/api/webhooks/vapi/route.ts` -- human_detected wired to orchestrateTransfer + stall instructions, transfer status guards on status-update and end-of-call-report
- `src/app/api/call/start/route.ts` -- phone number validation before call placement

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Validate user phone number in call start route | eb6bf1d | src/app/api/call/start/route.ts |
| 2 | Wire human_detected to transfer orchestrator with stall instructions | ab1fa09 | src/app/api/webhooks/vapi/route.ts |

## Decisions Made

| Decision | Context | Alternatives |
|----------|---------|-------------|
| Query user table for phone (option A: join at transfer time) | Avoids migration; phone already in user table via SMS auth | Option B: denormalize onto call record (requires migration) |
| Fire-and-forget with void promise | Transfer orchestration must not block 7.5s Vapi webhook timeout | Await with timeout (risky -- could hit webhook deadline) |
| Name fallback to "the customer" | BetterAuth sets name to phone number (contains no "@" but could be opaque) | Always use "the customer" (less personal) |
| Guard both status-update and end-of-call-report | When AI is dropped during transfer, Vapi sends ended status -- must not overwrite transferring/connected | Only guard end-of-call-report (misses status-update ended events) |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. `npm run build` -- PASSED
2. Webhook imports and calls `orchestrateTransfer` -- CONFIRMED
3. Webhook imports and uses `getStallInstructions` -- CONFIRMED
4. `end-of-call-report` guards transferring/connected -- CONFIRMED
5. `status-update` guards transferring/connected -- CONFIRMED
6. Call start route validates user phone number -- CONFIRMED

## Metrics

- **Duration:** ~2min
- **Completed:** 2026-02-06
- **Tasks:** 2/2

## Self-Check: PASSED
