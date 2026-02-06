# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.
**Current focus:** Phase 3 complete - Ready for Phase 4 (Transfer & Bridging)

## Current Position

Phase: 3 of 4 (IVR Navigation & Human Detection)
Plan: 3 of 3 in Phase 3
Status: Phase complete
Last activity: 2026-02-06 - Completed 03-03-PLAN.md

Progress: [█████████░] 9/12 (75%)

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 5min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14min | 5min |
| 2. Outbound Calling | 3/3 | 18min | 6min |
| 3. IVR Navigation | 3/3 | 11min | 4min |

**Recent Trend:**
- Last 5 plans: 4min, 8min, 3min, 3min, 5min
- Trend: stable (~4min/plan)

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

### Pending Todos

- ISP support phone numbers need to be populated in seed data for end-to-end testing

### Blockers/Concerns

- Agent hangup during transfer gap is critical risk (Phase 4)
- Next.js 16 deprecates middleware file convention in favor of proxy (cosmetic warning, middleware still works)

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 03-03-PLAN.md (Phase 3 complete)
Resume file: None
