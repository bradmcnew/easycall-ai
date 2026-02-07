# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.
**Current focus:** Phase 4 in progress (Transfer & Bridging)

## Current Position

Phase: 4 of 4 (Transfer & Bridging)
Plan: 2 of 3 in Phase 4
Status: In progress
Last activity: 2026-02-06 - Completed 04-02-PLAN.md

Progress: [███████████░] 11/12 (92%)

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 5min
- Total execution time: 0.79 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14min | 5min |
| 2. Outbound Calling | 3/3 | 18min | 6min |
| 3. IVR Navigation | 3/3 | 11min | 4min |
| 4. Transfer & Bridging | 2/3 | 5min | 3min |

**Recent Trend:**
- Last 5 plans: 3min, 3min, 5min, 3min, 2min
- Trend: stable (~3min/plan)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Twilio is mandatory for warm transfer (Vapi constraint)
- Pusher for real-time updates (Vercel SSE has 25s timeout, unusable for 30+ min holds)
- ISP phone trees stored as data, not code (maintainability)
- Transient Vapi assistants per call (ISP-specific prompt generation)
- Use dotenv with explicit path .env.local (not dotenv/config) for Drizzle scripts
- Seed script uses standalone db connection (avoids Next.js path alias issues with tsx)
- sendOTP ignores BetterAuth code param -- Twilio Verify generates its own codes
- nextCookies() must be last plugin in BetterAuth array
- Phone number passed via URL search params between auth flow steps
- URL search params for inter-page state (ISP slug, category slug, note)
- Added unique constraint on issue_category(isp_id, slug)
- silenceTimeoutSeconds passed via type assertion (SDK v0.11 omits from CreateAssistantDto)
- Webhook secret via server.headers['x-vapi-secret'] (SDK Server type has no secret field)
- DB call record created BEFORE Vapi API call to prevent webhook race condition
- vapiClient.calls.delete() requires DeleteCallDto object { id: string }, not plain string
- Single JSONB column per ISP for phone tree data (not relational node tables)
- Unique index on isp_id (one tree per ISP, categories mapped via categoryMatchSlugs within tree)
- Version column on isp_phone_tree for tracking tree updates
- Type assertion spread for tools array (SDK v0.11 does not type tools on CreateAssistantDto)
- in-progress Vapi status maps to navigating (not on_hold) for Phase 3 IVR navigation
- Silent first message (space) lets IVR speak first without AI interruption
- 1.5s startSpeakingPlan wait to avoid interrupting IVR menu options
- Vapi SDK tools must be on model object, not assistant object (discovered during Phase 3 testing)
- Transcript labels: AI for assistant role, Phone for user/IVR role
- Twilio Conference beep param is string type ("false"), not boolean (SDK typing)
- vapiClient.calls.get() requires { id: string } object, not plain string (SDK v0.11)
- Conference-bridge fallback uses status-based lookup (most recent transferring call)
- Query user table for phone at transfer time (avoids migration; join via call.userId FK)
- Fire-and-forget orchestrateTransfer with void promise (must not block 7.5s Vapi webhook timeout)
- Guard both status-update and end-of-call-report against overwriting transferring/connected statuses

### Pending Todos

- ISP support phone numbers need to be populated in seed data for end-to-end testing

### Blockers/Concerns

- Agent hangup during transfer gap is critical risk (Phase 4)
- Next.js 16 deprecates middleware file convention in favor of proxy (cosmetic warning, middleware still works)

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 04-02-PLAN.md
Resume file: None
