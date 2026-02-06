# Phase 1: Foundation - Research

**Researched:** 2026-02-06
**Domain:** Authentication (BetterAuth + Twilio), Database (Drizzle + PostgreSQL), UI (shadcn/ui + Next.js)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth flow:**
- Single phone number input -- system detects new vs returning user automatically (no separate sign up / log in)
- After OTP verification, user goes straight to ISP selection -- no welcome screen or dashboard
- Toast notifications (shadcn toast) for OTP errors (wrong code, delivery failure, expired code)
- Persistent sessions -- user stays logged in until explicit logout, survives browser restarts

**UI framework:**
- shadcn components for all UI throughout the app
- Use the frontend-design skill for all frontend implementation work

**ISP selection:**
- 6 ISPs: Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink
- Name and logo only -- no subtitles, hold times, or extra metadata
- Browse only -- no search bar (6 items doesn't warrant it)
- Only supported ISPs shown -- no "my ISP isn't listed" fallback

**Issue category picker:**
- Categories are per-ISP, not universal -- each ISP defines its own available categories based on their phone tree
- Optional free-text note field after category selection -- user can describe their issue briefly
- Issue category presentation and confirmation step: Claude's discretion

**Page flow:**
- Step indicator showing progress through the flow (e.g., step dots)
- Page structure (single page vs separate routes), back navigation behavior, and visual direction: Claude's discretion

### Claude's Discretion
- ISP selection layout (grid cards vs list vs other)
- Issue category presentation style (buttons vs cards with descriptions)
- Confirmation step after selections (review screen vs direct)
- Page structure (single page transitions vs separate routes)
- Back navigation behavior
- Visual design direction (minimal, warm, bold, etc.)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 1 covers three domains: phone-based authentication via BetterAuth with Twilio Verify for SMS OTP, database schema via Drizzle ORM with PostgreSQL, and a multi-step UI flow built with shadcn/ui on Next.js 16. The critical integration point is BetterAuth's phone number plugin connected to Twilio Verify for OTP delivery and verification -- this avoids the 10DLC registration process entirely (which now takes 10-15 days for campaign review) since Twilio Verify manages its own phone number pool and compliance.

The project starts from scratch (no package.json exists yet). The standard approach is: initialize Next.js 16 with TypeScript and Tailwind, add shadcn/ui, configure Drizzle ORM with PostgreSQL, set up BetterAuth with the phone number plugin and Drizzle adapter, integrate Twilio Verify for SMS delivery, then build the multi-step flow (phone input, OTP verification, ISP selection, issue category, optional note).

**Primary recommendation:** Use Twilio Verify (not Programmable Messaging) for OTP delivery to completely bypass 10DLC registration. Use BetterAuth's `signUpOnVerification` to auto-create accounts on first OTP verification, achieving the "single input, auto-detect new vs returning" requirement with zero extra logic.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.x | React framework with App Router | Project constraint; latest stable is 16.1.6 |
| better-auth | 1.4.x | Authentication framework | Project constraint; phone number plugin built-in |
| drizzle-orm | 0.45.x | TypeScript ORM | Project constraint; type-safe schema, Drizzle adapter for BetterAuth |
| drizzle-kit | latest | Migration CLI | Companion to drizzle-orm for schema generation and migrations |
| pg | latest | PostgreSQL driver (node-postgres) | Standard driver for Drizzle with PostgreSQL |
| twilio | latest | Twilio SDK for Verify API | SMS OTP delivery via Verify service |
| tailwindcss | 4.x | Utility CSS framework | Project constraint; included with Next.js 16 init |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (CLI) | latest | Component library | All UI components -- init with `npx shadcn@latest init` |
| sonner | (via shadcn) | Toast notifications | OTP errors, success messages -- shadcn wraps this |
| zod | latest | Schema validation | Phone number validation, form validation |
| react-hook-form | latest | Form state management | Phone input and OTP input forms |
| @hookform/resolvers | latest | Zod integration for react-hook-form | Connect zod schemas to forms |
| dotenv | latest | Environment variables | Local development DATABASE_URL, Twilio credentials |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Twilio Verify | Twilio Programmable Messaging | Would require 10DLC registration (10-15 day review), no fraud protection, need to buy phone number |
| pg (node-postgres) | postgres.js | postgres.js is newer but pg has better BetterAuth ecosystem support |
| Drizzle 0.45 stable | Drizzle 1.0-beta | Beta has new features but not production-stable |

**Installation:**
```bash
# Initialize Next.js 16 project
npx create-next-app@latest easycallai --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Core dependencies
npm install better-auth drizzle-orm pg twilio zod react-hook-form @hookform/resolvers

# Dev dependencies
npm install -D drizzle-kit @types/pg

# shadcn/ui init (run after Next.js init)
npx shadcn@latest init

# shadcn components needed for Phase 1
npx shadcn@latest add button card input label sonner
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...all]/
│   │           └── route.ts          # BetterAuth API handler
│   ├── layout.tsx                     # Root layout with Toaster
│   ├── page.tsx                       # Landing / phone input (step 1)
│   ├── verify/
│   │   └── page.tsx                   # OTP verification (step 2)
│   ├── select-isp/
│   │   └── page.tsx                   # ISP selection (step 3)
│   ├── select-issue/
│   │   └── page.tsx                   # Issue category + note (step 4)
│   └── confirm/
│       └── page.tsx                   # Review & confirm (step 5)
├── components/
│   ├── ui/                            # shadcn components (auto-generated)
│   ├── step-indicator.tsx             # Progress dots component
│   ├── phone-input.tsx                # Phone number input with formatting
│   ├── otp-input.tsx                  # OTP code input
│   ├── isp-card.tsx                   # ISP selection card
│   └── issue-button.tsx               # Issue category button
├── db/
│   ├── index.ts                       # Drizzle client instance
│   ├── schema.ts                      # All Drizzle table definitions
│   └── seed.ts                        # ISP and category seed data
├── lib/
│   ├── auth.ts                        # BetterAuth server config
│   ├── auth-client.ts                 # BetterAuth client config
│   └── twilio.ts                      # Twilio Verify helpers
├── data/
│   └── isps.ts                        # ISP static data (names, logos, categories)
└── middleware.ts                       # Auth route protection
```

### Pattern 1: BetterAuth Phone OTP with Twilio Verify

**What:** Use Twilio Verify to handle OTP generation, delivery, and verification. BetterAuth's phone number plugin delegates both sending and verifying to Twilio.

**When to use:** Always for this project -- Twilio Verify bypasses 10DLC registration.

**How it works:**
1. User enters phone number
2. Client calls `authClient.phoneNumber.sendOtp({ phoneNumber })`
3. BetterAuth server plugin calls `sendOTP({ phoneNumber, code })` -- we IGNORE the `code` parameter and call Twilio Verify's create verification instead
4. Twilio generates and sends its own OTP via SMS
5. User enters the code they received
6. Client calls `authClient.phoneNumber.verify({ phoneNumber, code })`
7. BetterAuth server plugin calls `verifyOTP({ phoneNumber, code })` -- we forward to Twilio Verify's check verification
8. Twilio returns approved/rejected
9. BetterAuth creates/finds user and establishes session

**Example:**
```typescript
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { sendPhoneOTP, verifyPhoneOTP } from "@/lib/twilio";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }, ctx) => {
        // IGNORE the `code` param -- Twilio Verify generates its own
        // Do NOT await -- BetterAuth recommends non-blocking
        sendPhoneOTP(phoneNumber);
      },
      verifyOTP: async ({ phoneNumber, code }) => {
        // Delegate verification entirely to Twilio Verify
        return await verifyPhoneOTP(phoneNumber, code);
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber) =>
          `${phoneNumber.replace("+", "")}@phone.easycallai.local`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
    nextCookies(), // MUST be last plugin
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,  // 30 days
    updateAge: 60 * 60 * 24,        // Refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,    // 7-day cookie cache
    },
  },
});
```

```typescript
// src/lib/twilio.ts
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function sendPhoneOTP(phoneNumber: string): Promise<void> {
  await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({
      to: phoneNumber,
      channel: "sms",
    });
}

export async function verifyPhoneOTP(
  phoneNumber: string,
  code: string
): Promise<boolean> {
  try {
    const check = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });
    return check.status === "approved";
  } catch {
    return false;
  }
}
```

### Pattern 2: Auto-Detect New vs Returning User

**What:** BetterAuth's `signUpOnVerification` automatically creates a new user account if the phone number is not registered, or logs in if it already exists. No separate sign-up/sign-in flows needed.

**When to use:** This is the locked decision -- single phone input, system detects new vs returning.

**How it works:** When `signUpOnVerification` is configured, the `verify` endpoint checks if a user with that phone number exists. If yes, it creates a session for them. If no, it creates a new user (with temp email/name) and then creates a session. The client code is identical for both cases.

**Example:**
```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});

// Usage in component:
// Step 1: Send OTP
await authClient.phoneNumber.sendOtp({
  phoneNumber: "+15551234567",
});

// Step 2: Verify OTP (auto sign-up or sign-in)
const result = await authClient.phoneNumber.verify({
  phoneNumber: "+15551234567",
  code: "123456",
});
// result contains session if successful
```

### Pattern 3: Separate Routes for Multi-Step Flow

**What:** Use Next.js App Router file-based routing for each step rather than client-side state transitions on a single page.

**Why this approach (Claude's discretion recommendation):**
- Each step has a clear URL (shareable, refreshable)
- Server-side auth protection per route via middleware
- Simpler component logic (no complex state machine)
- Back button works naturally via browser history
- Step indicator component reads current pathname to show progress

**Route structure:**
- `/` -- Phone number input (unauthenticated)
- `/verify` -- OTP input (unauthenticated, but needs phone number from previous step)
- `/select-isp` -- ISP grid (authenticated, protected)
- `/select-issue` -- Issue categories + note (authenticated, protected)
- `/confirm` -- Review selections (authenticated, protected)

### Pattern 4: ISP Data as Static Seed Data

**What:** ISP names, logos, and per-ISP issue categories stored as a TypeScript data file AND seeded into the database. The data file is the source of truth; the database copy enables relational queries.

**Example:**
```typescript
// src/data/isps.ts
export const ISP_DATA = [
  {
    slug: "comcast",
    name: "Comcast",
    logoUrl: "/logos/comcast.svg",
    categories: [
      { slug: "billing", label: "Billing", description: "Bills, charges, and payment issues" },
      { slug: "technical", label: "Technical Support", description: "Internet, TV, or phone problems" },
      { slug: "cancellation", label: "Cancellation", description: "Cancel or downgrade service" },
      { slug: "general", label: "General Inquiry", description: "Other questions or requests" },
    ],
  },
  // ... other ISPs
] as const;
```

### Anti-Patterns to Avoid

- **Middleware-only auth:** Never rely solely on middleware for auth checks. Always verify sessions in server components/actions too. Middleware cookie checks are optimistic only.
- **Awaiting sendOTP:** BetterAuth docs explicitly warn against awaiting the sendOTP function -- it slows requests and enables timing attacks.
- **Storing OTP codes in your database:** With Twilio Verify, you never store OTP codes. Twilio handles generation, storage, expiration, and rate limiting.
- **Using BetterAuth's internal OTP with Twilio Verify:** If you provide both `sendOTP` and `verifyOTP`, you must use Twilio Verify for both. Don't mix BetterAuth's generated codes with Twilio's verification checks.
- **Hardcoding ISP data only in TypeScript:** Also seed ISPs into the database so call records can reference them with foreign keys.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTP generation and expiry | Custom OTP table with TTL logic | Twilio Verify | Handles code generation, expiry, rate limiting, fraud detection |
| Phone number formatting | Custom regex and format logic | E.164 validation (`^\+[1-9]\d{1,14}$`) + input mask | E.164 is the standard; Twilio requires it |
| Session management | Custom JWT + cookie logic | BetterAuth sessions | Handles cookie signing, expiry, refresh, CSRF |
| Toast notifications | Custom notification system | shadcn Sonner component | Already styled, accessible, handles stacking |
| Form validation | Manual state + error tracking | react-hook-form + zod | Type-safe, performant, standard pattern |
| Auth middleware | Custom cookie parsing | BetterAuth `getSessionCookie()` + server component checks | Handles cookie prefixes, signing verification |
| Database migrations | Manual SQL files | drizzle-kit generate + migrate | Tracks schema changes, generates SQL automatically |

**Key insight:** Authentication and OTP verification have massive edge cases (timing attacks, brute force, session fixation, token expiry races). BetterAuth + Twilio Verify handle all of these. Do not attempt custom auth logic.

## Common Pitfalls

### Pitfall 1: 10DLC Registration Blocking Launch
**What goes wrong:** Using Twilio Programmable Messaging for OTP requires 10DLC registration, which now takes 10-15 days for campaign review.
**Why it happens:** Developers default to the basic Twilio SMS API instead of the Verify API.
**How to avoid:** Use Twilio Verify exclusively. It manages its own phone number pool and compliance. No 10DLC registration needed.
**Warning signs:** If you find yourself buying a Twilio phone number or looking at A2P 10DLC docs, you're on the wrong path.

### Pitfall 2: BetterAuth Code vs Twilio Code Mismatch
**What goes wrong:** BetterAuth generates its own OTP code in `sendOTP({ phoneNumber, code })`, but if you use Twilio Verify, Twilio generates a different code. If you send BetterAuth's code via Programmable Messaging but verify against Twilio Verify, codes won't match.
**Why it happens:** Two OTP systems generating independent codes.
**How to avoid:** When using Twilio Verify, IGNORE the `code` parameter in `sendOTP` entirely. In `sendOTP`, call Twilio Verify's create verification (Twilio generates the code). In `verifyOTP`, call Twilio Verify's check verification. Both sides use Twilio's code.
**Warning signs:** OTP verification always fails even with correct code input.

### Pitfall 3: RSC Cookie Cache Staleness
**What goes wrong:** React Server Components cannot set cookies. If session cookie cache is enabled, the cached session data in the cookie won't refresh until a Server Action or Route Handler runs.
**Why it happens:** RSCs are read-only for cookies in Next.js.
**How to avoid:** Use the `nextCookies()` plugin (must be last plugin in the array). This ensures cookie-setting operations work properly in Next.js server actions.
**Warning signs:** Session appears expired after navigation even though user just authenticated.

### Pitfall 4: Missing Phone Number Between Steps
**What goes wrong:** User enters phone number on `/`, gets redirected to `/verify`, but the phone number is lost because it was only in component state.
**Why it happens:** Route transitions clear React state.
**How to avoid:** Pass phone number via URL search params (`/verify?phone=+15551234567`) or store in sessionStorage. URL params are simpler and work with refresh.
**Warning signs:** OTP verification page has no phone number to verify against.

### Pitfall 5: Session expiresIn vs Cookie maxAge Confusion
**What goes wrong:** Sessions expire even though cookie maxAge is long, or vice versa.
**Why it happens:** BetterAuth has two separate expiry concepts: `session.expiresIn` (server-side session TTL in the database) and `session.cookieCache.maxAge` (client-side cookie cache TTL).
**How to avoid:** Set `session.expiresIn` to 30 days (the persistent login requirement) and `cookieCache.maxAge` to 7 days (the cache refresh interval). The `updateAge` setting refreshes the server session daily.
**Warning signs:** Users get logged out unexpectedly despite "persistent sessions" configuration.

### Pitfall 6: BetterAuth Schema Migration Order
**What goes wrong:** Drizzle migrations fail or BetterAuth tables are missing.
**Why it happens:** BetterAuth needs its own tables (user, session, verification, account). You need to either generate these via the BetterAuth CLI or define them manually in your Drizzle schema.
**How to avoid:** Define all tables (including BetterAuth's required tables) in your Drizzle schema file, then use `drizzle-kit generate` and `drizzle-kit migrate`. The BetterAuth CLI `generate` command can output the schema for you to copy.
**Warning signs:** "Table does not exist" errors on first auth attempt.

## Code Examples

### Database Schema (Drizzle)
```typescript
// src/db/schema.ts
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

// ============ BetterAuth Required Tables ============

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ============ Application Tables ============

export const callStatusEnum = pgEnum("call_status", [
  "pending",
  "dialing",
  "navigating",
  "on_hold",
  "agent_detected",
  "transferring",
  "connected",
  "completed",
  "failed",
]);

export const isp = pgTable("isp", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull(),
  supportPhone: text("support_phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const issueCategory = pgTable("issue_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const call = pgTable("call", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  issueCategoryId: uuid("issue_category_id")
    .notNull()
    .references(() => issueCategory.id),
  userNote: text("user_note"),
  status: callStatusEnum("status").notNull().default("pending"),
  vapiCallId: text("vapi_call_id"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const callEventEnum = pgEnum("call_event_type", [
  "created",
  "dialing",
  "connected",
  "ivr_navigation",
  "on_hold",
  "agent_detected",
  "transfer_initiated",
  "user_callback",
  "user_connected",
  "ai_dropped",
  "completed",
  "failed",
  "error",
]);

export const callEvent = pgTable("call_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id")
    .notNull()
    .references(() => call.id),
  eventType: callEventEnum("event_type").notNull(),
  metadata: text("metadata"), // JSON string for flexible event data
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Drizzle Database Client
```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

export const db = drizzle(pool, { schema });
```

### Drizzle Config
```typescript
// drizzle.config.ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### BetterAuth API Route
```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

### Middleware for Route Protection
```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const protectedRoutes = ["/select-isp", "/select-issue", "/confirm"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // If authenticated user visits / or /verify, could redirect to /select-isp
  // But keep it simple -- let the page component handle this

  return NextResponse.next();
}

export const config = {
  matcher: ["/select-isp", "/select-issue", "/confirm"],
};
```

### Root Layout with Toaster
```typescript
// src/app/layout.tsx
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
```

### Toast Usage for OTP Errors
```typescript
import { toast } from "sonner";

// On wrong OTP code
toast.error("Invalid code. Please try again.");

// On delivery failure
toast.error("Failed to send verification code. Please try again.");

// On expired code
toast.error("Code expired. We've sent a new one.");

// On success
toast.success("Phone verified!");
```

### Environment Variables
```
# .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/easycallai
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=VA...
```

## Discretion Recommendations

For items marked as Claude's discretion, here are the recommended approaches:

### ISP Selection Layout: 2x3 Grid of Cards
- Cards with ISP logo prominently displayed and name below
- Hover/focus state with subtle border highlight
- Simple and clean -- matches "browse only" with 6 items
- shadcn Card component with custom styling

### Issue Category Presentation: Large Buttons with Descriptions
- Full-width buttons stacked vertically
- Each shows category label and short description
- Per-ISP categories loaded dynamically based on previous ISP selection
- shadcn Button variant="outline" with custom layout

### Confirmation Step: Yes, Include a Review Screen
- Shows selected ISP (with logo), issue category, and optional note
- Single "Start Call" button (though call placement is Phase 2, this step stores the configuration)
- "Edit" links next to each selection to go back to that step
- Provides a natural stopping point before Phase 2 adds actual call initiation

### Page Structure: Separate Routes (Recommended)
- Each step is its own route (`/`, `/verify`, `/select-isp`, `/select-issue`, `/confirm`)
- Benefits: URL-addressable steps, server-side auth per route, browser back works naturally
- Step indicator component reads `usePathname()` to highlight current step

### Back Navigation: Browser Back + Step Indicator Links
- Browser back button works naturally with separate routes
- Step indicator dots are also clickable (for authenticated steps)
- No custom back button needed in most cases

### Visual Design Direction: Clean Minimal
- White/light background, generous whitespace
- ISP logos are the primary color accents
- shadcn default styling provides a clean, professional look
- Step indicator as subtle dots at the top

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| shadcn Toast component | shadcn Sonner component | 2024 | Toast is deprecated; use Sonner for all toast notifications |
| Next.js 15 middleware | Next.js 16 proxy (or middleware with Node.js runtime) | 2025-2026 | `middleware.ts` still works in 16 but `proxy.ts` is the new pattern |
| Twilio Programmable Messaging for OTP | Twilio Verify API | Recommended since 2023+ | Verify handles compliance, fraud, phone pools -- no 10DLC needed |
| BetterAuth separate sign-up/sign-in | signUpOnVerification | Built-in | Single flow auto-creates or logs in |
| drizzle-kit push (dev) | drizzle-kit generate + migrate (prod) | Always | Push is for rapid dev; generate+migrate for tracked migrations |

**Deprecated/outdated:**
- `shadcn toast`: Deprecated in favor of Sonner. Do not use `@/components/ui/toast`.
- Next.js `middleware.ts` edge runtime: Still works but Node.js runtime middleware is now available in 15.2+ and 16+.

## Open Questions

1. **Twilio Verify free trial limits**
   - What we know: Twilio trial accounts can verify personal numbers for testing. Free trial includes some credits.
   - What's unclear: Exact number of free verifications and whether trial is sufficient for school project demo.
   - Recommendation: Create Twilio account early and check trial credit balance. For a school project, trial credits should be sufficient.

2. **ISP logos licensing**
   - What we know: SVG logos available from logo.wine, worldvectorlogo, Wikimedia Commons.
   - What's unclear: Whether using ISP logos in a school project requires permission.
   - Recommendation: For a school project, fair use likely applies. Download SVG logos and store in `/public/logos/`. If concerned, use simple text-only cards initially.

3. **BetterAuth phone plugin with Twilio Verify: does sendOTP `code` param cause issues?**
   - What we know: BetterAuth generates an internal code and passes it to `sendOTP`. When we ignore it and use Twilio Verify, BetterAuth still stores its internal code in the verification table.
   - What's unclear: Whether BetterAuth tries to verify its own code before calling custom `verifyOTP`. The docs say custom `verifyOTP` "overrides internal verification logic."
   - Recommendation: This should work based on documentation stating custom verifyOTP overrides internal logic. Test early in implementation. If issues arise, the GitHub issue #4702 community has working implementations.

4. **Next.js 16 vs 15 for project init**
   - What we know: Next.js 16.1.6 is latest stable. It replaces middleware with proxy and uses Turbopack by default.
   - What's unclear: Whether BetterAuth's `toNextJsHandler` and middleware patterns fully support Next.js 16 yet.
   - Recommendation: Start with Next.js 16 (latest stable). BetterAuth docs already show Next.js 16 proxy patterns. Fall back to 15 only if compatibility issues emerge.

## Sources

### Primary (HIGH confidence)
- [BetterAuth Phone Number Plugin](https://www.better-auth.com/docs/plugins/phone-number) - sendOTP, verifyOTP, signUpOnVerification, schema requirements
- [BetterAuth Installation](https://www.better-auth.com/docs/installation) - Next.js setup, API route handler, client config
- [BetterAuth Session Management](https://www.better-auth.com/docs/concepts/session-management) - Session persistence, cookie cache, expiresIn
- [BetterAuth Next.js Integration](https://www.better-auth.com/docs/integrations/next) - Middleware/proxy, server component session checks, nextCookies plugin
- [BetterAuth Drizzle Adapter](https://www.better-auth.com/docs/adapters/drizzle) - Adapter config, schema generation
- [Twilio Verify API](https://www.twilio.com/docs/verify/api) - Create verification, check verification, channels
- [Twilio Verify Quickstart](https://www.twilio.com/docs/verify/quickstarts/node-express) - Node.js implementation pattern
- [Drizzle ORM PostgreSQL Setup](https://orm.drizzle.team/docs/get-started/postgresql-new) - pg driver, schema definition, drizzle.config.ts
- [shadcn/ui Sonner](https://ui.shadcn.com/docs/components/sonner) - Toast replacement, installation, usage
- [shadcn/ui Next.js Installation](https://ui.shadcn.com/docs/installation/next) - Init command, component setup

### Secondary (MEDIUM confidence)
- [GitHub Issue #4702](https://github.com/better-auth/better-auth/issues/4702) - BetterAuth + Twilio Verify integration patterns (community verified)
- [Twilio Verify Pricing](https://www.twilio.com/en-us/verify/pricing) - $0.05/successful verification + $0.0083/SMS (US)
- [Twilio 10DLC Docs](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) - Campaign review now takes 10-15 days
- [Twilio Migrate to Verify](https://www.twilio.com/en-us/blog/migrate-programmable-messaging-to-verify) - Verify vs Programmable Messaging comparison

### Tertiary (LOW confidence)
- ISP logo sources (logo.wine, worldvectorlogo, Wikimedia) - Licensing unclear for project use

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs, versions confirmed on npm
- Architecture: HIGH - Patterns from official BetterAuth, Next.js, and Drizzle documentation
- Twilio integration approach: HIGH - Verified via official Twilio docs and community implementations
- Pitfalls: HIGH - Sourced from official docs warnings and community issue reports
- Discretion recommendations: MEDIUM - Based on standard UI patterns, not verified with specific user preferences

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days -- stack is stable)
