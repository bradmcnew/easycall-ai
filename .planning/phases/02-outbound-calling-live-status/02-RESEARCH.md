# Phase 02: Outbound Calling & Live Status - Research

**Researched:** 2026-02-06
**Domain:** Vapi AI outbound calling, Pusher real-time events, Next.js API routes, call lifecycle management
**Confidence:** HIGH

## Summary

This phase connects the existing ISP selection flow to Vapi AI for placing outbound phone calls, persists call state via webhooks, and delivers real-time status updates to the browser via Pusher Channels. The three core integration points are: (1) Vapi server SDK to initiate calls with transient assistants configured for long hold times, (2) a webhook endpoint to receive Vapi server events and write call_event records, and (3) Pusher to fan out status changes to a private per-call channel the client subscribes to.

The existing schema already defines `call`, `call_event`, `callStatusEnum`, and `callEventEnum` tables with the right shape. The `confirm/page.tsx` has a disabled "Start Call" button ready to be wired up. The primary new work is: server-side call initiation logic, a Vapi webhook handler, Pusher integration (server trigger + client subscription), the `/call/[id]` status page, and middleware/redirect logic for active calls.

**Primary recommendation:** Use `@vapi-ai/server-sdk` for call initiation, raw webhook POST handler for Vapi events, `pusher` (server) + `pusher-js` (client) for real-time, and private Pusher channels authenticated via a Next.js route handler.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Call initiation flow
- No extra confirmation step -- the confirmation page IS the final step, button immediately starts the call
- After hitting "Call Now", redirect to a dedicated `/call/[id]` status page
- Cancel available at all times during the call, with an "Are you sure?" confirmation prompt
- One call at a time -- user must wait for current call to finish before starting another

#### Live status display
- Minimal & calm visual style -- clean page with subtle animation, not a busy dashboard
- Subtle timer in corner showing hold duration -- visible but not anxiety-inducing
- Detailed status labels: Dialing -> Ringing -> Connected -> Navigating Menu -> On Hold -> Agent Found -> Complete
  - Note: "Navigating Menu" and "Agent Found" won't trigger until Phase 3 but the status model should define them now
- Progress visualization: Claude's Discretion (step indicators vs just the status label)

#### Hold experience & resilience
- Call continues running on the server when user closes browser tab
- Auto-redirect to active call status page when user returns to the app with an active call
- No push notifications or SMS alerts for now -- rely on in-app status page only
- Show a small "Reconnecting..." indicator when Pusher connection drops, silent reconnect in background

#### Call lifecycle & endings
- Failed calls (busy signal, wrong number, Vapi error) show error message + "Try Again" button
- Hold timeout: Claude's Discretion (pick a reasonable maximum)
- When call ends, show a summary card: call result, duration, ISP, category -- like a receipt
- No call history UI in Phase 2 -- data is stored but history page deferred

### Claude's Discretion
- Progress visualization approach (step indicators vs status label only)
- Hold timeout duration
- Loading skeleton/animation design on status page
- Exact layout and spacing of the status page
- Error state details and messaging copy

### Deferred Ideas (OUT OF SCOPE)
- Push notifications / SMS alerts for call status changes -- future enhancement
- Call history page -- data stored in Phase 2, UI can come later
- Multiple simultaneous calls -- not needed for MVP
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vapi-ai/server-sdk` | ^0.11.0 | Server-side Vapi API client (create calls, get call status) | Official TypeScript SDK with auto-retries, types, error handling |
| `pusher` | ^5.3.2 | Server-side Pusher Channels (trigger events) | Official Node.js REST library for Pusher Channels |
| `pusher-js` | ^8.4.0 | Client-side Pusher Channels (subscribe, receive events) | Official browser client with auto-reconnect, private channel support |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `twilio` | ^5.12.1 (already installed) | Twilio account for phone number import to Vapi | Already in project for SMS OTP; Vapi needs a Twilio number imported |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pusher | Ably | Ably has more features but Pusher is simpler and already decided |
| Pusher | SSE (Server-Sent Events) | Vercel has 25s timeout on streaming responses -- unusable for 30+ min holds |
| `@vapi-ai/server-sdk` | Raw HTTP `fetch` to Vapi API | SDK provides retries, types, error classes; raw fetch requires manual handling |

**Installation:**
```bash
npm install @vapi-ai/server-sdk pusher pusher-js
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── call/
│   │   └── [id]/
│   │       ├── page.tsx              # Call status page (server component shell)
│   │       └── call-status-client.tsx # Client component with Pusher subscription
│   ├── api/
│   │   ├── call/
│   │   │   ├── start/route.ts        # POST: Create call record + initiate Vapi call
│   │   │   ├── cancel/route.ts       # POST: Cancel active call via Vapi control URL
│   │   │   └── active/route.ts       # GET: Check if user has an active call (for redirect)
│   │   ├── webhooks/
│   │   │   └── vapi/route.ts         # POST: Vapi webhook handler (status-update, end-of-call-report)
│   │   └── pusher/
│   │       └── auth/route.ts         # POST: Pusher private channel authorization
├── lib/
│   ├── vapi.ts                       # VapiClient singleton
│   ├── pusher-server.ts              # Pusher server instance
│   └── pusher-client.ts              # Pusher client factory (browser-side)
```

### Pattern 1: Transient Assistant Per Call
**What:** Each outbound call creates a transient (inline) assistant configuration rather than referencing a saved assistant ID. The assistant config includes ISP-specific system prompt, silence timeout, and max duration.
**When to use:** Every call initiation.
**Why:** Ensures each call gets the exact configuration needed for its ISP. No stale assistant state. Matches prior decision: "Transient Vapi assistants per call (ISP-specific prompt generation)."

```typescript
// Source: Vapi docs (outbound-calling.mdx, create assistant API)
const call = await vapiClient.calls.create({
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
  customer: { number: ispSupportPhone },
  assistant: {
    name: `EasyCallAI - ${ispName}`,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: `You are calling ${ispName} customer support on behalf of a user...`
      }],
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
    transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
    firstMessage: "Hello, I'm calling about a customer service issue.",
    firstMessageMode: "assistant-speaks-first",
    silenceTimeoutSeconds: 3600,  // 1 hour max silence (for hold music)
    maxDurationSeconds: 3600,     // 1 hour max call duration
    serverMessages: ["status-update", "end-of-call-report", "hang"],
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi`,
      timeoutSeconds: 20,
    },
  },
});
```

### Pattern 2: Webhook-to-Pusher Fan-out
**What:** Vapi sends webhook events to `/api/webhooks/vapi`. The handler (1) writes a `call_event` row, (2) updates the `call` status, and (3) triggers a Pusher event on the private call channel.
**When to use:** Every Vapi webhook event.
**Why:** Decouples Vapi's server-to-server communication from the browser. The database is the source of truth; Pusher is a notification layer.

```typescript
// /api/webhooks/vapi/route.ts (simplified)
import { pusherServer } from "@/lib/pusher-server";
import { db } from "@/db";
import { call, callEvent } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json();
  const { message } = body;

  if (message.type === "status-update") {
    const vapiCallId = message.call.id;
    const status = mapVapiStatusToAppStatus(message.status);

    // 1. Find call record by vapiCallId
    const callRecord = await db.query.call.findFirst({
      where: eq(call.vapiCallId, vapiCallId),
    });
    if (!callRecord) return new Response("OK", { status: 200 });

    // 2. Insert call_event
    await db.insert(callEvent).values({
      callId: callRecord.id,
      eventType: mapToEventType(message.status),
      metadata: JSON.stringify(message),
    });

    // 3. Update call status
    await db.update(call)
      .set({ status, updatedAt: new Date() })
      .where(eq(call.id, callRecord.id));

    // 4. Trigger Pusher event
    await pusherServer.trigger(
      `private-call-${callRecord.id}`,
      "status-change",
      { status, timestamp: new Date().toISOString() }
    );
  }

  return new Response("OK", { status: 200 });
}
```

### Pattern 3: Private Pusher Channel Per Call
**What:** Each call gets a Pusher channel named `private-call-{callId}`. The client subscribes; the server triggers events. Auth endpoint verifies the user owns the call.
**When to use:** Every call status page.
**Why:** Private channels prevent unauthorized users from listening. Per-call channels isolate events.

```typescript
// /api/pusher/auth/route.ts
import { pusherServer } from "@/lib/pusher-server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { call } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const formData = await req.formData();
  const socketId = formData.get("socket_id") as string;
  const channelName = formData.get("channel_name") as string;

  // Verify user owns this call
  const callId = channelName.replace("private-call-", "");
  const callRecord = await db.query.call.findFirst({
    where: and(eq(call.id, callId), eq(call.userId, session.user.id)),
  });
  if (!callRecord) return new Response("Forbidden", { status: 403 });

  const authResponse = pusherServer.authorizeChannel(socketId, channelName);
  return Response.json(authResponse);
}
```

### Pattern 4: Active Call Guard + Auto-Redirect
**What:** When user navigates to the app with an active call, redirect them to `/call/[id]`. Check for active calls in middleware or layout.
**When to use:** App-wide navigation guard.
**Why:** User decision: "Auto-redirect to active call status page when user returns to the app with an active call."

```typescript
// /api/call/active/route.ts
// Returns the active call ID if one exists
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ activeCallId: null });

  const activeCall = await db.query.call.findFirst({
    where: and(
      eq(call.userId, session.user.id),
      // Active = not completed and not failed
      // Use SQL: status NOT IN ('completed', 'failed')
    ),
    orderBy: (call, { desc }) => [desc(call.createdAt)],
  });

  return Response.json({ activeCallId: activeCall?.id ?? null });
}
```

### Pattern 5: Server-Side Call Initiation (Server Action or Route Handler)
**What:** The "Call Now" button triggers a server action or POST to `/api/call/start` that: creates a `call` DB row, calls Vapi API, stores `vapiCallId`, then returns the call ID for redirect.
**When to use:** When user clicks "Call Now" on confirm page.
**Why:** Server-side initiation keeps API keys secure. The call record is created BEFORE the Vapi call, so webhooks have something to reference.

### Anti-Patterns to Avoid
- **Client-side Vapi SDK:** Never expose the Vapi API key to the browser. All Vapi calls go through server routes.
- **Polling for status:** Do not poll the database for status changes. Use Pusher for real-time push. Fall back to polling ONLY if Pusher connection fails.
- **Webhook without idempotency:** Vapi may send duplicate webhooks. Use vapiCallId + event type as a dedup key, or make handlers idempotent.
- **Blocking webhook responses:** Vapi webhooks must respond quickly. Do heavy work asynchronously if needed, or keep DB writes fast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom WS server | Pusher Channels | Managed service, auto-reconnect, scales on Vercel serverless |
| Call state machine | Manual if/else status transitions | Enum-based status mapping from Vapi events | Vapi defines the lifecycle; map it, don't reinvent it |
| Retry logic for Vapi API | Custom retry with exponential backoff | `@vapi-ai/server-sdk` built-in retries (default: 2 retries) | SDK handles it automatically |
| Pusher auth token signing | HMAC signing manually | `pusher.authorizeChannel()` | One method call, no crypto needed |
| Connection state UI | Custom WebSocket health monitoring | `pusher.connection.bind('state_change', ...)` | Built-in connection state events |

**Key insight:** The entire real-time pipeline is "Vapi webhook -> DB write -> Pusher trigger." Each component (Vapi, Postgres, Pusher) is a managed service. The app is just glue code. Don't build infrastructure.

## Common Pitfalls

### Pitfall 1: Vapi Webhook URL Not Reachable in Development
**What goes wrong:** Vapi sends webhooks to your server URL, but `localhost` is not reachable from Vapi's servers. Webhooks silently fail.
**Why it happens:** Vapi is a cloud service; it cannot reach your local dev machine.
**How to avoid:** Use the Vapi CLI (`npx vapi listen`) for local webhook testing, or use a tunneling service (ngrok, Cloudflare Tunnel) to expose your local server. Alternatively, use Vapi's dashboard webhook logs to debug.
**Warning signs:** Call is created but no status updates appear. No call_event rows in the database.

### Pitfall 2: silenceTimeoutSeconds Too Low for Hold Music
**What goes wrong:** Vapi hangs up during hold because it interprets hold music silence gaps as "no one is there." The call ends with `silence-timed-out`.
**Why it happens:** Default silenceTimeoutSeconds is 30 seconds. ISP hold queues have music with gaps.
**How to avoid:** Set `silenceTimeoutSeconds: 3600` (max allowed, 1 hour) on the transient assistant. This was increased from 600s to 3600s in Nov 2024. The endedReason `silence-timed-out` in call logs indicates this happened.
**Warning signs:** Calls ending with `silence-timed-out` after a few minutes on hold.

### Pitfall 3: maxDurationSeconds Default Is Only 10 Minutes
**What goes wrong:** Call ends after 10 minutes with `exceeded-max-duration` even though the user expects it to last up to 45+ minutes.
**Why it happens:** Default maxDurationSeconds is 600 (10 minutes).
**How to avoid:** Explicitly set `maxDurationSeconds: 3600` (1 hour) on the transient assistant. Max supported value is 43200 (12 hours), but 3600 is reasonable for ISP calls. Vapi recommends staying under 3200s for reliability.
**Warning signs:** Calls consistently ending at exactly 10 minutes.

### Pitfall 4: Vapi Webhook Authentication
**What goes wrong:** Anyone can POST to your webhook endpoint, potentially injecting fake call events.
**Why it happens:** No authentication on the webhook handler.
**How to avoid:** Vapi supports a server secret header. Configure `server.secret` on the assistant and validate the `x-vapi-secret` header in your webhook handler. Alternatively, verify the `vapiCallId` exists in your database before processing.
**Warning signs:** Unexpected call events, phantom status changes.

### Pitfall 5: Pusher Channel Name Must Match Exactly
**What goes wrong:** Server triggers event on `private-call-{id}` but client subscribes to a differently formatted channel name. Events are never received.
**Why it happens:** String formatting mismatch between server and client.
**How to avoid:** Define channel name as a shared utility: `const callChannel = (id: string) => \`private-call-\${id}\``. Import on both server and client.
**Warning signs:** Pusher events trigger successfully (visible in Pusher dashboard) but client never receives them.

### Pitfall 6: Call Record Must Exist Before Vapi Call
**What goes wrong:** Vapi fires webhook before your DB insert completes. Webhook handler can't find the call record.
**Why it happens:** Race condition between `db.insert(call)` and Vapi's first webhook.
**How to avoid:** Always create the call record first, then call `vapiClient.calls.create()`, then update the record with `vapiCallId`. The webhook handler looks up by `vapiCallId`, which is set after call creation.
**Warning signs:** Webhook logs show "call not found" errors.

### Pitfall 7: Pusher Private Channel Auth Endpoint Must Be POST with form-encoded body
**What goes wrong:** Pusher client sends a form-encoded POST to your auth endpoint, but your handler expects JSON. Auth fails silently, channel subscription fails.
**Why it happens:** Pusher client library sends `socket_id` and `channel_name` as form data, not JSON.
**How to avoid:** Use `req.formData()` or configure Pusher client's `channelAuthorization.transport` correctly. The default transport is `"ajax"` which sends form-encoded.
**Warning signs:** Client subscribes to channel but never receives events. Console shows 403 or auth errors.

### Pitfall 8: Vercel Serverless Function Timeout on Webhook
**What goes wrong:** Webhook handler takes too long and the Vercel function times out.
**Why it happens:** Default Vercel timeout is 10 seconds for Hobby, 60 seconds for Pro. If DB writes or Pusher triggers are slow, the handler may time out.
**How to avoid:** Keep webhook handler lean: one DB insert, one DB update, one Pusher trigger. Avoid N+1 queries. Consider Vercel Pro for longer timeouts if needed.
**Warning signs:** Vapi logs show webhook timeouts. Missing call events in database.

## Code Examples

### Vapi Client Singleton
```typescript
// src/lib/vapi.ts
// Source: @vapi-ai/server-sdk README
import { VapiClient } from "@vapi-ai/server-sdk";

export const vapiClient = new VapiClient({
  token: process.env.VAPI_API_KEY!,
});
```

### Pusher Server Instance
```typescript
// src/lib/pusher-server.ts
// Source: Pusher docs (getting_started/javascript)
import Pusher from "pusher";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});
```

### Pusher Client Factory
```typescript
// src/lib/pusher-client.ts
// Source: pusher-js README (github.com/pusher/pusher-js)
import PusherClient from "pusher-js";

let pusherInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!pusherInstance) {
    pusherInstance = new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        channelAuthorization: {
          endpoint: "/api/pusher/auth",
          transport: "ajax",
        },
      }
    );
  }
  return pusherInstance;
}
```

### Client-Side Pusher Subscription (React)
```typescript
// Source: pusher-js README + Pusher docs
"use client";

import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";

function useCallStatus(callId: string, initialStatus: string) {
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`private-call-${callId}`);

    channel.bind("status-change", (data: { status: string }) => {
      setStatus(data.status);
    });

    // Connection state monitoring
    pusher.connection.bind("state_change", (states: { current: string }) => {
      setConnected(states.current === "connected");
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-call-${callId}`);
    };
  }, [callId]);

  return { status, connected };
}
```

### Vapi Status Mapping
```typescript
// Map Vapi status-update events to app call status enum
function mapVapiStatusToAppStatus(vapiStatus: string): string {
  const map: Record<string, string> = {
    "queued": "pending",
    "ringing": "dialing",
    "in-progress": "on_hold",  // Default to on_hold; Phase 3 will refine
    "ended": "completed",
  };
  return map[vapiStatus] ?? "pending";
}

// Map Vapi status to call_event type
function mapToEventType(vapiStatus: string): string {
  const map: Record<string, string> = {
    "queued": "created",
    "ringing": "dialing",
    "in-progress": "connected",
    "ended": "completed",
  };
  return map[vapiStatus] ?? "created";
}
```

### Call Cancellation via Vapi
```typescript
// Cancel an active call
// Source: Vapi docs (call-features)
// The controlUrl is returned when the call is created and stored in call metadata
async function cancelCall(callId: string, controlUrl: string) {
  await fetch(controlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "end-call" }),
  });
  // Also update local DB
  await db.update(call)
    .set({ status: "failed", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(call.id, callId));
}
```

## Vapi Webhook Event Reference

### Status Update Events (Confidence: HIGH)
| Vapi Status | Fires When | Maps to App Status |
|-------------|------------|-------------------|
| `queued` | Call created, waiting to connect | `pending` |
| `ringing` | Phone is ringing at ISP | `dialing` |
| `in-progress` | Call connected (ISP answered) | `on_hold` (default for Phase 2) |
| `forwarding` | Call being forwarded | N/A for Phase 2 |
| `ended` | Call terminated | `completed` or `failed` (check endedReason) |

### End-of-Call Report (Confidence: HIGH)
Sent when call concludes. Contains:
- `artifact.recording` - Recording URL
- `artifact.transcript` - Full transcript text
- `artifact.messages` - Message array
- `endedReason` - Why the call ended (68 possible values)

### Key endedReason Values for Phase 2
| endedReason | User-Facing Message |
|-------------|-------------------|
| `customer-busy` | "The line was busy. Try again." |
| `customer-did-not-answer` | "No answer. Try again." |
| `exceeded-max-duration` | "The call reached its maximum duration." |
| `silence-timed-out` | "The call was disconnected due to silence." |
| `manually-canceled` | "Call cancelled." |
| `twilio-failed-to-connect-call` | "Could not connect the call. Try again." |
| `assistant-error` | "Something went wrong. Try again." |

## Schema Assessment

### Existing Schema (No Changes Needed for Core Flow)

The existing `call` table already has:
- `vapiCallId` (text) - stores Vapi's call ID
- `status` (callStatusEnum) - full lifecycle: pending, dialing, navigating, on_hold, agent_detected, transferring, connected, completed, failed
- `startedAt` / `endedAt` timestamps
- `userId`, `ispId`, `issueCategoryId` foreign keys

The existing `call_event` table already has:
- `callId` FK, `eventType` (callEventEnum), `metadata` (text/JSON), `createdAt`

### Recommended Schema Addition

Add a `vapiControlUrl` column to `call` table for cancellation support:
```sql
ALTER TABLE call ADD COLUMN vapi_control_url text;
```

Also consider adding `ended_reason` to `call` to persist why the call ended:
```sql
ALTER TABLE call ADD COLUMN ended_reason text;
```

### Environment Variables Needed
```
# Vapi
VAPI_API_KEY=               # From Vapi dashboard
VAPI_PHONE_NUMBER_ID=       # Twilio number imported into Vapi

# Pusher
NEXT_PUBLIC_PUSHER_KEY=     # Public key (safe for client)
NEXT_PUBLIC_PUSHER_CLUSTER= # Cluster region
PUSHER_APP_ID=              # Server-only
PUSHER_SECRET=              # Server-only

# Existing (already set)
# DATABASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
```

## Claude's Discretion Recommendations

### Progress Visualization: Step Indicator with Status Label
**Recommendation:** Use a horizontal step indicator showing the call's progress through defined stages, combined with a prominent status label. This provides more visual feedback than a label alone without becoming dashboard-like.

The steps should be: Dialing -> Ringing -> Connected -> On Hold -> Complete. Show "Navigating Menu" and "Agent Found" as defined but grayed-out/future steps that won't activate until Phase 3.

**Rationale:** The user already has a step indicator pattern in the app (`StepIndicator` component for ISP selection flow). Reusing this concept maintains visual consistency. A lone status label feels too sparse for a page the user may stare at for 30+ minutes.

### Hold Timeout Duration: 45 Minutes
**Recommendation:** Set `maxDurationSeconds: 2700` (45 minutes). This matches the success criteria ("up to 45 minutes") and stays well under Vapi's recommended 3200s limit.

Set `silenceTimeoutSeconds: 3600` (1 hour, the maximum) to prevent premature disconnection during hold music gaps.

**Rationale:** ISP hold times rarely exceed 30 minutes. 45 minutes provides buffer. Going to 60 minutes risks unnecessary Vapi costs with diminishing returns. The silence timeout should be higher than the max duration to ensure the silence timer never triggers before the max duration does.

### Loading State: Skeleton Card with Pulse Animation
**Recommendation:** Show a skeleton version of the status card with a subtle pulse CSS animation while the initial call data loads. Use Tailwind's `animate-pulse` on placeholder blocks that match the status card layout.

### Error Messaging Copy
| Scenario | Title | Body |
|----------|-------|------|
| Busy signal | "Line busy" | "The ISP's line is busy right now. This usually clears up quickly." |
| No answer | "No answer" | "The call wasn't answered. This can happen during peak hours." |
| Vapi error | "Something went wrong" | "We couldn't place the call. This is usually temporary." |
| Max duration | "Call timed out" | "The call reached its maximum duration of 45 minutes." |
| User cancel | "Call cancelled" | "You cancelled the call." |

All error states should show a "Try Again" button that returns to the confirm page with the same ISP/category pre-selected.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `silenceTimeoutSeconds` max 600s | Max 3600s (1 hour) | Nov 30, 2024 | Critical for hold-time survival |
| Vapi webhook at phone number level only | `server` config on assistant | 2025 | Transient assistants can set their own webhook URL |
| Basic Vapi SDK (`@vapi-ai/web`) | `@vapi-ai/server-sdk` for server | 2024 | Proper server-side SDK with types and retries |
| Pusher auth via `authenticate()` | `authorizeChannel()` | pusher-js 8.x | Method renamed; old name deprecated |

**Deprecated/outdated:**
- `pusher.authenticate()` is deprecated; use `pusher.authorizeChannel()` instead (since pusher-js 8.x)
- Vapi's `@vapi-ai/web` SDK is for browser-side web calls, NOT for server-side call creation

## Open Questions

1. **Vapi controlUrl persistence**
   - What we know: The `controlUrl` is returned in the call creation response under `monitor.controlUrl`. It can be used to end the call programmatically.
   - What's unclear: Whether the `controlUrl` remains valid for the entire call duration (up to 45 min). Vapi docs don't explicitly state expiry.
   - Recommendation: Store the `controlUrl` in the `call` record. If it expires, fall back to using `vapiClient.calls.update()` or Twilio API directly to end the call.

2. **Vapi webhook signature verification**
   - What we know: Vapi supports a `server.secret` config on the assistant. The header name is `x-vapi-secret`.
   - What's unclear: Exact header format and whether HMAC signing is used or if it's a simple shared secret comparison.
   - Recommendation: Implement simple secret comparison for Phase 2. Upgrade to HMAC if Vapi adds it later.

3. **ISP support phone numbers**
   - What we know: The `isp` table has a `supportPhone` column (nullable).
   - What's unclear: Whether ISP support numbers are populated in seed data. They need to be added for outbound calling to work.
   - Recommendation: Add real ISP support numbers to the seed data in this phase.

## Sources

### Primary (HIGH confidence)
- Context7: `/llmstxt/vapi_ai_llms_txt` - Vapi outbound calling, server events, assistant configuration
- Context7: `/websites/pusher` - Pusher Channels server/client integration, private channels, auth
- Vapi official docs: https://docs.vapi.ai/calls/outbound-calling - Outbound call API
- Vapi official docs: https://docs.vapi.ai/server-url/events - Webhook event types and payloads
- Vapi official docs: https://docs.vapi.ai/calls/call-ended-reason - 68 endedReason codes
- Vapi official docs: https://docs.vapi.ai/calls/call-features - Live call control (end-call, say, transfer)
- Vapi changelog: https://docs.vapi.ai/changelog/2024/11/30 - silenceTimeoutSeconds extended to 3600
- Pusher docs: https://pusher.com/docs/channels/server_api/authorizing-users/ - Private channel auth
- GitHub: https://github.com/pusher/pusher-js - pusher-js client README
- GitHub: https://github.com/VapiAI/server-sdk-typescript - Vapi server SDK

### Secondary (MEDIUM confidence)
- Vapi community: https://vapi.ai/community/m/1397025891628093530 - maxDurationSeconds max is 43200
- npm: @vapi-ai/server-sdk v0.11.0 - latest version confirmed via npm search

### Tertiary (LOW confidence)
- WebSearch: Pusher with Next.js App Router patterns - multiple blog posts agree on route handler approach for auth

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries confirmed via official docs, Context7, and npm
- Architecture: HIGH - Patterns derived from official Vapi + Pusher documentation
- Pitfalls: HIGH - Informed by Vapi community discussions and official changelog
- Schema: HIGH - Existing schema inspected directly; additions are minimal

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days; Vapi API is stable, Pusher is mature)
