# Architecture Patterns

**Domain:** Autonomous outbound phone call handler (ISP hold-waiting service)
**Researched:** 2026-02-06
**Overall confidence:** MEDIUM-HIGH

## Recommended Architecture

EasyCallAI is a dual-call orchestration system. The core challenge is managing two independent phone calls (one to the ISP, one to the user) and bridging them together at the right moment, all while providing real-time browser feedback. This is fundamentally a state machine problem wrapped in telephony.

```
Browser (Next.js)  <-->  API Routes  <-->  Database (PostgreSQL)
                            |                     ^
                            v                     |
                      Vapi AI API  ----webhooks--->  Webhook Handler
                            |                     |
                            v                     v
                    ISP Phone Call          Realtime Channel
                    User Callback              (Pusher)
                            \                    |
                             \                   v
                              \--bridge-->  User's Browser
```

### High-Level Flow

1. **User submits request** via browser (ISP + issue description)
2. **API route creates Vapi outbound call** to ISP number with IVR-navigation assistant
3. **Vapi assistant navigates phone tree** using DTMF tool and speech
4. **Vapi assistant waits on hold**, detecting when a human agent answers
5. **Webhook fires** on human-detected event; backend updates call state
6. **Vapi assistant stalls agent** ("one moment, connecting you now")
7. **Backend initiates warm transfer** to user's phone number via Vapi transfer plan
8. **User answers** and gets merged into the ISP conference call
9. **AI assistant drops off**, leaving user and ISP agent connected
10. **End-of-call-report webhook** fires; backend records outcome

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Next.js Frontend** | User auth, ISP selection, issue input, real-time status display | API Routes, Pusher (subscribe) |
| **API Routes (Next.js)** | Call creation, call state queries, auth middleware | Vapi API, Database, Pusher (publish) |
| **Webhook Handler (API Route)** | Receives all Vapi server messages, updates call state, triggers next actions | Vapi API (live call control), Database, Pusher (publish) |
| **Vapi AI Assistant** | IVR navigation, hold waiting, human detection, agent stalling, transfer execution | ISP phone system, Vapi platform |
| **PostgreSQL + Drizzle** | Call records, user accounts, ISP configs, call state persistence | API Routes, Webhook Handler |
| **Pusher (or similar)** | Real-time event broadcast to browser | Webhook Handler (publish), Frontend (subscribe) |
| **BetterAuth + SMS** | User authentication via phone number | API Routes, Frontend |

### Data Flow

**Outbound direction (user -> ISP):**
```
User Browser
  -> POST /api/calls/create
    -> Validate user + ISP config
    -> Insert call record (state: "initiating")
    -> POST https://api.vapi.ai/call (outbound call creation)
    -> Store vapi_call_id in DB
    -> Publish "call_initiated" to Pusher channel
    -> Return call ID to browser
```

**Webhook direction (Vapi -> backend -> browser):**
```
Vapi Platform
  -> POST /api/webhooks/vapi
    -> Parse message.type
    -> Switch on event type:
       status-update: Update call state in DB, publish to Pusher
       transcript: Store transcript, publish live transcript to Pusher
       tool-calls: Execute business logic (e.g., determine transfer destination)
       transfer-update: Update call state to "transferring"
       end-of-call-report: Finalize call record, store recording/transcript
    -> Return appropriate response to Vapi
```

**Transfer/bridge direction (ISP call -> user phone):**
```
Webhook detects human agent (via transcript/speech-update analysis)
  -> Update call state to "agent_detected"
  -> Publish "agent_detected" to Pusher
  -> Vapi assistant stalls agent with conversation
  -> Webhook handler triggers transfer via controlUrl or transferCall tool
  -> Vapi initiates warm-transfer-experimental to user's phone
  -> User answers -> calls merge in Twilio conference
  -> Assistant drops off
  -> Publish "connected" to Pusher
```

---

## Core Architecture Decisions

### Decision 1: Vapi Warm Transfer (not dual-call orchestration)

**Recommendation:** Use Vapi's built-in `warm-transfer-experimental` mode rather than creating and managing two independent Vapi calls.

**Confidence:** HIGH (verified via official Vapi documentation)

**Why:** Vapi's warm transfer system handles the hard part: it places the ISP caller on hold with audio, dials the user's phone, and automatically merges both parties into a Twilio conference when the user answers. The assistant-based warm transfer variant even lets you configure a secondary AI assistant to greet the user before merging. This eliminates the need to manually orchestrate two separate Vapi calls and bridge them via Twilio conference APIs.

**How it works:**
1. ISP call is active with Vapi assistant
2. Assistant detects human agent and triggers `transferCall` tool
3. Transfer plan uses `warm-transfer-experimental` mode
4. Vapi places ISP agent on hold (with hold audio)
5. Vapi dials user's phone number
6. When user answers, calls merge automatically
7. Assistant exits the conference

**Critical constraint:** Warm transfer currently requires **Twilio-based telephony** (Twilio, Vapi phone numbers, or SIP trunks). It does not work with Telnyx or Vonage. Use Twilio or Vapi's own phone numbers.

**Source:** https://docs.vapi.ai/calls/assistant-based-warm-transfer, https://docs.vapi.ai/call-forwarding

### Decision 2: Single webhook endpoint, event-driven state machine

**Recommendation:** One `/api/webhooks/vapi` route that dispatches on `message.type`. The webhook handler is the central nervous system -- it receives all Vapi events and drives state transitions.

**Confidence:** HIGH (standard Vapi pattern, verified via docs)

**Vapi server message types relevant to this system:**

| Event Type | When It Fires | What We Do |
|------------|--------------|------------|
| `status-update` | Call status changes (queued, ringing, in-progress, ended) | Update DB call state, publish to Pusher |
| `transcript` | Real-time speech transcription | Analyze for human detection, store, publish to Pusher |
| `speech-update` | Speech starts/stops per role | Detect when ISP side starts talking (human agent detection) |
| `tool-calls` | Assistant invokes a tool | Handle custom tools (e.g., "human_detected", "ready_to_transfer") |
| `transfer-update` | Transfer occurs | Update state to "transferring", publish to Pusher |
| `transfer-destination-request` | Dynamic transfer routing | Return user's phone number as destination |
| `end-of-call-report` | Call ends | Store recording, transcript, finalize call record |
| `hang` | Assistant delay detected | Log, potentially alert user |
| `conversation-update` | Conversation history update | Store for debugging/audit |

**Source:** https://docs.vapi.ai/server-url/events

### Decision 3: Pusher for real-time browser updates (not SSE, not WebSocket)

**Recommendation:** Use **Pusher Channels** (or Ably) for real-time push from backend to browser. Do not attempt SSE or WebSocket on Vercel serverless.

**Confidence:** HIGH (verified via Vercel official guidance)

**Why not SSE on Vercel:**
- Vercel serverless functions have a 25-second timeout (even with streaming)
- SSE requires a persistent connection that serverless cannot maintain reliably
- Auto-reconnect creates a poor UX for status updates that might arrive seconds apart
- Next.js SSE in API routes has documented buffering issues

**Why not WebSocket on Vercel:**
- Vercel does not natively support WebSocket connections in serverless functions
- Workarounds like Rivet Actors add significant complexity for a simple pub/sub need

**Why Pusher:**
- Purpose-built for exactly this pattern: server publishes, browser subscribes
- First-class Vercel integration (official Vercel guide exists)
- Free tier supports 200K messages/day and 100 concurrent connections (sufficient for MVP)
- Client library is ~10KB, trivial to add
- Channel-per-call model maps perfectly to our use case

**Pattern:**
```
Webhook handler receives Vapi event
  -> Process event, update DB
  -> pusher.trigger(`call-${callId}`, 'status', { state, message, timestamp })

Browser subscribes on call creation
  -> const channel = pusher.subscribe(`call-${callId}`)
  -> channel.bind('status', (data) => updateUI(data))
```

**Alternative considered:** Supabase Realtime (since we use PostgreSQL). Rejected because it requires Supabase hosting or their client SDK for realtime, adding unnecessary coupling. Pusher is a thin, orthogonal layer.

**Source:** https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel, https://vercel.com/kb/guide/deploying-pusher-channels-with-vercel

### Decision 4: Call state machine in database

**Recommendation:** Model call lifecycle as an explicit state machine with states stored in PostgreSQL. State transitions happen in the webhook handler and are the single source of truth.

**Confidence:** HIGH (standard pattern for async telephony workflows)

**Call states:**

```
initiating        -> User requested call, Vapi API call pending
queued            -> Vapi accepted, call queued
ringing           -> ISP phone ringing
in_progress       -> ISP phone answered (likely IVR)
navigating_ivr    -> Assistant actively pressing DTMF / speaking to IVR
on_hold           -> Assistant waiting on hold music/queue
agent_detected    -> Human agent answered (speech detected)
stalling_agent    -> Assistant making small talk to keep agent engaged
transferring      -> Warm transfer initiated to user's phone
user_ringing      -> User's phone is ringing
connected         -> User and ISP agent are bridged, assistant dropping off
completed         -> Call ended successfully (user spoke with agent)
failed            -> Call failed (ISP hung up, transfer failed, timeout, etc.)
cancelled         -> User cancelled before connection
```

**State transition rules:**
- Only forward transitions allowed (no going back to `navigating_ivr` from `on_hold`)
- `failed` and `cancelled` are terminal states reachable from any non-terminal state
- `completed` is only reachable from `connected`
- Each transition logs timestamp and trigger event for debugging

**Database schema (simplified):**
```sql
calls (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users(id),
  isp_id          UUID REFERENCES isps(id),
  vapi_call_id    TEXT,
  state           call_state_enum NOT NULL DEFAULT 'initiating',
  issue_description TEXT,
  phone_number    TEXT,           -- User's phone number for callback
  isp_phone_number TEXT,          -- ISP's support number
  transcript      JSONB,
  recording_url   TEXT,
  metadata        JSONB,          -- Vapi call object, error details, etc.
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ
)

call_events (
  id              UUID PRIMARY KEY,
  call_id         UUID REFERENCES calls(id),
  event_type      TEXT NOT NULL,   -- Vapi message type
  from_state      call_state_enum,
  to_state        call_state_enum,
  payload         JSONB,           -- Raw webhook payload (redacted)
  created_at      TIMESTAMPTZ
)
```

### Decision 5: Assistant configuration strategy

**Recommendation:** Use a single **transient assistant** per call (not a saved/reusable assistant). The assistant prompt is dynamically generated based on the target ISP's known phone tree structure.

**Confidence:** MEDIUM (best practice from Vapi docs for customized calls; human detection approach is partially novel)

**Why transient:**
- Each ISP has a different phone tree, requiring different DTMF sequences
- The user's issue description must be embedded in the prompt
- Vapi recommends transient assistants for scheduled/dynamic calls to avoid mutation issues

**Assistant configuration structure:**
```typescript
{
  model: {
    provider: "openai",
    model: "gpt-4o-mini",  // Fast, cheap, sufficient for IVR nav
    messages: [{
      role: "system",
      content: buildIspPrompt(isp, userIssue)
      // Includes: IVR tree map, DTMF sequences, hold behavior,
      //           human detection instructions, stalling script
    }]
  },
  voice: {
    provider: "11labs",     // Or deepgram, for natural speech
    voiceId: "...",
  },
  transcriber: {
    provider: "deepgram",
  },
  serverUrl: "https://easycallai.vercel.app/api/webhooks/vapi",
  serverMessages: [
    "status-update",
    "transcript",
    "speech-update",
    "tool-calls",
    "transfer-update",
    "transfer-destination-request",
    "end-of-call-report",
    "hang"
  ],
  tools: [
    { type: "dtmf" },          // IVR navigation
    {
      type: "function",
      function: {
        name: "transferCall",
        // ... transfer tool with warm-transfer-experimental plan
      }
    },
    { type: "endCall" }
  ],
  firstMessage: " ",  // Silent -- don't speak until IVR prompts
  silenceTimeoutSeconds: 120,  // Long timeout for hold waiting
  maxDurationSeconds: 1800,    // 30 min max (ISP holds can be long)
}
```

**Human agent detection strategy:**
The assistant prompt instructs the AI to distinguish between IVR recordings and live humans by:
1. Listening for conversational speech patterns (questions directed at the caller)
2. Listening for agent identification ("Hi, my name is X, how can I help you?")
3. When confident a human is speaking, triggering the transfer tool
4. Before transferring, stalling with natural responses ("Yes, one moment please, let me get the account holder on the line")

This is the least certain part of the architecture. IVR-to-human transitions vary wildly by ISP. The prompt engineering for each ISP will need iterative testing.

**Source:** https://docs.vapi.ai/calls/outbound-calling, https://docs.vapi.ai/ivr-navigation, https://docs.vapi.ai/tools/default-tools

---

## Patterns to Follow

### Pattern 1: Channel-per-call Pusher isolation

**What:** Each call gets its own Pusher channel (`private-call-{callId}`). The browser subscribes on call creation and unsubscribes on completion.

**When:** Always. Every call needs isolated real-time updates.

**Why:** Prevents cross-talk between users. Private channels enable auth (Pusher verifies the user owns the call). Simple mental model: one call = one channel.

```typescript
// Backend (webhook handler)
await pusher.trigger(`private-call-${callId}`, 'state-change', {
  state: 'agent_detected',
  message: 'A support agent has answered! Connecting you now...',
  timestamp: new Date().toISOString()
});

// Frontend
const channel = pusher.subscribe(`private-call-${callId}`);
channel.bind('state-change', (data) => {
  setCallState(data.state);
  setStatusMessage(data.message);
});
```

### Pattern 2: ISP configuration as data, not code

**What:** Store ISP phone trees, support numbers, and DTMF sequences as structured data in the database, not hardcoded in assistant prompts.

**When:** From the start. Even with 2-3 ISPs, this pays off immediately.

**Why:** Adding new ISPs should be a data operation, not a code change. The assistant prompt is *generated* from ISP config data.

```typescript
// ISP config in database
{
  name: "Comcast Xfinity",
  supportNumber: "+18001234567",
  phoneTree: [
    { prompt: "For English, press 1", action: "dtmf", keys: "1" },
    { prompt: "For technical support, press 2", action: "dtmf", keys: "2" },
    { prompt: "Please enter your account number", action: "speak", value: "I don't have my account number available" },
    { prompt: "Hold for next available agent", action: "wait" }
  ],
  estimatedHoldTime: "15-45 minutes",
  agentGreetingPattern: "Thank you for calling .* my name is"
}
```

### Pattern 3: Idempotent webhook processing

**What:** Webhook handler checks for duplicate events before processing. Use Vapi's message ID or call ID + event type + timestamp as a deduplication key.

**When:** Always. Vapi may retry webhooks if your server responds slowly.

**Why:** Prevents duplicate state transitions, duplicate Pusher publishes, and duplicate transfer attempts.

```typescript
// In webhook handler
const eventKey = `${callId}:${messageType}:${timestamp}`;
const existing = await db.query.callEvents.findFirst({
  where: eq(callEvents.dedup_key, eventKey)
});
if (existing) return new Response('OK', { status: 200 }); // Already processed
```

### Pattern 4: Webhook response within 5 seconds

**What:** Vapi expects webhook responses within ~6 seconds. For request-response events (tool-calls, assistant-request, transfer-destination-request), the response payload controls call behavior.

**When:** Always. This is a hard requirement from Vapi.

**Why:** Slow webhook responses cause call quality issues. Vapi may retry or timeout.

**Implication for Vercel:** Serverless cold starts on Vercel can eat 1-2 seconds. Consider:
- Keeping the webhook route warm with a cron ping
- Minimizing database queries in the hot path
- Using Vercel's Edge Runtime for the webhook handler if response body is simple

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Polling for call status from the browser

**What:** Browser repeatedly hitting `/api/calls/{id}/status` to check for updates.

**Why bad:** High latency (seconds between polls), wastes API calls, poor UX during critical moments (agent detection, transfer), and burns serverless function invocations.

**Instead:** Use Pusher push model. Zero polling. Instant updates.

### Anti-Pattern 2: Storing call state only in memory

**What:** Keeping call state in a variable or in-memory store within a serverless function.

**Why bad:** Vercel serverless functions are stateless. Each webhook invocation may hit a different instance. State will be lost between invocations.

**Instead:** PostgreSQL is the single source of truth for call state. Every webhook handler reads current state from DB, computes transition, writes new state to DB.

### Anti-Pattern 3: Creating two independent Vapi calls and manually bridging

**What:** Creating one Vapi call to the ISP and a separate Vapi call to the user, then trying to bridge them via Twilio conference API.

**Why bad:** Massively more complex. Requires direct Twilio API integration alongside Vapi. Race conditions around timing. Vapi's warm transfer does this for you.

**Instead:** Use Vapi's `warm-transfer-experimental` or `assistant-based-warm-transfer` mode. One Vapi call to ISP, and Vapi handles the user callback and bridging internally.

### Anti-Pattern 4: Monolithic assistant prompt

**What:** One giant system prompt that tries to handle IVR navigation, hold waiting, human detection, stalling, and transfer all at once.

**Why bad:** Hard to maintain, hard to test, LLM context window issues on long holds, different ISPs need different prompts.

**Instead:** Build prompts from composable sections:
- Base behavior (voice persona, general rules)
- ISP-specific IVR navigation instructions
- Hold behavior (patience, silence, detect music)
- Human detection rules
- Stalling and transfer instructions

### Anti-Pattern 5: SSE or long-polling on Vercel for real-time

**What:** Implementing Server-Sent Events or long-polling in Next.js API routes deployed on Vercel.

**Why bad:** Vercel serverless functions timeout at 25 seconds (even with Fluid Compute). SSE connections drop. Long-polling wastes function execution time. Neither approach is reliable for events that might be 20+ minutes apart (hold times).

**Instead:** Pusher/Ably dedicated real-time infrastructure. Fire-and-forget from webhook handler, instant delivery to browser.

---

## Scalability Considerations

| Concern | At 10 users | At 1K users | At 10K users |
|---------|-------------|-------------|--------------|
| **Concurrent Vapi calls** | Trivial; within free tier | May hit Vapi concurrency limits; need paid plan | Requires enterprise Vapi plan with high concurrency |
| **Webhook throughput** | Single Vercel function handles easily | May need to optimize DB writes (batch inserts for events) | Consider dedicated webhook processor (not Vercel) |
| **Pusher channels** | Well within free tier (100 connections) | Need Pusher paid plan | Need Pusher enterprise or switch to Ably |
| **Database connections** | Drizzle + single connection fine | Connection pooling needed (e.g., PgBouncer or Neon pooler) | Connection pooling critical; consider read replicas |
| **Hold time costs** | Negligible | Vapi per-minute costs add up; optimize IVR navigation speed | Major cost concern; need ISP-specific optimization |
| **Twilio phone numbers** | 1-2 outbound numbers sufficient | May need number pool for caller ID rotation | Definitely need number pool + A2P compliance |

---

## Suggested Build Order

Based on component dependencies, here is the recommended sequence:

### Phase 1: Foundation (no telephony)
**Build:** Database schema, auth (BetterAuth + SMS), user signup flow, ISP selection UI

**Why first:** Everything depends on having users and ISP data. No external service dependencies to debug. Can be fully tested locally.

**Dependencies satisfied:** User model, ISP model, call model (schema only)

### Phase 2: Vapi integration (outbound call only)
**Build:** Vapi API client, outbound call creation, webhook endpoint, basic call state machine (initiating -> in_progress -> completed/failed)

**Why second:** This proves the core telephony integration works. No IVR navigation yet -- just call an ISP number and hang up. Tests webhook delivery, state persistence, and Vapi configuration.

**Dependencies satisfied:** Can create calls, receive webhooks, track state

### Phase 3: Real-time updates
**Build:** Pusher integration, channel-per-call pattern, frontend status display component

**Why third:** Once webhooks work (Phase 2), wire them to the browser. This is a thin integration layer. Seeing call status in real-time in the browser is the first "wow" moment.

**Dependencies satisfied:** Users can see live call status

### Phase 4: IVR navigation + hold detection
**Build:** ISP phone tree configs, dynamic assistant prompt generation, DTMF tool usage, hold detection logic, human agent detection

**Why fourth:** This is the hard AI/telephony work. Requires Phase 2 (working calls) and Phase 3 (real-time feedback for testing). Will require iterative testing per ISP.

**Dependencies satisfied:** AI can navigate to a human agent

### Phase 5: Transfer and bridging
**Build:** Warm transfer configuration, transfer-destination-request handler, agent stalling prompt, user callback flow, conference merging

**Why fifth:** Depends on Phase 4 (must reach a human agent before you can transfer). This completes the core product loop.

**Dependencies satisfied:** Full end-to-end flow works

### Phase 6: Polish and edge cases
**Build:** Error handling (ISP hangs up, user doesn't answer callback, transfer fails), retry logic, call history UI, recording playback, estimated hold time display

**Why last:** These are quality-of-life features that depend on the full flow working. Can't handle edge cases until the happy path is proven.

---

## Open Questions and Risks

### Risk 1: Human agent detection reliability (HIGH RISK)
**What:** Distinguishing IVR recordings from live human agents via speech analysis alone is imprecise. Some IVRs have very natural-sounding recorded messages. Some agents start with scripted greetings that sound automated.

**Mitigation:** Start with conservative detection (wait for conversational back-and-forth). Accept some false negatives (agent waiting while AI confirms) over false positives (transferring user to an IVR prompt). Collect data and iterate prompt engineering per ISP.

**Confidence:** LOW -- this needs extensive real-world testing.

### Risk 2: Vapi warm transfer provider lock-in (MEDIUM RISK)
**What:** Warm transfer only works with Twilio-based telephony. If Vapi adds/changes provider support, architecture may need adjustment.

**Mitigation:** Use Vapi's own phone numbers (backed by Twilio) or import Twilio numbers. Avoid Telnyx/Vonage for the primary ISP call.

**Confidence:** HIGH -- explicitly stated in Vapi docs.

### Risk 3: Long hold times and Vapi costs (MEDIUM RISK)
**What:** ISP hold times can be 30-60+ minutes. Vapi charges per minute. A 45-minute hold costs real money per call.

**Mitigation:** Set `maxDurationSeconds` to a reasonable cap (30-45 min). Show estimated hold time to users. Consider a tiered pricing model or credit system. Monitor actual hold times per ISP to set expectations.

**Confidence:** MEDIUM -- pricing depends on actual usage patterns.

### Risk 4: Webhook cold starts on Vercel (LOW-MEDIUM RISK)
**What:** Vapi expects webhook responses within ~6 seconds. Vercel cold starts can add 1-2 seconds. Database connection establishment adds more.

**Mitigation:** Use Neon serverless driver (HTTP-based, no TCP connection needed). Keep webhook handler lightweight. Consider Vercel cron job to keep function warm. Use Edge Runtime if response body doesn't require heavy computation.

**Confidence:** MEDIUM -- needs benchmarking in production.

### Risk 5: DTMF reliability across ISPs (MEDIUM RISK)
**What:** DTMF tone recognition varies by IVR system. Some systems expect in-band audio tones, others expect RFC 2833 out-of-band signals. Timing sensitivity varies.

**Mitigation:** Implement progressive retry strategy per Vapi docs (fast -> medium -> slow -> spoken fallback). Test each ISP's phone tree manually first. Store working DTMF configurations per ISP.

**Confidence:** MEDIUM -- Vapi docs acknowledge this is ISP-dependent.

---

## Sources

**HIGH confidence (official documentation):**
- Vapi Outbound Calling: https://docs.vapi.ai/calls/outbound-calling
- Vapi Server URL / Events: https://docs.vapi.ai/server-url/events
- Vapi IVR Navigation: https://docs.vapi.ai/ivr-navigation
- Vapi Call Forwarding / Transfer: https://docs.vapi.ai/call-forwarding
- Vapi Assistant-Based Warm Transfer: https://docs.vapi.ai/calls/assistant-based-warm-transfer
- Vapi Live Call Control: https://docs.vapi.ai/calls/call-features
- Vapi Dynamic Transfers: https://docs.vapi.ai/calls/call-dynamic-transfers
- Vapi Default Tools (DTMF, transferCall): https://docs.vapi.ai/tools/default-tools
- Vapi Call Handling with Twilio (conference pattern): https://docs.vapi.ai/calls/call-handling-with-vapi-and-twilio
- Vercel Real-time Pub/Sub Guide: https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel
- Vercel Pusher Integration: https://vercel.com/kb/guide/deploying-pusher-channels-with-vercel

**MEDIUM confidence (verified with multiple sources):**
- Vercel SSE limitations (25s timeout, buffering issues): Multiple GitHub discussions + Vercel community posts
- Pusher free tier limits: Pusher official pricing page
- Drizzle ORM + Neon serverless driver compatibility: Context7 + official docs

**LOW confidence (needs validation):**
- Human agent detection via speech analysis accuracy -- no authoritative source; this is novel application behavior
- Actual ISP hold times and DTMF sequences -- requires real-world testing per ISP
