# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.
**Current focus:** Phase 2 - Outbound Calling & Live Status

## Current Position

Phase: 1 of 4 (Foundation) -- COMPLETE
Plan: 3 of 3 in Phase 1
Status: Phase 1 complete, ready for Phase 2
Last activity: 2026-02-06 - Phase 1 verified and complete

Progress: [██░░░░░░░░] 3/12 (25%)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 5min
- Total execution time: 0.23 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14min | 5min |

**Recent Trend:**
- Last 5 plans: 6min, 3min, 5min
- Trend: stable (~5min/plan)

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

### Pending Todos

None yet.

### Blockers/Concerns

- Human detection reliability is highest-risk unknown (Phase 3)
- Agent hangup during transfer gap is critical risk (Phase 4)
- Next.js 16 deprecates middleware file convention in favor of proxy (cosmetic warning, middleware still works)

## Session Continuity

Last session: 2026-02-06
Stopped at: Phase 1 complete
Resume file: None
