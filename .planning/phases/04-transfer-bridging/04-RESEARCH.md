# Phase 4: Transfer & Bridging - Research

**Researched:** 2026-02-06
**Domain:** Vapi call transfer, Twilio conferencing, real-time call orchestration
**Confidence:** MEDIUM

## Summary

Phase 4 bridges the AI call with the ISP agent to the user's phone. The core technical challenge is that Vapi does not natively support three-way conferencing or keeping the AI talking while simultaneously dialing a third party. Vapi's built-in `transferCall` tool (including `warm-transfer-experimental`) places the caller on hold while dialing the destination -- it cannot keep the AI stalling the ISP agent while calling the user in parallel.

The recommended approach uses **hybrid server-side orchestration**: when the AI detects a human agent, the webhook handler triggers two parallel actions: (1) instructs the AI to switch to stalling behavior via the tool-call response, and (2) initiates an asynchronous server-side sequence that uses the Vapi controlUrl to transfer the ISP call into a Twilio conference, then uses the Twilio API to dial the user into that same conference. Once the user connects, the AI leg is dropped.

**Primary recommendation:** Use Vapi's controlUrl for live call control (transfer to conference) combined with Twilio's Conference Participant API for the user callback. Do NOT rely on Vapi's built-in transferCall tool -- it does not support the stall-while-dialing pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- AI identifies as an assistant calling on behalf of the user (transparent, not impersonating the customer)
- Tone: polite, competent, minimal -- no fumbling or chatty filler
- Callback via Twilio phone call to the user's phone number on file
- One attempt only -- if user doesn't answer, move to failure handling (no retries)
- User hears nothing when they pick up -- immediate bridge into the conference with the ISP agent (no AI greeting)
- Silent drop -- AI disconnects its leg without saying anything
- Drop happens immediately when the user's call leg connects to the conference (no delay, no waiting for user to speak)
- System monitors the conference after AI drops off -- detects when user/agent hang up, records call duration, updates status to completed
- Failure: user doesn't answer callback -- AI apologizes to ISP agent and hangs up ("I'm sorry, they're unavailable right now. We'll call back later. Thank you!")
- Failure: ISP agent hangs up during stall -- UI notifies user that the agent hung up and the call ended, no automatic redial
- Failure: conference/bridge technical failure -- fail immediately and notify user in UI (no retries), show error summary with option to start over
- All frontend UI work must use the `frontend-design` skill

### Claude's Discretion
- Stalling script content and conversation tactics
- Maximum stall duration before giving up
- UI state transitions during the callback/bridge flow (how granular the status updates are)
- Post-handoff UI design (connected state, call timer, etc.)
- Loading/transition animations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vapi server SDK | ^0.11.0 | AI call management, controlUrl access | Already in use; provides `monitor.controlUrl` for live call control |
| Twilio Node.js SDK | ^5.12.1 | Conference creation, participant management, outbound calls | Already in use for OTP; Twilio is the telephony provider behind Vapi |
| Pusher | ^5.3.2 / ^8.4.0 | Real-time UI status updates | Already in use for call status events |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Drizzle ORM | existing | Call record updates, event logging | Track transfer state in DB |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side Twilio conferencing | Vapi built-in transferCall | Vapi's transferCall places caller on hold (no stalling), has known bugs with warm-transfer-experimental fallback. Our use case requires AI to keep talking while dialing user. |
| Vapi controlUrl transfer | Direct Twilio call update | controlUrl is simpler for managing the Vapi-owned call. Direct Twilio update requires knowing the underlying Twilio CallSid. |

**Installation:**
```bash
# No new packages needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Architecture: Hybrid Vapi + Twilio Orchestration

The transfer flow spans two systems: Vapi (AI call management) and Twilio (telephony/conferencing). The key insight is that the Vapi call to the ISP runs on Twilio infrastructure, so we can use Twilio's conference APIs to bridge the call.

```
src/
├── lib/
│   ├── transfer-orchestrator.ts   # Core transfer logic (stall, callback, bridge, drop)
│   └── stall-prompt.ts            # Stalling behavior prompt content
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── vapi/route.ts      # Extended: handle human_detected → trigger transfer
│   │   │   └── twilio/
│   │   │       └── conference-status/route.ts  # Twilio conference status callbacks
│   │   └── call/
│   │       └── ...                # Existing call management routes
│   └── call/[id]/
│       └── call-status-client.tsx # Extended: transferring/connected states
```

### Pattern 1: Transfer Orchestration Sequence

**What:** A server-side state machine that manages the full transfer lifecycle.
**When to use:** Triggered when `human_detected` tool-call webhook fires.

```
                    human_detected webhook fires
                              │
                              ▼
              ┌───────────────────────────────┐
              │  1. Update status: agent_detected │
              │  2. Return stall instructions     │
              │  3. Start async transfer sequence │
              └───────────────────────────────┘
                              │
           ┌──────────────────┴──────────────────┐
           ▼                                      ▼
   AI stalls ISP agent                   Server calls user via Twilio
   (polite conversation)                 (outbound to user's phone)
           │                                      │
           │                              ┌───────┴───────┐
           │                              │               │
           │                         User answers    User doesn't answer
           │                              │               │
           │                              ▼               ▼
           │                     Create Twilio      AI apologizes to
           │                     conference         ISP agent, hangs up
           │                              │
           │                              ▼
           ▼                     Transfer ISP call
   AI continues stalling        into conference via
   until bridge ready           Vapi controlUrl
                                          │
                                          ▼
                                 User + ISP agent
                                 in conference
                                          │
                                          ▼
                                 AI leg dropped
                                 (Vapi end-call)
                                          │
                                          ▼
                                 Monitor conference
                                 until both hang up
```

### Pattern 2: Vapi controlUrl Live Call Control

**What:** Use the controlUrl (already stored in DB as `vapiControlUrl`) to manage the AI call mid-flight.
**When to use:** For transferring the ISP call to a conference and for ending the AI leg.

```typescript
// Source: Vapi Live Call Control docs (https://docs.vapi.ai/calls/call-features)

// Transfer call to a phone number / conference
await fetch(controlUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "transfer",
    destination: {
      type: "number",
      number: "+1234567890",
    },
  }),
});

// End the call
await fetch(controlUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "end-call",
  }),
});

// Make assistant say something
await fetch(controlUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "say",
    content: "I'm sorry, they're unavailable right now. We'll call back later. Thank you!",
    endCallAfterSpoken: true,
  }),
});
```

### Pattern 3: Twilio Conference + Participant API

**What:** Create a Twilio conference by dialing the user into a named conference room, then redirect the ISP call into the same room.
**When to use:** For the callback-to-user and bridge phases.

```typescript
// Source: Twilio Conference Participant API (https://www.twilio.com/docs/voice/api/conference-participant-resource)

import twilio from "twilio";

const client = twilio(accountSid, authToken);

// Add user to conference via outbound call
const participant = await client.conferences("transfer-{callId}")
  .participants.create({
    from: process.env.TWILIO_PHONE_NUMBER!, // Our Twilio number
    to: userPhoneNumber,                    // User's phone on file
    startConferenceOnEnter: true,
    endConferenceOnExit: true,              // End when user hangs up
    statusCallback: `${appUrl}/api/webhooks/twilio/conference-status`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

// Redirect existing ISP call into conference
// Using Twilio call update with inline TwiML
await client.calls(twilioCallSid).update({
  twiml: '<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false">transfer-{callId}</Conference></Dial></Response>',
});
```

### Pattern 4: Stalling AI Behavior via Tool Response

**What:** When `human_detected` fires, the tool response instructs the AI to switch to stalling mode.
**When to use:** The existing webhook handler already returns a tool result. Modify it to include stalling instructions.

```typescript
// In the human_detected tool-call handler, return:
results.push({
  toolCallId: toolCall.id,
  result: `Human agent detected. Switch to TRANSFER MODE now.

You are calling on behalf of the customer. Identify yourself:
"Hi, I'm an AI assistant calling on behalf of [user]. They'll be joining the call momentarily."

STALLING RULES:
- Be polite, competent, and minimal
- If asked questions: "They'll be able to answer that in just a moment."
- If agent wants to hang up: "They're being connected right now, just a few more seconds."
- Do NOT provide personal information or account details
- Do NOT impersonate the customer
- Keep responses SHORT -- one sentence max
- Maximum stall: 30 seconds, then give up gracefully`,
});
```

### Anti-Patterns to Avoid
- **Using Vapi's built-in transferCall for this flow:** It places the caller on hold (silence/music), which means the ISP agent hears nothing. The agent will likely hang up. We need the AI to keep talking.
- **Waiting for Twilio conference to be "ready" before dialing user:** Twilio conferences are created on-demand when the first participant joins. Just dial the user into the named conference -- it starts when they answer.
- **Using Vapi controlUrl transfer to move the ISP call to user's phone directly:** This is a simple blind/warm transfer, not a conference. The AI leg drops immediately and there's no way to monitor the conference afterward.
- **Relying on `phoneCallProviderId` from webhook payloads:** The Vapi webhook `message.call` object may include it, but it's safer to fetch it from the Vapi API (`vapiClient.calls.get(vapiCallId)`) since the SDK types it as `phoneCallProviderId?: string`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conference room management | Custom WebSocket bridges | Twilio Conference API | Twilio handles audio mixing, participant management, status callbacks |
| Outbound call to user | Custom SIP dialing | Twilio Conference Participant.create() | One API call dials user AND places them in a conference |
| Call monitoring after AI drops | Custom polling loop | Twilio Conference status callbacks | Webhooks fire on join/leave/end events |
| Live call manipulation | Direct Twilio CallSid management | Vapi controlUrl | The controlUrl abstracts away the Twilio complexity for Vapi-managed calls |
| Hold music during transfer | Custom audio streaming | Twilio Conference `waitUrl` | Built-in hold music for conference participants waiting |

**Key insight:** The transfer flow touches both Vapi and Twilio. Use Vapi's controlUrl for actions on the AI call (say, end-call), and Twilio's Conference API for actions on the telephony layer (conference, dial user, monitor).

## Common Pitfalls

### Pitfall 1: Race Condition Between Stall and Callback
**What goes wrong:** The AI gets the stall instruction but the user callback takes 5-10 seconds to ring and connect. If the ISP agent asks a question the AI can't answer, they hang up.
**Why it happens:** Twilio outbound calls take time to ring. The stall window is short.
**How to avoid:** Start the outbound call to the user IMMEDIATELY when human_detected fires (don't wait for AI response). The stall and callback should be truly parallel. Set a maximum stall timeout (30 seconds recommended) and have the AI apologize/hang up if the user hasn't connected by then.
**Warning signs:** ISP agent hanging up during stall phase in testing.

### Pitfall 2: Getting the Twilio CallSid for the ISP Call
**What goes wrong:** To redirect the ISP call leg into a Twilio conference, you need the underlying Twilio CallSid. The Vapi SDK exposes this as `phoneCallProviderId` on the Call object, but it may not be in the webhook payload.
**Why it happens:** Vapi abstracts Twilio. The webhook `message.call` object has a Vapi call ID, not necessarily the Twilio SID.
**How to avoid:** Two options: (1) Fetch the Vapi call via API (`vapiClient.calls.get(vapiCallId)`) to get `phoneCallProviderId`, or (2) Use the Vapi controlUrl `transfer` action to move the ISP call to a Twilio conference (the controlUrl handles the Twilio layer internally). Option 2 is simpler but means we lose the Vapi AI leg at transfer time. Option 1 gives more control.
**Warning signs:** `phoneCallProviderId` is `undefined` in the response.

### Pitfall 3: Conference Naming and Collision
**What goes wrong:** Two concurrent calls use the same conference room name and get bridged together.
**Why it happens:** Conference rooms in Twilio are identified by friendly name. If names aren't unique, calls collide.
**How to avoid:** Use the app's call ID (UUID) as part of the conference name: `transfer-{callId}`. This is guaranteed unique per call.
**Warning signs:** Users hearing other conversations.

### Pitfall 4: ISP Agent Hears Hold Music During Transfer
**What goes wrong:** When you transfer the ISP call into a Twilio conference, if the user hasn't connected yet, the ISP agent hears default Twilio hold music instead of the AI's voice.
**Why it happens:** Twilio conference hold music plays when only one participant is in the room and `startConferenceOnEnter` is false, or when waiting for a moderator.
**How to avoid:** The recommended flow is: (1) call the user first and have them join the conference, THEN (2) redirect the ISP call into the conference. This way, when the ISP agent is moved to the conference, the user is already there. The AI stalls the ISP agent until the user is confirmed in the conference.
**Warning signs:** ISP agent says "Hello? Are you there?" or hangs up.

### Pitfall 5: User Doesn't Answer -- AI Must Apologize to ISP Agent
**What goes wrong:** The outbound call to the user fails (no answer, busy, etc.) but the AI is still stalling the ISP agent without knowing the callback failed.
**Why it happens:** The Twilio callback status and the Vapi AI are running in different systems.
**How to avoid:** Use Twilio's `statusCallback` on the outbound call to the user. When the callback reports `no-answer`, `busy`, or `failed`, use the Vapi controlUrl `say` action to have the AI apologize: "I'm sorry, they're unavailable right now. We'll call back later. Thank you!" with `endCallAfterSpoken: true`.
**Warning signs:** AI stalls indefinitely after callback fails.

### Pitfall 6: Vapi Webhook Timeout (7.5 seconds)
**What goes wrong:** The `human_detected` tool-call handler tries to orchestrate the entire transfer inline, exceeding Vapi's webhook response timeout.
**Why it happens:** Vapi expects webhook responses within 7.5 seconds. Starting Twilio calls and waiting for them to connect can take much longer.
**How to avoid:** The webhook handler must return the tool result IMMEDIATELY with stall instructions. All Twilio orchestration runs asynchronously (fire-and-forget from the webhook's perspective). Use a separate async function or background process.
**Warning signs:** Vapi retries the webhook or the AI gets confused.

### Pitfall 7: Database Status Inconsistency
**What goes wrong:** The call status in the database doesn't accurately reflect the transfer state, confusing the UI.
**Why it happens:** Multiple status transitions happen quickly: agent_detected → transferring → connected → completed. If any update fails or arrives out of order, the UI shows stale state.
**How to avoid:** Use the existing callEvent table to log every transition. Update status atomically and push via Pusher immediately. Add new statuses that already exist in the enum: `transferring` and `connected`.
**Warning signs:** UI stuck on "Agent Found" when user is already connected.

## Code Examples

Verified patterns from official sources:

### Transfer Orchestration Flow (Recommended Architecture)

```typescript
// Source: Combination of Vapi Live Call Control docs + Twilio Conference API

/**
 * Triggered asynchronously from the human_detected webhook handler.
 * Runs in the background -- does NOT block the webhook response.
 */
async function orchestrateTransfer(params: {
  callId: string;           // Our app's call UUID
  vapiCallId: string;       // Vapi call ID
  vapiControlUrl: string;   // Vapi live call control URL
  userPhone: string;        // User's phone number (E.164)
}): Promise<void> {
  const { callId, vapiCallId, vapiControlUrl, userPhone } = params;
  const conferenceName = `transfer-${callId}`;
  const twilioClient = twilio(accountSid, authToken);

  // Update status: transferring
  await updateCallStatus(callId, "transferring");
  await pushStatusUpdate(callId, "transferring");

  try {
    // Step 1: Call the user and place them in a conference
    const participant = await twilioClient.conferences(conferenceName)
      .participants.create({
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: userPhone,
        startConferenceOnEnter: true,
        endConferenceOnExit: true, // End conference when user hangs up
        earlyMedia: false,
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/conference-status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        // No beep, user hears nothing -- immediate bridge
        beep: false,
      });

    // Step 2: Wait for user to answer (monitored via statusCallback webhook)
    // If user answers: statusCallback fires with "answered"
    // If user doesn't answer: statusCallback fires with "completed" + failed status
    // Both handled in the conference-status webhook handler

  } catch (error) {
    // Twilio call creation failed
    await handleTransferFailure(callId, vapiControlUrl, "bridge_failed");
  }
}
```

### Twilio Conference Status Webhook Handler

```typescript
// Source: Twilio Conference status callbacks (https://www.twilio.com/docs/voice/conference)

export async function POST(req: Request) {
  const formData = await req.formData();
  const callStatus = formData.get("CallStatus") as string;
  const conferenceSid = formData.get("ConferenceSid") as string;
  const friendlyName = formData.get("FriendlyName") as string;
  // Extract callId from conference name: "transfer-{callId}"
  const callId = friendlyName?.replace("transfer-", "");

  if (callStatus === "answered" || callStatus === "in-progress") {
    // User answered! Now bridge the ISP call into the conference
    await bridgeIspCallToConference(callId);
  }

  if (callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed") {
    // User didn't answer -- apologize and hang up
    await handleUserNoAnswer(callId);
  }

  if (callStatus === "completed") {
    // Conference ended -- user and/or agent hung up
    await handleConferenceEnded(callId);
  }

  return new Response("OK", { status: 200 });
}
```

### Bridging ISP Call to Conference (Two Approaches)

```typescript
// APPROACH A: Use Vapi controlUrl to transfer ISP call to a Twilio number
// that answers with TwiML routing to the conference.
// Requires a webhook endpoint that returns <Conference> TwiML.

await fetch(vapiControlUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "transfer",
    destination: {
      type: "number",
      number: process.env.TWILIO_CONFERENCE_BRIDGE_NUMBER!, // A Twilio number that answers with <Conference> TwiML
    },
  }),
});

// APPROACH B: Get the underlying Twilio CallSid and redirect it directly
// to conference TwiML. More direct but requires phoneCallProviderId.

const vapiCall = await vapiClient.calls.get(vapiCallId);
const twilioCallSid = vapiCall.phoneCallProviderId;

if (twilioCallSid) {
  await twilioClient.calls(twilioCallSid).update({
    twiml: `<Response><Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference></Dial></Response>`,
  });
}
```

### AI Apologize and Hang Up (User No-Answer)

```typescript
// Source: Vapi Live Call Control docs (https://docs.vapi.ai/calls/call-features)

async function handleUserNoAnswer(callId: string) {
  const callRecord = await getCallRecord(callId);
  if (!callRecord?.vapiControlUrl) return;

  // Tell AI to apologize and end the call
  await fetch(callRecord.vapiControlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "say",
      content: "I'm sorry, they're unavailable right now. We'll call back later. Thank you!",
      endCallAfterSpoken: true,
    }),
  });

  await updateCallStatus(callId, "failed");
  await logCallEvent(callId, "failed", { reason: "user_no_answer" });
  await pushStatusUpdate(callId, "failed", { endedReason: "user-no-answer" });
}
```

### AI Drop-Off After User Connects

```typescript
// Source: Vapi Live Call Control docs (https://docs.vapi.ai/calls/call-features)

async function dropAiFromCall(callId: string) {
  const callRecord = await getCallRecord(callId);
  if (!callRecord?.vapiControlUrl) return;

  // Silent drop -- just end the Vapi call, which removes the AI leg
  await fetch(callRecord.vapiControlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "end-call",
    }),
  });

  await logCallEvent(callId, "ai_dropped");
  await updateCallStatus(callId, "connected");
  await pushStatusUpdate(callId, "connected");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vapi transferCall for all transfers | Server-side Twilio conferencing for complex flows | Ongoing (Vapi warm-transfer-experimental has known bugs) | More control, more reliable |
| Polling for call status | Twilio statusCallback webhooks + Pusher | Standard pattern | Real-time UI updates without polling |
| Single-assistant call throughout | Assistant behavior change via tool response | Vapi tool-calls support | AI can switch from navigation to stalling mode mid-call |

**Deprecated/outdated:**
- Vapi `function-call` server message type: deprecated in favor of `tool-calls`
- Custom Functions in Vapi: being deprecated in favor of Tools

## Stalling Strategy (Claude's Discretion Recommendation)

### Stalling Script Recommendations

The AI should identify itself immediately and set expectations:

**Opening (when agent picks up):**
"Hi, I'm an automated assistant calling on behalf of [user's name]. They're being connected to the call right now -- just a moment please."

**If agent asks questions:**
- "They'll be able to help you with that in just a moment."
- "I'm just the automated system -- they're joining now."

**If agent pushes back or gets impatient:**
- "I appreciate your patience. They should be joining any second now."

**If maximum stall time reached (30 seconds recommended):**
- "I'm sorry, they seem to be unavailable at the moment. We'll call back. Thank you for your time."

### Maximum Stall Duration: 30 seconds

Rationale: Phone agents typically wait 15-30 seconds before hanging up. 30 seconds is enough for a callback ring cycle (typically 15-20 seconds for 4-5 rings). Beyond 30 seconds, the ISP agent is likely to hang up regardless of what the AI says.

### Stalling Tone
- Polite and competent
- Minimal words -- don't over-explain
- Never fumble or sound uncertain
- Never provide personal/account information
- One sentence max per response

## UI State Transitions (Claude's Discretion Recommendation)

### Recommended Status Flow for UI

```
agent_detected → transferring → connected → completed
                                    ↓
                                  failed (if bridge fails)
```

**Granularity recommendation:** Five distinct UI states during transfer:

1. **agent_detected** -- "Agent Found!" (existing, with green alert animation)
2. **transferring** -- "Connecting You..." (new: shown during callback/bridge)
3. **connected** -- "Connected" (new: user is talking to agent)
4. **completed** -- "Call Complete" (existing: after user/agent hang up)
5. **failed** -- "Call Failed" (existing: with specific error reason)

### Post-Handoff UI Design Recommendations

When status is `connected`:
- Show a call timer (duration since user connected)
- Show "Connected with [ISP Name] agent"
- Show a "Hang Up" or "End Call" button (optional -- user can just hang up their phone)
- Remove the transcript panel (no longer relevant -- AI is off the call)
- Simple, clean UI -- the user is on their phone now, not looking at the screen much

## Open Questions

Things that couldn't be fully resolved:

1. **Vapi controlUrl transfer + Twilio conference interplay**
   - What we know: The controlUrl supports `type: "transfer"` with a destination number. Vapi uses Twilio under the hood.
   - What's unclear: When you transfer via controlUrl to a number that answers with `<Conference>` TwiML, does the ISP audio leg properly join the conference? Or does the Vapi AI leg try to join too? Testing needed.
   - Recommendation: Test Approach A (controlUrl transfer to a bridge number) first. If it doesn't work cleanly, fall back to Approach B (get Twilio CallSid via `phoneCallProviderId` and redirect directly). Plan should include both approaches with A as primary.

2. **Getting `phoneCallProviderId` reliably**
   - What we know: The Vapi Call object has `phoneCallProviderId` (= Twilio CallSid). It's available via the `vapiClient.calls.get()` API.
   - What's unclear: Is it available in the webhook `message.call` object? The SDK types it as optional. The existing code doesn't access it.
   - Recommendation: Fetch it via API when needed. Add it to the call record in DB when the call starts (update the call start handler).

3. **Twilio phone number for conference bridge**
   - What we know: Approach A requires a Twilio phone number that, when called, returns `<Conference>` TwiML. We already have a Twilio account.
   - What's unclear: Can we reuse the existing Vapi phone number? Probably not -- Vapi manages its webhook. We may need a separate Twilio number for the conference bridge endpoint.
   - Recommendation: Use the existing Twilio number (used for OTP) or acquire a second number. Configure it with a webhook that returns conference TwiML.

4. **Conference monitoring after AI drops off**
   - What we know: Twilio conference status callbacks can report `join`, `leave`, `end` events.
   - What's unclear: After the Vapi call ends (AI dropped), do we still receive conference status callbacks? The conference is managed by Twilio, not Vapi, so callbacks should continue.
   - Recommendation: Use `endConferenceOnExit: true` on the user's participant. When the user hangs up, the conference ends, Twilio sends the callback, and we mark the call as completed.

## Sources

### Primary (HIGH confidence)
- Vapi Live Call Control docs - https://docs.vapi.ai/calls/call-features - controlUrl actions, transfer format
- Vapi Call Forwarding docs - https://docs.vapi.ai/call-forwarding - transferCall tool, transferPlan modes
- Vapi Server Events docs - https://docs.vapi.ai/server-url/events - tool-calls event format, status-update events
- Vapi Call Handling with Twilio - https://docs.vapi.ai/calls/call-handling-with-vapi-and-twilio - conference pattern architecture
- Twilio Conference API - https://www.twilio.com/docs/voice/conference - conference lifecycle, management
- Twilio Conference Participant API - https://www.twilio.com/docs/voice/api/conference-participant-resource - add/remove participants
- Twilio Modify Calls docs - https://www.twilio.com/docs/voice/tutorials/how-to-modify-calls-in-progress/node - redirect call to conference
- Vapi SDK types (local) - `@vapi-ai/server-sdk` v0.11.0 - Call.phoneCallProviderId, Monitor.controlUrl

### Secondary (MEDIUM confidence)
- Vapi Dynamic Transfers docs - https://docs.vapi.ai/calls/call-dynamic-transfers - server-controlled transfers
- Vapi Assistant-based Warm Transfer - https://docs.vapi.ai/calls/assistant-based-warm-transfer - transferSuccessful/transferCancel tools
- Vapi Community: warm-transfer-experimental issues - https://vapi.ai/community/m/1384506884035186719 - known bugs with fallback
- Vapi Community: dynamic transfer resume - https://vapi.ai/community/m/1379760767473156138 - fallback not working as documented

### Tertiary (LOW confidence)
- Vapi Community: controlUrl usage - https://support.vapi.ai/t/26939873/how-to-use-control-url - request format examples (rate-limited, couldn't fully verify)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, well-documented APIs
- Architecture: MEDIUM - The hybrid Vapi+Twilio conference pattern is documented by Vapi but the exact interplay (controlUrl transfer into conference) needs testing. Two approaches documented as fallbacks.
- Pitfalls: HIGH - Well-documented known issues with Vapi warm transfer; race conditions and timing are predictable concerns
- Stalling strategy: MEDIUM - Based on understanding of phone agent behavior; actual timing may need tuning

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- Vapi is fast-moving but core APIs are stable)
