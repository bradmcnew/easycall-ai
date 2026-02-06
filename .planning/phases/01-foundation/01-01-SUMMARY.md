---
phase: 01-foundation
plan: 01
subsystem: project-init
tags: [nextjs, drizzle, postgresql, shadcn, tailwind, typescript]

requires:
  - phase: none
    provides: first plan
provides:
  - Next.js 16 project scaffold with TypeScript, Tailwind CSS 4, App Router
  - Drizzle ORM PostgreSQL schema with 8 tables (4 BetterAuth + 4 application)
  - ISP seed data (6 ISPs, 27 per-ISP issue categories)
  - shadcn/ui component library with button, card, input, label, sonner
affects:
  - 01-02 (auth flow uses schema tables, Toaster, env vars)
  - 01-03 (ISP selection UI uses ISP_DATA and shadcn components)
  - All future phases (build on this foundation)

tech-stack:
  added:
    - next@16.1.6
    - better-auth@1.4.18
    - drizzle-orm@0.45.1
    - drizzle-kit@0.31.8
    - pg@8.18.0
    - twilio@5.12.1
    - zod@4.3.6
    - react-hook-form@7.71.1
    - "@hookform/resolvers@5.2.2"
    - sonner@2.0.7
    - shadcn@3.8.4
    - tsx@4.21.0
    - dotenv@17.2.4
  patterns:
    - App Router with src directory
    - Drizzle schema-first migrations (generate + migrate)
    - Static data as TypeScript const with database seeding
    - .env.local for local development secrets

key-files:
  created:
    - src/db/schema.ts
    - src/db/index.ts
    - src/db/seed.ts
    - src/data/isps.ts
    - drizzle.config.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/globals.css
    - src/components/ui/button.tsx
    - src/components/ui/card.tsx
    - src/components/ui/input.tsx
    - src/components/ui/label.tsx
    - src/components/ui/sonner.tsx
    - src/lib/utils.ts
    - components.json
    - drizzle/0000_bizarre_plazm.sql
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "Used dotenv with path .env.local instead of dotenv/config for drizzle.config.ts and seed.ts (dotenv/config only loads .env, not .env.local)"
  - "Seed script creates its own db connection instead of importing from src/db/index.ts to avoid Next.js path alias issues with tsx"
  - "Used onConflictDoNothing for idempotent seeding (ISPs and categories can be re-seeded safely)"

duration: 6min
completed: 2026-02-06
---

# Phase 1 Plan 01: Project Init and Database Summary

**Next.js 16 scaffold with Drizzle PostgreSQL schema (8 tables), ISP seed data (6 ISPs, 27 categories), and shadcn/ui component library**

## Performance

- **Duration:** 6 minutes
- **Started:** 2026-02-06T18:15:29Z
- **Completed:** 2026-02-06T18:21:44Z
- **Tasks:** 2/2
- **Files modified:** 26

## Accomplishments

- Initialized a complete Next.js 16.1.6 project with TypeScript, Tailwind CSS 4, ESLint, and App Router
- Installed all project dependencies (better-auth, drizzle-orm, pg, twilio, zod, react-hook-form)
- Set up shadcn/ui with 5 components (button, card, input, label, sonner) and Toaster in root layout
- Created full database schema with 8 tables and 2 enums matching the research specification
- Seeded 6 ISPs with 27 per-ISP issue categories (idempotent via onConflictDoNothing)
- Configured Drizzle Kit with generate/migrate/seed npm scripts

## Task Commits

1. **Task 1: Initialize Next.js 16 project with all dependencies and shadcn/ui** - `e6fef97` (feat)
2. **Task 2: Create database schema, ISP data, run migrations, and seed** - `0b791c5` (feat)

## Files Created/Modified

- `src/db/schema.ts` - All Drizzle table definitions (4 BetterAuth + 4 application tables, 2 enums)
- `src/db/index.ts` - Drizzle client instance with pg Pool
- `src/db/seed.ts` - ISP and category seed script with idempotent upserts
- `src/data/isps.ts` - Static ISP data source of truth (6 ISPs, 27 categories)
- `drizzle.config.ts` - Drizzle Kit config pointing to schema and .env.local
- `src/app/layout.tsx` - Root layout with Geist fonts, Toaster at top-center
- `src/app/globals.css` - Tailwind CSS 4 with shadcn CSS variables
- `src/components/ui/` - 5 shadcn components (button, card, input, label, sonner)
- `package.json` - All dependencies and db:generate/db:migrate/db:seed scripts
- `drizzle/0000_bizarre_plazm.sql` - Initial migration with all tables

## Decisions Made

1. **dotenv path configuration**: Used `config({ path: ".env.local" })` instead of `import "dotenv/config"` because dotenv/config only loads `.env` by default, not `.env.local` which is the Next.js convention for local secrets.
2. **Seed script standalone connection**: The seed script creates its own database Pool rather than importing from `src/db/index.ts` to avoid path alias resolution issues when running with tsx outside the Next.js build system.
3. **Idempotent seeding**: Used `onConflictDoNothing()` so the seed script can be safely re-run without duplicating data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] dotenv not loading .env.local**
- **Found during:** Task 2, Step 6 (run migrations)
- **Issue:** `import "dotenv/config"` only loads `.env` file, but Next.js convention uses `.env.local` for local development secrets. Drizzle Kit migrate failed with "url: undefined".
- **Fix:** Changed to `import { config } from "dotenv"; config({ path: ".env.local" });` in both drizzle.config.ts and seed.ts.
- **Files modified:** drizzle.config.ts, src/db/seed.ts
- **Commit:** 0b791c5

**2. [Rule 3 - Blocking] create-next-app rejects non-empty directory**
- **Found during:** Task 1, Step 1
- **Issue:** `npx create-next-app@latest . --yes` refuses to run because the directory contains `.planning/` folder.
- **Fix:** Created the Next.js project in a temp directory and copied all files over, preserving the existing repo structure.
- **Commit:** e6fef97

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

PostgreSQL must be running locally with a database named `easycallai`. See `.planning/phases/01-foundation/USER-SETUP.md` for setup instructions.

## Next Phase Readiness

- **Plan 01-02 (Auth):** All BetterAuth tables exist (user, session, account, verification). Drizzle client is ready. Toaster is mounted for OTP error messages. Twilio env vars are templated.
- **Plan 01-03 (ISP UI):** ISP data is seeded in the database. ISP_DATA is available as a TypeScript import. shadcn components (button, card, input, label) are ready for UI work.

## Self-Check: PASSED

---
*Phase: 01-foundation*
*Completed: 2026-02-06*
