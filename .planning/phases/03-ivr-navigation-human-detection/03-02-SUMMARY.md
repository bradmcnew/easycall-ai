---
phase: 03-ivr-navigation-human-detection
plan: 02
subsystem: api
tags: [vapi, dtmf, ivr, prompt-engineering, pusher, webhooks, tools]

# Dependency graph
requires:
  - phase: 03-ivr-navigation-human-detection
    plan: 01
    provides: "isp_phone_tree table, PhoneTreeNode/IspPhoneTreeConfig types, seed data"
  - phase: 02-outbound-calling-live-status
    provides: "Vapi call start route, webhook handler, Pusher infrastructure"
provides:
  - "buildNavigationPrompt function for ISP-specific system prompts"
  - "DTMF tool, human_detected function tool, navigation_status function tool on assistant"
  - "Webhook handlers for tool-calls and transcript events"
  - "Live transcript forwarding to Pusher"
  - "agent_detected status transition on human detection"
affects: [03-03 (UI consumes transcript and navigation_status Pusher events)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type assertion spread for untyped SDK fields: ...({ tools: [...] } as Record<string, unknown>)"
    - "Flexible tool parameter parsing (handles both SDK webhook formats)"
    - "Prompt-driven IVR navigation with structured phone tree map"

key-files:
  created:
    - src/lib/prompt-builder.ts
  modified:
    - src/app/api/call/start/route.ts
    - src/app/api/webhooks/vapi/route.ts

key-decisions:
  - "Type assertion spread for tools array (SDK v0.11 does not type tools on CreateAssistantDto)"
  - "Flexible tool parameter parsing handles both toolCall.function.arguments (string) and toolCall.parameters (object) formats"
  - "in-progress Vapi status maps to navigating (not on_hold) -- Phase 3 calls start with IVR navigation"
  - "Silent first message (space) lets IVR speak first without AI interruption"
  - "1.5s startSpeakingPlan wait to avoid interrupting IVR menu options"

patterns-established:
  - "Prompt builder in src/lib/prompt-builder.ts for ISP-specific prompt generation"
  - "Tool-calls webhook returns { results: [{ toolCallId, result }] } JSON format"
  - "Only final transcripts forwarded to Pusher (partials ignored to avoid flooding)"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 3 Plan 2: Prompt Builder & IVR Navigation Backend Summary

**ISP-specific navigation prompts from phone tree data, DTMF + function tools on Vapi assistant, webhook handlers for tool-calls and live transcript forwarding**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T22:57:03Z
- **Completed:** 2026-02-06T23:00:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- buildNavigationPrompt generates comprehensive system prompts with phone tree map, navigation rules, stuck recovery, hold behavior, human detection instructions, and status reporting
- Vapi assistant configured with DTMF tool, human_detected function tool (async), and navigation_status function tool (async)
- Webhook handler processes tool-calls (human_detected updates call to agent_detected with Pusher alert, navigation_status updates call status) and transcript events (forwards final transcripts to Pusher)
- in-progress Vapi status correctly maps to navigating (IVR navigation phase) instead of on_hold

## Task Commits

Each task was committed atomically:

1. **Task 1: Prompt builder and enhanced call start route** - `548bfeb` (feat)
2. **Task 2: Expanded webhook handler for tool-calls and transcripts** - `b49f7d3` (feat)

## Files Created/Modified
- `src/lib/prompt-builder.ts` - buildNavigationPrompt function and formatTreeForPrompt helper for ISP-specific system prompts
- `src/app/api/call/start/route.ts` - Phone tree lookup, prompt builder integration, DTMF + function tools, expanded serverMessages, startSpeakingPlan, silent firstMessage
- `src/app/api/webhooks/vapi/route.ts` - tool-calls handler (human_detected, navigation_status), transcript handler, updated status mappings

## Decisions Made
- Used type assertion spread for tools array since SDK v0.11 does not include tools on CreateAssistantDto (same pattern as silenceTimeoutSeconds)
- Flexible tool parameter parsing handles both `toolCall.function.arguments` (JSON string) and `toolCall.parameters` (object) formats for Vapi webhook compatibility
- Changed in-progress mapping from on_hold to navigating since Phase 3 calls begin with IVR navigation before reaching any hold queue
- Silent first message (single space) prevents AI from speaking before the IVR starts
- Generic fallback prompt if no phone tree record exists (AI navigates dynamically)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript error for `tools` property on CreateAssistantDto -- resolved by wrapping in spread type assertion `...({ tools: [...] } as Record<string, unknown>)`, same pattern already established for silenceTimeoutSeconds

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend is fully ready for Phase 3 Plan 3 (UI enhancements)
- Pusher events available: status-change (with agent_detected, navigating, on_hold), transcript (role, text, timestamp)
- Call status flow: pending -> dialing -> navigating -> on_hold -> agent_detected -> completed/failed

## Self-Check: PASSED

---
*Phase: 03-ivr-navigation-human-detection*
*Completed: 2026-02-06*
