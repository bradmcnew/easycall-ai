# Technology Stack

**Project:** EasyCallAI — Autonomous Outbound Phone Call Handler for ISP Customers
**Researched:** 2026-02-06
**Overall Confidence:** HIGH (core stack verified via Context7 and official docs)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Confidence | Why |
|------------|---------|---------|------------|-----|
| Next.js | ^16.1.6 | Full-stack React framework | HIGH | App Router provides SSE-capable route handlers for real-time call status, API routes for Vapi webhooks, Server Actions for form mutations. Deployed natively on Vercel. v16 is current stable with Turbopack stable by default. |
| TypeScript | ^5.7 | Type safety | HIGH | Required by Drizzle ORM for type-safe queries, Vapi SDK ships TypeScript types, BetterAuth is TypeScript-first. Non-negotiable for this stack. |
| Tailwind CSS | ^4.1.18 | Styling | HIGH | v4 is a full rewrite with CSS-first configuration (no more tailwind.config.js). Next.js 16 has first-class Tailwind v4 support. |
| React | ^19 | UI library | HIGH | Bundled with Next.js 16. Server Components reduce client bundle. Required for real-time call status UI updates. |

### Telephony & Voice AI

| Technology | Version | Purpose | Confidence | Why |
|------------|---------|---------|------------|-----|
| Vapi AI (platform) | N/A (SaaS) | Voice AI orchestration, outbound calls, IVR navigation, call transfers | HIGH | Purpose-built for exactly this use case. Provides DTMF tool for IVR navigation, warm transfer modes for conferencing users in, webhook events for real-time status. No self-hosted alternative comes close for time-to-market. |
| @vapi-ai/server-sdk | ^0.11.0 | Server-side Vapi API calls (create outbound calls, manage assistants) | HIGH | Official TypeScript SDK. Used in Next.js API routes to initiate calls via `/call` endpoint. Exports typed request/response interfaces. |
| @vapi-ai/web | ^2.5.2 | Client-side Vapi integration (optional, for browser-based calls) | MEDIUM | Only needed if adding browser-based call features later. Not required for MVP outbound-only flow. |
| Twilio (telephony provider) | N/A (SaaS) | Phone numbers, PSTN connectivity for Vapi | HIGH | **Required, not optional.** Warm transfer (`warm-transfer-experimental` mode) only works with Twilio, Vapi phone numbers, or SIP trunks. Does NOT support Telnyx or Vonage for warm transfers. Import Twilio numbers into Vapi for unlimited outbound calling (free Vapi numbers have daily limits and are US-only). |
| twilio | ^5.11.2 | Twilio Node.js SDK for SMS OTP (BetterAuth integration) | HIGH | Needed for BetterAuth phone number plugin's `sendOTP`/`verifyOTP` functions via Twilio Verify API. Single Twilio account serves both telephony (via Vapi) and SMS authentication. |

### Authentication

| Technology | Version | Purpose | Confidence | Why |
|------------|---------|---------|------------|-----|
| better-auth | ^1.4.18 | Authentication framework | HIGH | Framework-agnostic TypeScript auth with built-in phone number plugin. Plugin provides `sendOtp`, `verify`, `signIn.phoneNumber` endpoints. Integrates with Drizzle ORM for session/user storage. 287+ npm dependents indicates solid adoption. |
| better-auth phone number plugin | (bundled) | SMS OTP verification | HIGH | Built into better-auth. Provides: `otpLength` (default 6), `expiresIn` (default 300s), `allowedAttempts` (default 3, brute force protection), custom `sendOTP`/`verifyOTP` hooks for Twilio Verify integration. Adds `phoneNumber` and `phoneNumberVerified` columns to user table. |

### Database

| Technology | Version | Purpose | Confidence | Why |
|------------|---------|---------|------------|-----|
| PostgreSQL | 16+ | Primary database | HIGH | Required by Drizzle ORM. Stores users, sessions, call records, ISP configurations. Relational model fits the domain (users have calls, calls have statuses, ISPs have phone trees). |
| Neon | N/A (SaaS) | Serverless PostgreSQL hosting | HIGH | **Recommended over Supabase.** Neon is pure PostgreSQL (no BaaS lock-in), has native Vercel integration (Vercel transitioned its own Postgres to Neon in Q4 2024-Q1 2025), built-in PgBouncer connection pooling (up to 10,000 connections), and a generous free tier: 100 CU-hours/month, 0.5 GB storage, no credit card required. Drizzle has first-class `drizzle-orm/neon-serverless` and `drizzle-orm/neon-http` drivers. |
| drizzle-orm | ^0.45.1 | TypeScript ORM | HIGH | Type-safe queries, zero dependencies (~7.4kb), serverless-ready. First-class Neon support via `drizzle-orm/neon-serverless` (WebSocket) or `drizzle-orm/neon-http` (HTTP). Schema-as-code with `drizzle-kit` for migrations. |
| drizzle-kit | ^0.31.x | Schema migrations & studio | HIGH | CLI companion to drizzle-orm. Generates SQL migrations from TypeScript schema changes. `drizzle-kit push` for dev, `drizzle-kit migrate` for production. |

### Real-Time Communication (Call Status Updates to User)

| Technology | Version | Purpose | Confidence | Why |
|------------|---------|---------|------------|-----|
| Server-Sent Events (SSE) | N/A (Web Standard) | Push call status updates to user's browser | HIGH | **Use SSE, not WebSockets.** Unidirectional server-to-client push is exactly what call status requires (user doesn't send data back through this channel). Next.js App Router route handlers natively support `ReadableStream` for SSE. No additional dependencies needed. Works on Vercel with caveats (see limitations below). |

**SSE Architecture:**
1. Vapi sends webhook events (status-update, speech-update, transfer-update, end-of-call-report) to your Next.js API route
2. API route writes events to a shared event bus (in-memory for single-instance, or Redis/Upstash for multi-instance)
3. Client connects to SSE endpoint (`/api/calls/[callId]/stream`)
4. SSE endpoint reads from event bus and streams to client

**Vercel SSE Limitation:** Edge Functions have a 25-second timeout. For long-running SSE connections (hold waits can be 30+ minutes), you need either:
- **Option A:** Polling fallback (client polls `/api/calls/[callId]/status` every 5s) — simpler, recommended for MVP
- **Option B:** Upstash Redis with `@upstash/redis` for pub/sub SSE that reconnects gracefully
- **Option C:** Vercel Fluid (if available) for long-lived connections

### Supporting Libraries

| Library | Version | Purpose | Confidence | When to Use |
|---------|---------|---------|------------|-------------|
| @upstash/redis | ^1.34.x | Redis for SSE event bus, rate limiting | MEDIUM | Add when you need real-time SSE beyond Vercel's 25s timeout, or for rate-limiting API calls. Free tier: 10,000 commands/day. |
| zod | ^3.24.x | Runtime validation | HIGH | Validate Vapi webhook payloads, API request bodies, environment variables. Already a transitive dependency of better-auth. |
| @t3-oss/env-nextjs | ^0.11.x | Type-safe environment variables | MEDIUM | Validates all env vars (VAPI_API_KEY, TWILIO_*, DATABASE_URL, etc.) at build time. Prevents deployment with missing config. |
| lucide-react | ^0.469.x | Icons | LOW | Clean, tree-shakeable icon set. Use for UI elements (phone icons, status indicators). Any icon library works. |

---

## Vapi AI Deep Dive

### Outbound Calling Flow

**API Endpoint:** `POST /call`

```
Required payload:
{
  "assistantId": "<saved-assistant-id>" | "assistant": { <transient-config> },
  "phoneNumberId": "<vapi-phone-number-id>",  // Twilio number imported into Vapi
  "customer": { "number": "+1XXXXXXXXXX" }     // ISP's customer service number
}
```

**Key decisions:**
- Use **transient assistants** (inline `assistant` object) rather than `assistantId` for ISP-specific configurations. Each ISP has different phone trees, so the system prompt changes per ISP.
- Use **`schedulePlan`** if implementing delayed callbacks (e.g., "call Comcast in 5 minutes").
- **Batch calling** (`customers` array) is NOT useful here — each call is unique per user request.

### IVR Navigation Configuration

**DTMF Tool:** Built into Vapi, enabled by adding `"dtmf"` to the assistant's tools list.

**System Prompt Best Practices (from Vapi docs):**
- Instruct the assistant to WAIT for all IVR options to be spoken before pressing keys
- Use space character `" "` replies to stay silent during IVR prompts
- Implement progressive retry: fast sequence first (`123#`), then with pauses (`1w2w3#`), then slow (`1W2W3#`)
- Include the ISP's known phone tree in the system prompt so the AI knows which options to select

**Timing Configuration — `startSpeakingPlan`:**
```json
{
  "smartEndpointingPlan": {
    "provider": "livekit",
    "waitFunction": "t < 30 ? (x * 500 + 300) : (20 + 500 * sqrt(x) + 2500 * x^3)"
  }
}
```
- `t < 30`: Slower cadence during first 30 seconds (IVR phase)
- After 30s: Faster response for human conversation
- `w` = 0.5s pause, `W` = 1s pause (Twilio/Telnyx/Vapi numbers)

**DTMF Pause Characters by Provider:**
| Provider | Short Pause (0.5s) | Long Pause (1s) |
|----------|-------------------|-----------------|
| Twilio | `w` | `W` |
| Telnyx | `w` | `W` |
| Vonage | `p` | N/A |

### Hold Music Detection & Human Agent Detection

**How it works:** Vapi does NOT have a dedicated "hold music detector" API. Instead, this is handled through the AI assistant's conversational intelligence:

1. **System prompt instructs the AI** to recognize hold patterns (music, silence, repeated messages like "your call is important to us")
2. **Voice Activity Detection (VAD):** Vapi's proprietary noise filtering model cleans audio in real-time, distinguishing music/background noise from human speech
3. **Speech detection:** When a human agent speaks (detected via VAD transitioning from noise/silence to speech), the AI recognizes conversational patterns vs. recorded messages
4. **`speech-update` webhook:** Fires with `status: "started"` and `role: "user"` when real speech is detected — use this as the trigger that a human picked up

**Recommended approach for hold waiting:**
- Configure `maxDurationSeconds` on the assistant to allow long holds (up to 3600s = 1 hour)
- Use `silenceTimeoutSeconds` generously (300-600s) to avoid premature hangup during hold
- System prompt should instruct the AI to periodically confirm it's still on hold (for the user's benefit via status updates)
- When human speech is detected, the AI should confirm with the human agent, then trigger the transfer back to the user

### Call Transfer — Conferencing the User In

**The key mechanism:** `warm-transfer-experimental` mode.

**How it works:**
1. AI agent calls the ISP, navigates IVR, waits on hold
2. When human agent answers, the AI initiates a warm transfer TO THE USER
3. The transfer assistant calls the user's phone number
4. Transfer assistant delivers context ("Hi, your ISP agent is on the line. Connecting you now.")
5. `transferSuccessful` tool merges both calls — user and ISP agent are now connected
6. AI assistant drops off the call

**Critical configuration:**
```json
{
  "transferPlan": {
    "mode": "warm-transfer-experimental",
    "transferAssistant": {
      "firstMessage": "Hi! Your Comcast representative is on the line. Let me connect you now.",
      "model": { "provider": "openai", "model": "gpt-4o-mini" },
      "maxDurationSeconds": 120,
      "silenceTimeoutSeconds": 30
    }
  }
}
```

**Limitation:** `warm-transfer-experimental` only works with Twilio, Vapi phone numbers, and SIP trunks. This is why Twilio is mandatory.

**Alternative approach (Dynamic Transfers):**
- Use a custom `transfer_call` tool with server-side logic
- Server receives `message.call.monitor.controlUrl`
- Server POSTs transfer instruction to `controlUrl` with user's phone number
- More flexible but requires more server-side code

### Vapi Webhook Events (for real-time status)

| Event | When It Fires | Use For |
|-------|--------------|---------|
| `status-update` | Call lifecycle changes: `scheduled`, `queued`, `ringing`, `in-progress`, `forwarding`, `ended` | Primary call status tracking |
| `speech-update` | Speech starts/stops for each party | Detecting when human agent picks up (role: "user", status: "started") |
| `transcript` | Partial and final transcripts | Showing user what the AI is hearing/saying |
| `transfer-update` | Transfer initiated/completed | Tracking when user is being connected |
| `end-of-call-report` | Call ends | Final summary with recording URL, transcript, endedReason |
| `hang` | Delay detected | Alerting on quality issues |
| `tool-calls` | AI invokes a tool (DTMF, transfer, etc.) | Tracking IVR navigation progress |

**Webhook server requirements:**
- HTTPS with valid SSL (HTTP fails silently)
- Host near `us-west-2` for lowest latency
- Response within 7.5 seconds for request-type events
- Only 4 event types require responses: `assistant-request`, `tool-calls`, `transfer-destination-request`, `knowledge-base-request`

### Vapi Cost Breakdown (per call minute)

| Component | Cost/min | Provider | Notes |
|-----------|----------|----------|-------|
| Vapi platform fee | $0.05 | Vapi | Base orchestration cost |
| Transcription (STT) | ~$0.01 | Deepgram (default) | Speech-to-text |
| LLM | ~$0.02-0.20 | OpenAI/Anthropic | GPT-4o-mini recommended for IVR (cheaper), GPT-4o for complex conversations |
| Voice (TTS) | ~$0.04 | ElevenLabs/PlayHT | Text-to-speech for the AI's voice |
| Telephony | ~$0.01 | Twilio | PSTN connection |
| **Total estimate** | **$0.13-0.31** | | **Hold time is cheaper** (minimal LLM/TTS usage during hold) |

**Cost optimization for hold waiting:**
- During hold, the AI is mostly silent — LLM and TTS costs approach $0
- Main cost during hold: Vapi platform fee ($0.05/min) + Twilio ($0.01/min) + Deepgram ($0.01/min) = ~$0.07/min
- A 30-minute hold costs approximately $2.10 in platform fees alone

---

## BetterAuth + SMS Deep Dive

### Phone Number Plugin Configuration

**Server setup:**
```typescript
import { betterAuth } from "better-auth"
import { phoneNumber } from "better-auth/plugins"
import twilio from "twilio"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

export const auth = betterAuth({
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        await twilioClient.messages.create({
          body: `Your EasyCallAI code is: ${code}`,
          from: process.env.TWILIO_SMS_NUMBER,
          to: phoneNumber,
        })
      },
      // OR use Twilio Verify for managed OTP:
      // verifyOTP: async ({ phoneNumber, code }) => {
      //   const check = await twilioClient.verify
      //     .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      //     .verificationChecks.create({ to: phoneNumber, code })
      //   return check.status === 'approved'
      // },
      otpLength: 6,
      expiresIn: 300,        // 5 minutes
      allowedAttempts: 3,     // brute force protection
      signUpOnVerification: { // auto-create user on first verification
        getTempEmail: (phoneNumber) => `${phoneNumber.replace('+', '')}@easycallai.local`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
  ],
})
```

**Client setup:**
```typescript
import { createAuthClient } from "better-auth/client"
import { phoneNumberClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
})
```

**Database additions (Drizzle schema):**
- `phoneNumber`: string, unique, optional on users table
- `phoneNumberVerified`: boolean, default false on users table

### SMS Provider Decision: Twilio Verify vs Raw Twilio SMS

| Approach | Cost | Complexity | Recommendation |
|----------|------|------------|----------------|
| Twilio Verify API | $0.05/verification | Low (managed OTP) | **Recommended.** Handles delivery, retry, fraud detection. Use `verifyOTP` hook. |
| Raw Twilio SMS | $0.0079/SMS (US) | Medium (self-manage OTP) | Cheaper but you handle rate limiting, delivery tracking. Use `sendOTP` hook. |
| AWS SNS | $0.0075/SMS (US) | Medium | Not recommended — adds another vendor. Twilio already needed for Vapi telephony. |

**Recommendation: Use Twilio Verify.** You already need a Twilio account for Vapi telephony. Twilio Verify handles OTP delivery, expiry, and fraud detection at $0.05/verification. One vendor for both voice and SMS simplifies billing and setup.

---

## Database Deep Dive

### Why Neon Over Supabase

| Criterion | Neon | Supabase | Winner |
|-----------|------|----------|--------|
| PostgreSQL purity | Pure Postgres, no vendor wrapper | Postgres + proprietary auth, storage, functions | Neon |
| Vercel integration | Native (Vercel migrated to Neon) | Third-party integration | Neon |
| Connection pooling | Built-in PgBouncer (10,000 connections) | Built-in PgBouncer | Tie |
| Auth | None (use BetterAuth) | Built-in (conflicts with BetterAuth) | Neon |
| Free tier | 100 CU-hours, 0.5 GB, no CC | 500 MB, 50,000 rows, limited connections | Neon |
| Drizzle support | First-class (`neon-serverless`, `neon-http`) | First-class (`postgres-js`) | Tie |
| Branching | Copy-on-write instant branches | Database branching available | Neon |
| Price at scale | $0.35/GB-month storage (post-2025 reduction) | $0.125/GB-month | Supabase |

**Verdict:** Neon wins for this project because we're already using BetterAuth (Supabase's built-in auth would conflict), Vercel integration is native, and the pure PostgreSQL approach avoids BaaS lock-in.

### Drizzle ORM + Neon Connection

**For serverless (Vercel functions):**
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
const db = drizzle(process.env.DATABASE_URL);
```

**For long-running connections (webhooks that hold state):**
```typescript
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
const db = drizzle({
  connection: process.env.DATABASE_URL,
  ws: ws,  // Required in Node.js for WebSocket support
});
```

**Recommendation:** Use `neon-http` driver for all standard API routes (stateless, lowest latency). Use `neon-serverless` driver only if you need interactive transactions.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Telephony AI | Vapi AI | Retell AI, Bland AI | Retell lacks built-in IVR DTMF tool. Bland AI has less documentation. Vapi has explicit IVR navigation docs and warm transfer modes. |
| Telephony Provider | Twilio (via Vapi) | Telnyx, Vonage | Warm transfer only works with Twilio in Vapi. No choice here. |
| Auth | BetterAuth | NextAuth/Auth.js, Clerk | NextAuth v5 still lacks native phone/SMS auth plugin. Clerk is SaaS with per-MAU pricing. BetterAuth is self-hosted, free, TypeScript-first with built-in phone plugin. |
| ORM | Drizzle | Prisma | Prisma generates a heavy client, slower cold starts on serverless. Drizzle is 7.4kb, zero deps, better serverless performance. Drizzle's SQL-like API is more predictable for complex queries. |
| Database Host | Neon | Supabase, Vercel Postgres | Vercel Postgres IS Neon (they migrated). Supabase bundles auth that conflicts with BetterAuth. Neon is the cleanest pure-Postgres option. |
| Real-time | SSE (native) | WebSockets, Pusher, Ably | WebSockets are bidirectional (overkill for status updates). Pusher/Ably add cost and another vendor. SSE is a web standard, works in route handlers, zero dependencies. |
| SMS Provider | Twilio (Verify) | AWS SNS, Vonage | Already using Twilio for telephony. One vendor simplifies ops. Twilio Verify handles fraud detection. |
| Styling | Tailwind CSS v4 | CSS Modules, styled-components | Team already decided on Tailwind. v4 is stable and CSS-first. |

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **Socket.io / ws** | Overkill for unidirectional status updates. SSE is simpler and works on Vercel. |
| **Prisma** | Heavy client, slow serverless cold starts, less control over generated queries. |
| **Supabase** | Its auth layer conflicts with BetterAuth. Using it just for Postgres adds unnecessary BaaS surface area. |
| **Clerk** | Per-MAU pricing scales poorly. No phone-number-primary auth flow built in. |
| **Firebase** | Google ecosystem lock-in. No PostgreSQL. Phone auth is good but doesn't integrate with the rest of the stack. |
| **Vonage/Telnyx** (as primary) | Warm transfer in Vapi requires Twilio. Using these adds complexity for no gain. |
| **Redis (self-hosted)** | Use Upstash Redis if you need Redis. Self-hosted Redis on Vercel is not possible. |
| **Express/Fastify** | Next.js API routes + route handlers cover all server needs. Separate backend adds deployment complexity. |
| **Drizzle v1 beta** | v1.0.0-beta.2 exists but is not stable. Stick with 0.45.x until v1 is GA. |

---

## Environment Variables Required

```bash
# Vapi
VAPI_API_KEY=               # Vapi dashboard -> API Keys
VAPI_PHONE_NUMBER_ID=       # Imported Twilio number ID in Vapi
VAPI_WEBHOOK_SECRET=        # For verifying webhook signatures

# Twilio (shared between Vapi telephony and BetterAuth SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=  # For Twilio Verify OTP
TWILIO_SMS_NUMBER=           # Twilio phone number for SMS

# Database
DATABASE_URL=               # Neon connection string (pooled)

# BetterAuth
BETTER_AUTH_SECRET=         # Session encryption secret
BETTER_AUTH_URL=            # https://your-domain.com

# App
NEXT_PUBLIC_APP_URL=        # Public URL for client-side
```

---

## Installation

```bash
# Core framework
npm install next@latest react@latest react-dom@latest

# Telephony
npm install @vapi-ai/server-sdk twilio

# Auth
npm install better-auth

# Database
npm install drizzle-orm @neondatabase/serverless

# Validation
npm install zod

# Dev dependencies
npm install -D typescript @types/node @types/react @types/react-dom
npm install -D drizzle-kit
npm install -D tailwindcss @tailwindcss/postcss postcss
npm install -D @t3-oss/env-nextjs
```

---

## Sources

### HIGH Confidence (Context7, Official Docs)
- Vapi IVR Navigation: https://docs.vapi.ai/ivr-navigation
- Vapi Outbound Calling: https://docs.vapi.ai/calls/outbound-calling
- Vapi Warm Transfer: https://docs.vapi.ai/calls/assistant-based-warm-transfer
- Vapi Dynamic Transfers: https://docs.vapi.ai/calls/call-dynamic-transfers
- Vapi Server Events: https://docs.vapi.ai/server-url/events
- Vapi Call Forwarding: https://docs.vapi.ai/call-forwarding
- Vapi Phone Calling: https://docs.vapi.ai/phone-calling
- BetterAuth Phone Number Plugin: https://www.better-auth.com/docs/plugins/phone-number
- Drizzle + Neon Connection: https://orm.drizzle.team/docs/connect-neon
- Neon Pricing: https://neon.com/pricing
- Neon Vercel Integration: https://vercel.com/marketplace/neon
- @vapi-ai/server-sdk: https://www.npmjs.com/package/@vapi-ai/server-sdk
- @vapi-ai/web: https://www.npmjs.com/package/@vapi-ai/web
- better-auth: https://www.npmjs.com/package/better-auth
- drizzle-orm: https://www.npmjs.com/package/drizzle-orm
- twilio: https://www.npmjs.com/package/twilio
- next: https://www.npmjs.com/package/next
- tailwindcss: https://www.npmjs.com/package/tailwindcss

### MEDIUM Confidence (WebSearch verified with official source)
- Vapi pricing breakdown: https://telnyx.com/resources/vapi-pricing
- Neon vs Supabase comparison: https://www.bytebase.com/blog/neon-vs-supabase/
- Twilio SMS pricing: https://www.twilio.com/en-us/pricing/messaging
- SSE in Next.js: https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/

### LOW Confidence (needs validation during implementation)
- Vercel SSE timeout limits (25s Edge, unclear for Node.js runtime)
- Exact Vapi cost breakdown per component (varies by provider choices)
- Drizzle v1 GA timeline
