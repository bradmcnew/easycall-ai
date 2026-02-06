# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.
**Current focus:** Phase 1 - Foundation

## Current Position

Phase: 1 of 4 (Foundation)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-06 - Completed 01-02-PLAN.md (phone auth flow)

Progress: [██░░░░░░░░░░] 2/12 (~17%)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 5min
- Total execution time: 0.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2/3 | 9min | 5min |

**Recent Trend:**
- Last 5 plans: 6min, 3min
- Trend: improving

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
- Verify page uses Suspense for useSearchParams (Next.js requirement)

### Pending Todos

None yet.

### Blockers/Concerns

- Twilio 10DLC registration takes 1-5 business days (start early in Phase 1)
- Human detection reliability is highest-risk unknown (Phase 3)
- Agent hangup during transfer gap is critical risk (Phase 4)
- Next.js 16 deprecates middleware file convention in favor of proxy (cosmetic warning, middleware still works)

## Session Continuity

Last session: 2026-02-06T18:28:50Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
