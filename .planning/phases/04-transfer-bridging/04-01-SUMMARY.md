---
phase: 04-transfer-bridging
plan: 01
subsystem: transfer-orchestration
tags: [twilio, conference, transfer, stall, webhooks, vapi]
requires:
  - phase-02 (Vapi call infrastructure, pusher, call schema)
  - phase-03 (human_detected tool, webhook handler)
provides:
  - Transfer orchestrator (orchestrateTransfer, handleUserAnswered, handleUserNoAnswer, handleConferenceEnded, handleTransferFailure)
  - Stall prompt generator (getStallInstructions)
  - Shared Twilio client singleton (twilioClient)
  - Conference status webhook endpoint
  - Conference bridge TwiML fallback endpoint
affects:
  - 04-02 (wire human_detected to transfer orchestrator)
  - 04-03 (UI states for transferring/connected)
tech-stack:
  added: []
  patterns:
    - Twilio Conference Participant API for user callback + conference join
    - Approach B (primary): phoneCallProviderId redirect via twilioClient.calls().update({ twiml })
    - Approach A (fallback): controlUrl transfer to bridge number returning Conference TwiML
    - Vapi controlUrl for say/end-call live call control
    - Fire-and-forget async orchestration (no webhook timeout risk)
key-files:
  created:
    - src/lib/transfer-orchestrator.ts
    - src/lib/stall-prompt.ts
    - src/lib/twilio-client.ts
    - src/app/api/webhooks/twilio/conference-status/route.ts
    - src/app/api/webhooks/twilio/conference-bridge/route.ts
  modified: []
key-decisions:
  - Twilio Conference beep param is string type ("false"), not boolean -- SDK typing
  - vapiClient.calls.get() requires { id: string } object, not plain string (SDK v0.11)
  - Conference-bridge fallback uses status-based lookup (most recent transferring call) rather than CallSid matching
  - handleConferenceEnded only completes if status is currently "connected" (prevents overwriting failed status)
duration: 3min
completed: 2026-02-06
---

# Phase 4 Plan 01: Transfer Orchestrator & Conference Webhooks Summary

Server-side transfer state machine with Twilio conference bridging, dual-approach ISP call redirect (Approach B primary via phoneCallProviderId, Approach A fallback via bridge TwiML), stall prompt generator, and all failure mode handlers.

## Performance

- Duration: ~3 minutes
- Tasks: 2/2 completed
- Build: Clean (npm run build, npx tsc --noEmit)
- Lines added: 451 across 5 files

## Accomplishments

1. Created shared Twilio client singleton (`twilioClient`) for conference/call APIs, separate from OTP-only `twilio.ts`
2. Created stall prompt generator with transparent AI identification, polite/minimal tone, 30s max stall, and graceful give-up
3. Built full transfer orchestrator with 5 exported functions covering the complete transfer lifecycle
4. Implemented Twilio conference status webhook that routes participant callbacks (in-progress, no-answer, completed) to appropriate handlers
5. Implemented conference bridge TwiML endpoint as Approach A fallback for when phoneCallProviderId is unavailable

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create Twilio client singleton and stall prompt module | 0e6c616 | src/lib/twilio-client.ts, src/lib/stall-prompt.ts |
| 2 | Build transfer orchestrator and Twilio conference webhooks | 986ba66 | src/lib/transfer-orchestrator.ts, conference-status/route.ts, conference-bridge/route.ts |

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| src/lib/twilio-client.ts | Shared Twilio client singleton for conference/call APIs | 6 |
| src/lib/stall-prompt.ts | Stall instructions generator for AI transfer mode | 28 |
| src/lib/transfer-orchestrator.ts | Core transfer state machine (orchestrate, answer, no-answer, conference-end, failure) | 292 |
| src/app/api/webhooks/twilio/conference-status/route.ts | Twilio conference status callback handler | 64 |
| src/app/api/webhooks/twilio/conference-bridge/route.ts | TwiML endpoint for Approach A fallback | 61 |

## Files Modified

None.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Twilio beep param as string "false" not boolean | SDK types beep as string (values: "true", "false", "onEnter", "onExit") |
| vapiClient.calls.get({ id }) not get(string) | SDK v0.11 requires GetCallsRequest object, consistent with delete() pattern |
| Conference bridge uses status-based call lookup | Without stored phoneCallProviderId mapping, most recent transferring call is sufficient for single-user scenarios |
| Guard conference-ended on connected status | Prevents overwriting a "failed" status if conference-ended fires after user-no-answer |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Twilio beep parameter type**
- **Found during:** Task 2
- **Issue:** Plan specified `beep: false` (boolean) but Twilio SDK types `beep` as `string`
- **Fix:** Changed to `beep: "false"` (string)
- **Files modified:** src/lib/transfer-orchestrator.ts
- **Commit:** 986ba66

**2. [Rule 1 - Bug] Fixed Vapi calls.get() parameter type**
- **Found during:** Task 2
- **Issue:** Plan specified `vapiClient.calls.get(vapiCallId)` (string) but SDK requires `GetCallsRequest` object `{ id: string }`
- **Fix:** Changed to `vapiClient.calls.get({ id: callRecord.vapiCallId })`
- **Files modified:** src/lib/transfer-orchestrator.ts
- **Commit:** 986ba66

**3. [Rule 1 - Bug] Removed unused `user` import**
- **Found during:** Task 2
- **Issue:** Initial implementation imported `user` from schema but doesn't use it (user phone is passed as parameter)
- **Fix:** Removed unused import
- **Files modified:** src/lib/transfer-orchestrator.ts
- **Commit:** 986ba66

## Issues Encountered

None. Both type errors were caught by `npx tsc --noEmit` and fixed before commit.

## Next Phase Readiness

**Ready for 04-02:**
- Transfer orchestrator exports all functions needed by the webhook wiring
- `getStallInstructions(userName)` ready for injection into tool-call response
- `orchestrateTransfer()` accepts the exact params available from human_detected handler (callId, vapiCallId, vapiControlUrl, userPhone)
- Conference webhooks are deployed at known URLs

**Remaining for 04-02:**
- Wire human_detected tool-call handler to call orchestrateTransfer (fire-and-forget)
- Replace current tool result with stall instructions from getStallInstructions
- Look up user's phone number from session/call record to pass to orchestrateTransfer

**No blockers.**

## Self-Check: PASSED
