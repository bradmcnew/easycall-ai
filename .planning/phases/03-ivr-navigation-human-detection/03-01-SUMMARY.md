---
phase: 03-ivr-navigation-human-detection
plan: 01
subsystem: database
tags: [drizzle, jsonb, postgresql, phone-tree, ivr, seed-data]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "ISP and issue_category tables, seed infrastructure"
provides:
  - "isp_phone_tree table with JSONB tree column"
  - "PhoneTreeNode and IspPhoneTreeConfig TypeScript interfaces"
  - "Phone tree seed data for all 6 ISPs"
  - "Extended seed script with idempotent phone tree upsert"
affects: [03-02 (prompt builder consumes phone tree data), 03-03 (UI may display navigation state)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB column with $type<T>() for typed tree-shaped data"
    - "Upsert pattern: check existence then insert or update with version increment"

key-files:
  created:
    - src/lib/phone-tree-types.ts
    - src/data/phone-trees.ts
    - drizzle/0003_puzzling_titanium_man.sql
  modified:
    - src/db/schema.ts
    - src/db/seed.ts

key-decisions:
  - "Single JSONB column per ISP for phone tree data (not relational node tables)"
  - "Version column with auto-increment on seed re-run for tracking tree updates"
  - "Unique index on isp_id (one tree per ISP, not per category)"
  - "categoryMatchSlugs on leaf nodes maps categories to navigation paths"

patterns-established:
  - "Phone tree types in src/lib/phone-tree-types.ts for shared import"
  - "Seed data files in src/data/ with relative imports for tsx compatibility"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 3 Plan 1: Phone Tree Data Model Summary

**JSONB phone tree schema with typed interfaces and seed data for all 6 ISPs covering full IVR menu maps, timing, hold interruption patterns, and category-to-path mappings**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T22:49:30Z
- **Completed:** 2026-02-06T22:52:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PhoneTreeNode and IspPhoneTreeConfig TypeScript interfaces for typed JSONB data
- isp_phone_tree table with unique index on isp_id and version tracking
- Complete phone tree seed data for all 6 ISPs (Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink)
- Each tree includes language selection, main menu, sub-menus, hold queue nodes, hold interruption patterns, and navigation notes
- categoryMatchSlugs on tree nodes match each ISP's issue_category slugs exactly
- Seed script is fully idempotent with version increment on re-run

## Task Commits

Each task was committed atomically:

1. **Task 1: Phone tree types and database schema** - `3648172` (feat)
2. **Task 2: Phone tree seed data and extended seed script** - `897e453` (feat)

## Files Created/Modified
- `src/lib/phone-tree-types.ts` - PhoneTreeNode and IspPhoneTreeConfig interfaces
- `src/data/phone-trees.ts` - Phone tree seed data for all 6 ISPs
- `src/db/schema.ts` - Added ispPhoneTree table with JSONB column and jsonb import
- `src/db/seed.ts` - Extended with phone tree upsert logic
- `drizzle/0003_puzzling_titanium_man.sql` - Migration for isp_phone_tree table

## Decisions Made
- Used single JSONB column per ISP rather than relational node tables -- tree data is read as a whole for prompt embedding, never queried field-by-field
- Unique index on isp_id ensures one tree per ISP (categories are mapped via categoryMatchSlugs within the tree, not separate rows)
- Version column auto-increments on seed re-run to track when trees are updated
- Seed uses check-then-insert/update pattern rather than onConflictDoUpdate to cleanly increment version

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phone tree data is in the database and ready for Plan 02 (prompt builder) to consume
- TypeScript interfaces are exported for use in prompt generation and API routes
- All 6 ISPs have complete tree maps with category mappings

## Self-Check: PASSED

---
*Phase: 03-ivr-navigation-human-detection*
*Completed: 2026-02-06*
