# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.
**Current focus:** Phase 2 - Outbound Calling & Live Status

## Current Position

Phase: 2 of 4 (Outbound Calling & Live Status)
Plan: 2 of 3 in Phase 2
Status: In progress
Last activity: 2026-02-06 - Completed 02-02-PLAN.md

Progress: [█████░░░░░] 5/12 (42%)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 5min
- Total execution time: 0.37 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14min | 5min |
| 2. Outbound Calling | 2/3 | 10min | 5min |

**Recent Trend:**
- Last 5 plans: 3min, 5min, 6min, 4min
- Trend: stable (~4-5min/plan)

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

### Pending Todos

- ISP support phone numbers need to be populated in seed data for end-to-end testing

### Blockers/Concerns

- Human detection reliability is highest-risk unknown (Phase 3)
- Agent hangup during transfer gap is critical risk (Phase 4)
- Next.js 16 deprecates middleware file convention in favor of proxy (cosmetic warning, middleware still works)

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 02-02-PLAN.md
Resume file: None
