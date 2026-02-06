---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [better-auth, twilio, otp, sms, phone-auth, middleware, session]

requires:
  - phase: 01-01
    provides: Drizzle schema (user, session, account, verification tables), shadcn/ui, Toaster, env vars
provides:
  - BetterAuth server with Twilio Verify phone OTP and signUpOnVerification
  - Auth client with phoneNumberClient for React
  - Phone input page (/) with E.164 normalization
  - OTP verification page (/verify) with toast error handling
  - Route protection middleware for /select-isp, /select-issue, /confirm
  - 30-day persistent sessions with 7-day cookie cache
affects:
  - 01-03 (ISP selection page lives behind auth middleware)
  - All future phases (authenticated sessions required for call initiation)

tech-stack:
  added: []
  patterns:
    - BetterAuth with phoneNumber plugin delegating OTP to Twilio Verify (no self-generated codes)
    - signUpOnVerification auto-creates users with temp email on first phone verification
    - Middleware-based route protection using getSessionCookie
    - Phone number passed via URL search params between auth flow steps

key-files:
  created:
    - src/lib/twilio.ts
    - src/lib/auth.ts
    - src/lib/auth-client.ts
    - src/app/api/auth/[...all]/route.ts
    - src/middleware.ts
    - src/app/verify/page.tsx
    - src/components/phone-input.tsx
    - src/components/otp-input.tsx
  modified:
    - src/app/page.tsx

key-decisions:
  - "sendOTP does not await Twilio call -- BetterAuth handles the async flow, and the code param from BetterAuth is ignored since Twilio Verify generates its own codes"
  - "nextCookies() must be the last plugin in the BetterAuth plugins array (BetterAuth requirement)"
  - "Phone number passed via URL search params from / to /verify (avoids state loss on refresh)"
  - "Verify page uses Suspense boundary around useSearchParams (Next.js requirement for client components)"

duration: 3min
completed: 2026-02-06
---

# Phase 1 Plan 02: Phone Auth Flow Summary

**BetterAuth with Twilio Verify SMS OTP, phone input with E.164 normalization, OTP verification with toast errors, 30-day sessions, and middleware route protection**

## Performance

- **Duration:** 3 minutes
- **Started:** 2026-02-06T18:25:34Z
- **Completed:** 2026-02-06T18:28:50Z
- **Tasks:** 2/2
- **Files created/modified:** 9

## Accomplishments

- Configured BetterAuth server with drizzleAdapter, phoneNumber plugin delegating to Twilio Verify
- signUpOnVerification auto-creates users with temp email `{digits}@phone.easycallai.local`
- Session configured for 30-day expiry, daily refresh, 7-day cookie cache
- Auth client exports phoneNumberClient for React-side OTP send/verify
- API route handler at `/api/auth/[...all]` exports GET and POST
- Middleware protects `/select-isp`, `/select-issue`, `/confirm` -- redirects unauthenticated users to `/`
- Phone input component with US formatting mask and zod E.164 validation
- OTP input component with 6-digit validation and auto-focus
- Home page (`/`) with EasyCallAI branding, session-aware redirect, loading states
- Verify page (`/verify`) with OTP entry, resend functionality, and contextual toast errors

## Task Commits

1. **Task 1: Configure BetterAuth server and client with Twilio Verify integration** - `3665bd3` (feat)
2. **Task 2: Build phone input and OTP verification pages** - `fb2fa2f` (feat)

## Files Created/Modified

- `src/lib/twilio.ts` - Twilio Verify helpers (sendPhoneOTP, verifyPhoneOTP)
- `src/lib/auth.ts` - BetterAuth server config with phoneNumber plugin and 30-day sessions
- `src/lib/auth-client.ts` - BetterAuth React client with phoneNumberClient
- `src/app/api/auth/[...all]/route.ts` - BetterAuth API route handler (GET, POST)
- `src/middleware.ts` - Route protection for authenticated pages
- `src/app/page.tsx` - Phone number entry page with session check and loading states
- `src/app/verify/page.tsx` - OTP verification page with resend and toast errors
- `src/components/phone-input.tsx` - US phone input with format mask and E.164 normalization
- `src/components/otp-input.tsx` - 6-digit OTP input with auto-focus

## Decisions Made

1. **Twilio Verify delegation**: sendOTP callback does not await the Twilio call and ignores the `code` parameter from BetterAuth, since Twilio Verify generates and manages its own verification codes server-side.
2. **nextCookies last**: The `nextCookies()` plugin is placed last in the BetterAuth plugins array as required by BetterAuth for proper Next.js cookie handling.
3. **Phone via URL params**: Phone number is passed from `/` to `/verify` via URL search params (`?phone=...`) to survive page refreshes and avoid client-side state loss.
4. **Suspense for useSearchParams**: The verify page wraps content in a Suspense boundary because `useSearchParams()` requires it in Next.js client components.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Next.js 16 shows a deprecation warning for the `middleware` file convention, recommending the `proxy` convention instead. The middleware still functions correctly (listed as "Proxy (Middleware)" in the build output). Left as-is since it works and matches the plan specification.

## User Setup Required

Twilio account with Verify service and BetterAuth secret must be configured. See `.planning/phases/01-foundation/01-02-USER-SETUP.md` for setup instructions.

## Next Phase Readiness

- **Plan 01-03 (ISP Selection UI):** Auth flow is complete. Protected routes are configured. Users will be redirected to `/select-isp` after authentication. The ISP selection page, issue category picker, and confirmation page can be built behind the auth wall. ISP seed data from 01-01 is ready to query.

## Self-Check: PASSED

---
*Phase: 01-foundation*
*Completed: 2026-02-06*
