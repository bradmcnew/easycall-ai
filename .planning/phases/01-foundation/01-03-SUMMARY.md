---
phase: 01-foundation
plan: 03
subsystem: ui
tags: [nextjs, shadcn, server-components, drizzle, tailwind, svg]

requires:
  - phase: 01-01
    provides: ISP seed data, shadcn/ui components, Drizzle schema
provides:
  - ISP selection grid page (/select-isp) with branded card layout
  - Per-ISP issue category selection page (/select-issue) with optional note
  - Confirmation/review page (/confirm) with change links
  - Step indicator component spanning all 5 flow steps
  - ISP logo SVG placeholders
affects:
  - Phase 2 (confirm page is integration point for call initiation)

tech-stack:
  added: []
  patterns:
    - Server components for data fetching (ISPs, categories from DB)
    - URL search params for state between pages (isp slug, category slug, note)
    - Client component for interactive form (select-issue-form)
    - Step indicator reads usePathname for current step

key-files:
  created:
    - src/app/select-isp/page.tsx
    - src/app/select-issue/page.tsx
    - src/app/select-issue/select-issue-form.tsx
    - src/app/confirm/page.tsx
    - src/components/step-indicator.tsx
    - src/components/isp-card.tsx
    - src/components/issue-button.tsx
    - public/logos/comcast.svg
    - public/logos/att.svg
    - public/logos/spectrum.svg
    - public/logos/verizon.svg
    - public/logos/cox.svg
    - public/logos/centurylink.svg
  modified:
    - src/app/layout.tsx
    - src/db/schema.ts

key-decisions:
  - "URL search params for inter-page state (ISP slug, category slug, note) instead of client-side state"
  - "Server components for ISP and category data fetching from database"
  - "Client component (select-issue-form) for interactive category selection with note field"
  - "Added unique constraint on issue_category(isp_id, slug) to prevent seed duplicates"

duration: 5min
completed: 2026-02-06
---

# Phase 1 Plan 03: ISP Selection & Confirmation UI Summary

**Multi-step ISP selection flow with branded card grid, per-ISP issue categories from database, optional note field, and review/confirmation page with step indicator**

## Performance

- **Duration:** 5 minutes
- **Started:** 2026-02-06T18:25:00Z
- **Completed:** 2026-02-06T18:30:00Z
- **Tasks:** 3/3 (2 auto + 1 checkpoint verified)
- **Files modified:** 16

## Accomplishments

- Built ISP selection page with 6 branded cards in responsive 2x3 grid, each with brand-colored SVG logo placeholders
- Created per-ISP issue category selection page with categories fetched from database (not hardcoded), optional note textarea, and click-to-select + Continue pattern
- Built confirmation/review page showing ISP, category, and note with change/edit links back to relevant pages
- Implemented step indicator component spanning all 5 flow steps with completed/current/upcoming states and clickable navigation
- Fixed duplicate category bug by adding unique constraint on issue_category(isp_id, slug)

## Task Commits

1. **Task 1: ISP selection page with branded card grid and step indicator** - `edecd9d` (feat)
2. **Task 2: Issue category selection and confirmation pages** - `9dd626c` (feat)
3. **Task 3: Verify complete Phase 1 flow** - checkpoint approved by user

**Bug fix:** `c1d27ab` (fix: unique constraint on issue_category)

## Files Created/Modified

- `src/app/select-isp/page.tsx` - Server component: ISP grid page (step 3)
- `src/app/select-issue/page.tsx` - Server component: category selection page (step 4)
- `src/app/select-issue/select-issue-form.tsx` - Client component: interactive category picker with note
- `src/app/confirm/page.tsx` - Server component: review page (step 5)
- `src/components/step-indicator.tsx` - Client component: 5-step progress dots with route-based highlighting
- `src/components/isp-card.tsx` - ISP card with logo and name
- `src/components/issue-button.tsx` - Issue category button with label and description
- `src/app/layout.tsx` - Updated with StepIndicator and centered container
- `public/logos/*.svg` - 6 ISP logo SVG placeholders with brand colors
- `src/db/schema.ts` - Added uniqueIndex on issue_category(ispId, slug)

## Decisions Made

1. **URL search params for state:** Used URL params (?isp=comcast&category=billing&note=...) to pass state between pages instead of client-side state management. Works with refresh and browser back.
2. **Server + Client component split:** Server components fetch data from DB, client component handles interactive category selection with note field.
3. **Unique constraint fix:** Added unique index on (isp_id, slug) to prevent duplicate categories when seed runs multiple times.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate categories in database**
- **Found during:** Checkpoint verification (user reported duplicates)
- **Issue:** issue_category table had no unique constraint on (isp_id, slug), allowing seed to create duplicates on re-run
- **Fix:** Added uniqueIndex, deleted duplicates, re-migrated and re-seeded
- **Files modified:** src/db/schema.ts, drizzle/0001_overconfident_gambit.sql
- **Committed in:** c1d27ab

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix was necessary for correct category display. No scope creep.

## Issues Encountered

None beyond the auto-fixed duplicate bug.

## User Setup Required

None - no additional external service configuration required for this plan.

## Next Phase Readiness

- Phase 1 complete: Full user flow from phone auth through ISP/issue selection to confirmation
- Phase 2 integration point: /confirm page has disabled "Start Call" button ready for call initiation
- All ISP and category data in database, queryable for call placement logic

---
*Phase: 01-foundation*
*Completed: 2026-02-06*
