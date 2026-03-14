# Vapi Warm Transfer Research for EasyCallAI

**Researched:** 2026-02-06
**Domain:** Vapi warm-transfer-experimental, assistant-based warm transfer, transferCall tool
**Confidence:** HIGH (verified against SDK types + official docs + community reports)

## Executive Summary

Vapi's native warm transfer feature (`warm-transfer-experimental` mode) can replace the current Twilio Conference-based approach, **but with one critical caveat**: warm transfer only works with **Twilio-based phone numbers imported into Vapi**, not with free Vapi phone numbers. If the project's current `VAPI_PHONE_NUMBER_ID` points to a free Vapi number, the warm transfer will silently fail or act as a blind transfer.

The `warm-transfer-experimental` mode puts the ISP agent (the "customer" in Vapi's model) on hold with audio while a **transfer assistant** (a separate AI) calls the user and manages the handoff. When the user answers, the transfer assistant calls `transferSuccessful` to merge the calls and exit. The AI drops off automatically. This eliminates the need for Twilio Conference APIs, a separate Twilio phone number, conference-bridge/conference-status webhooks, and the transfer-orchestrator module.

**Primary recommendation:** Use `warm-transfer-experimental` with a `transferAssistant` configuration on the `transferCall` tool. The transfer is triggered by the AI calling the transferCall tool (not via controlUrl). The user's phone number is set as the destination. The ISP agent hears hold audio. The transfer assistant connects the user and drops off.

---

## Table of Contents

1. [How warm-transfer-experimental Works](#1-how-warm-transfer-experimental-works)
2. [Complete Configuration Reference](#2-complete-configuration-reference)
3. [Transfer Assistant Deep Dive](#3-transfer-assistant-deep-dive)
4. [Hold Audio (What the ISP Agent Hears)](#4-hold-audio-what-the-isp-agent-hears)
5. [Webhook Events During Transfer](#5-webhook-events-during-transfer)
6. [Triggering the Transfer](#6-triggering-the-transfer)
7. [Failure Modes and Handling](#7-failure-modes-and-handling)
8. [AI Drop-Off Behavior](#8-ai-drop-off-behavior)
9. [Compatibility and Requirements](#9-compatibility-and-requirements)
10. [Dynamic Destination (User Phone Number)](#10-dynamic-destination-user-phone-number)
11. [What Code Changes From Current Implementation](#11-what-code-changes-from-current-implementation)
12. [Recommended Approach for EasyCallAI](#12-recommended-approach-for-easycallai)
13. [Key Decisions Needed](#13-key-decisions-needed)
14. [Open Questions and Risks](#14-open-questions-and-risks)
15. [Sources](#15-sources)

---

## 1. How warm-transfer-experimental Works

**Confidence: HIGH** (SDK types + official docs)

The flow, mapped to our use case (Vapi's terminology in parentheses):

```
1. AI navigates IVR, reaches live ISP agent ("customer" in Vapi's model)
2. AI detects human, calls transferCall tool
3. ISP agent placed on HOLD (hears hold audio)
4. Vapi dials the USER's phone number (the "destination/operator")
5. Transfer assistant takes over the new call to the user
6. Transfer assistant can speak to user, explain what's happening
7. Transfer assistant calls transferSuccessful
8. Calls MERGED: ISP agent + user connected directly
9. AI (both original + transfer assistant) exits completely
10. User and ISP agent continue their conversation
```

**IMPORTANT terminology mapping:**
- In Vapi docs, "customer" = the person already on the line = **ISP agent** in our case
- In Vapi docs, "operator/destination" = the person being dialed = **our user** in our case
- This is INVERTED from what you'd expect because Vapi was designed for inbound call centers

---

## 2. Complete Configuration Reference

**Confidence: HIGH** (verified against `@vapi-ai/server-sdk` v0.11.0 type definitions)

### TransferCall Tool Configuration (on the assistant's model.tools)

```typescript
// This goes in the assistant's model.tools array alongside dtmf, human_detected, etc.
{
  type: "transferCall",
  destinations: [
    {
      type: "number",
      number: "+1XXXXXXXXXX",  // User's phone number (E.164)
      message: "",  // Empty string = silent transfer (no spoken message to ISP agent before hold)
      description: "Transfer to the customer's phone",
      transferPlan: {
        mode: "warm-transfer-experimental",

        // Hold audio for the ISP agent while transfer happens
        holdAudioUrl: "https://example.com/hold-music.mp3",  // Optional; default Vapi hold audio if omitted

        // Transfer assistant configuration
        transferAssistant: {
          name: "Transfer Assistant",
          firstMessage: "Hi, this is your ISP call assistant. Your call with the agent is ready. Connecting you now.",
          firstMessageMode: "assistant-speaks-first",
          maxDurationSeconds: 60,  // Cancel transfer if not completed in 60s
          silenceTimeoutSeconds: 30,  // Cancel if 30s silence
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are connecting a customer to their ISP agent. The ISP agent is already on hold waiting. Your ONLY job is to confirm the user is ready and call transferSuccessful immediately. Do NOT ask questions. Do NOT have a conversation. Just confirm they're there and transfer."
              }
            ],
            // transferSuccessful and transferCancel are AUTOMATICALLY added
            // You can optionally customize them here
          },
        },

        // Fallback if transfer fails (user doesn't answer, voicemail, etc.)
        fallbackPlan: {
          message: "I'm sorry, we couldn't connect you. The agent has been informed. Goodbye.",
          endCallEnabled: true,  // true = end call after fallback message
        },

        // Context engineering - controls what transcript context the transfer assistant gets
        contextEngineeringPlan: { type: "none" },  // "none" | "all" | { type: "last-n", n: number }
        // Use "none" because the transfer assistant doesn't need the IVR navigation transcript

        // Audio played to user after transfer complete (optional beep/notification)
        transferCompleteAudioUrl: undefined,  // Optional URL to a beep sound
      },
    },
  ],
  // Messages spoken to the ISP agent ("customer") during transfer initiation
  messages: [
    {
      type: "request-start",
      content: "",  // Empty = nothing spoken before transfer starts (silent initiation)
    },
  ],
} as any  // SDK v0.11.0 types don't include transferAssistant on TransferPlan
```

### SDK Type Gap

**CRITICAL:** The `@vapi-ai/server-sdk` v0.11.0 has `TransferAssistant` and `TransferPlan` types defined, but `TransferPlan` does NOT include a `transferAssistant` property in its interface. The types are:

```typescript
// From SDK v0.11.0:
interface TransferPlan {
  mode: TransferPlanMode;
  message?: TransferPlanMessage;
  timeout?: number;
  sipVerb?: Record<string, unknown>;
  dialTimeout?: number;
  holdAudioUrl?: string;            // Only for warm-transfer-experimental
  transferCompleteAudioUrl?: string; // Only for warm-transfer-experimental
  contextEngineeringPlan?: TransferPlanContextEngineeringPlan;
  twiml?: string;
  summaryPlan?: SummaryPlan;
  sipHeadersInReferToEnabled?: boolean;
  fallbackPlan?: TransferFallbackPlan;
  // NOTE: transferAssistant is NOT typed here but IS accepted by the API
}

interface TransferAssistant {
  name?: string;
  model: TransferAssistantModel;
  voice?: TransferAssistantVoice;
  transcriber?: TransferAssistantTranscriber;
  firstMessage?: string;
  backgroundSound?: TransferAssistantBackgroundSound;
  firstMessageMode?: TransferAssistantFirstMessageMode;
  maxDurationSeconds?: number;   // default 120
  silenceTimeoutSeconds?: number; // default 30
}

interface TransferAssistantModel {
  provider: "openai" | "anthropic" | "google" | "custom-llm";
  model: string;
  messages?: unknown[];
  tools?: unknown[];  // transferSuccessful + transferCancel auto-added
}

interface TransferFallbackPlan {
  message: TransferFallbackPlanMessage;
  endCallEnabled?: boolean;  // default true
}
```

**Workaround:** Use `as any` type assertion when setting `transferAssistant` on the `transferPlan`, or extend the type locally.

### TransferPlanMode Values (from SDK)

```typescript
const TransferPlanMode = {
  BlindTransfer: "blind-transfer",
  BlindTransferAddSummaryToSipHeader: "blind-transfer-add-summary-to-sip-header",
  WarmTransferSayMessage: "warm-transfer-say-message",
  WarmTransferSaySummary: "warm-transfer-say-summary",
  WarmTransferTwiml: "warm-transfer-twiml",
  WarmTransferWaitForOperatorToSpeakFirstAndThenSayMessage: "warm-transfer-wait-for-operator-to-speak-first-and-then-say-message",
  WarmTransferWaitForOperatorToSpeakFirstAndThenSaySummary: "warm-transfer-wait-for-operator-to-speak-first-and-then-say-summary",
  WarmTransferExperimental: "warm-transfer-experimental",
};
```

---

## 3. Transfer Assistant Deep Dive

**Confidence: HIGH** (SDK types + official docs)

### What It Is

The transfer assistant is a **separate AI assistant** that takes over the call to the destination (the user, in our case) during `warm-transfer-experimental` mode. It is NOT the same as the original assistant that navigated the IVR.

### Conversation Context Access

The transfer assistant has access to the previous conversation transcript via the `contextEngineeringPlan`:

| Setting | Behavior |
|---------|----------|
| `{ type: "all" }` (default) | Full transcript injected into transfer assistant's system message |
| `{ type: "none" }` | No transcript context -- transfer assistant has no knowledge of prior conversation |
| `{ type: "last-n", n: 10 }` | Last N messages from the conversation |

**Recommendation for our use case:** Use `{ type: "none" }`. The transfer assistant doesn't need to know about IVR navigation. It just needs to tell the user their call is being connected and immediately merge.

### Built-in Tools

The transfer assistant **always** has two built-in tools, regardless of configuration:

1. **`transferSuccessful`** -- Merges the ISP agent's call and the user's call, removes the transfer assistant from both calls. The ISP agent and user are connected directly.

2. **`transferCancel`** -- Disconnects from the user, returns the ISP agent to the original assistant. The original assistant resumes its conversation with the ISP agent.

These cannot be removed. You can customize their `function` descriptions and `messages` by including them in the `model.tools` array.

### Default System Prompt

If you don't provide a system message, the transfer assistant uses this default:

```
You are a transfer assistant designed to facilitate call transfers. Your core
responsibility is to manage the transfer process efficiently.

## Core Responsibility
- Facilitate the transfer process by using transferSuccessful or transferCancel
  tools appropriately

## When to Respond
- Answer questions about the transfer process or provide summaries when
  specifically asked by the operator
- Respond to direct questions about the current transfer situation

## What to Avoid
- Do not discuss topics unrelated to the transfer
- Do not engage in general conversation
- Keep all interactions focused on facilitating the transfer

## Transfer Tools
- Use transferSuccessful when the transfer should proceed
- Use transferCancel when the transfer cannot be completed

Stay focused on your core responsibility of facilitating transfers.
```

### Our Custom System Prompt (Recommendation)

```
You are a transfer assistant connecting a user to an ISP customer service agent.
The agent is on hold waiting. Your ONLY job is to:

1. Greet the user briefly
2. Call transferSuccessful IMMEDIATELY to connect them to the agent

Do NOT ask questions. Do NOT have a conversation. The user is expecting to be
connected to the agent right away.

If the user doesn't respond within a few seconds, call transferSuccessful anyway.
If you detect voicemail or an automated system, call transferCancel.
```

### First Message

The `firstMessage` is spoken immediately when the user answers (before any AI processing). Use something brief:

```
"Hi! Your ISP agent is on the line. Connecting you now."
```

---

## 4. Hold Audio (What the ISP Agent Hears)

**Confidence: HIGH** (SDK types + official docs)

When the AI triggers the transferCall tool, the ISP agent (the "customer" in Vapi's terminology) is **placed on hold**. During this time:

| Configuration | What ISP Agent Hears |
|--------------|---------------------|
| `holdAudioUrl` set to MP3/WAV URL | Custom hold audio from that file |
| `holdAudioUrl` not set | Vapi's default hold ringtone/music |
| Cannot set to a spoken message directly | Must be a pre-recorded audio file URL |

**Important notes:**
- The `holdAudioUrl` must be a publicly accessible URL to an MP3 or WAV file
- You CANNOT use a dynamic spoken message -- it must be a pre-recorded file
- The default Vapi hold audio is `https://music.vapi.ai/waiting-ringtone.mp3` (per community examples)
- The `message` property on the `transferPlan` is what gets spoken to the **destination** (user), not to the ISP agent

**For our use case:** The ISP agent will hear hold music while the user's phone is ringing and being connected. This is acceptable -- it's standard phone behavior. The stall prompt's "They're being connected right now" prepares the agent before hold music starts.

**Alternative hold audio approach:** Record a custom message like "Please hold while we connect you" and host it as an MP3. Set that as `holdAudioUrl`.

---

## 5. Webhook Events During Transfer

**Confidence: MEDIUM** (official docs list events, but exact payloads during warm transfer are not fully documented)

### Events That Fire During Warm Transfer

| Event | When | Notes |
|-------|------|-------|
| `tool-calls` (transferCall) | AI calls the transferCall tool | You receive this if `tool-calls` is in `serverMessages`. The transfer happens automatically -- you do NOT need to respond to trigger it. |
| `status-update` (forwarding) | Call transitions to forwarding state | Status changes to `"forwarding"` |
| `transfer-update` | Transfer occurs | **NOT in default serverMessages.** Must explicitly add `"transfer-update"` to `serverMessages` array to receive it. |
| `status-update` (ended) | Call ends after transfer | The original Vapi call ends. `endedReason` will indicate transfer. |
| `end-of-call-report` | Final call report | Sent after original call ends. Includes artifacts, transcript, etc. |

### Key: `transfer-update` Event

The `transfer-update` event fires when a transfer actually occurs. To receive it at your webhook:

```typescript
serverMessages: [
  "status-update",
  "end-of-call-report",
  "hang",
  "tool-calls",
  "transcript",
  "transfer-update",  // ADD THIS to receive transfer notifications
],
```

### Call Ended Reasons Related to Transfer

From the SDK types (`ServerMessageStatusUpdateEndedReason`):

```typescript
// Relevant ended reasons:
"assistant-forwarded-call"  // Normal: call was transferred
"call.in-progress.error-warm-transfer-assistant-cancelled"  // Transfer assistant cancelled the transfer
```

### What We Know vs Don't Know

- **KNOW:** `transfer-update` must be explicitly added to `serverMessages`
- **KNOW:** Status changes to `"forwarding"` during transfer
- **KNOW:** `end-of-call-report` fires after the original call ends
- **DON'T KNOW:** Exact payload structure of `transfer-update` (not documented)
- **DON'T KNOW:** Whether a separate `end-of-call-report` fires for the transfer assistant's call
- **DON'T KNOW:** Whether status-update events fire for the transfer assistant's sub-call

### How to Detect Transfer Outcomes

| Outcome | How to Detect |
|---------|---------------|
| Transfer started | `tool-calls` with transferCall function name, OR `status-update` with `"forwarding"` |
| User answered | No direct webhook; inferred when `transferSuccessful` is called (transfer completes) |
| User didn't answer | Transfer assistant calls `transferCancel`, then `fallbackPlan` message plays to ISP agent |
| Transfer completed (merged) | `end-of-call-report` with `endedReason: "assistant-forwarded-call"` |
| Transfer cancelled | `end-of-call-report` with `endedReason: "call.in-progress.error-warm-transfer-assistant-cancelled"` |

---

## 6. Triggering the Transfer

**Confidence: HIGH** (official docs + SDK types)

### Can It Be Triggered via controlUrl?

**NO.** The warm transfer cannot be triggered via controlUrl POST. The controlUrl supports:
- `type: "transfer"` -- This is a **blind/simple transfer**, NOT a warm transfer. It transfers the call to a number directly without hold audio, transfer assistant, or any warm transfer logic.
- `type: "end-call"` -- Ends the call
- `type: "say"` -- Makes assistant speak

The warm transfer flow is ONLY triggered when the AI model calls the `transferCall` tool as part of its conversation.

### How to Trigger Programmatically

The transfer is triggered by the AI calling the `transferCall` tool. To make this happen programmatically when `human_detected` fires:

**Option A: Instruct the AI to call transferCall (via system prompt / tool response)**

When the `human_detected` tool fires, return stall instructions that also tell the AI to call `transferCall` after a brief stall:

```
"Human agent detected.
1. Introduce yourself: 'Hi, I'm an assistant calling on behalf of [user]. They'll be connected shortly.'
2. After introducing yourself, IMMEDIATELY call the transferCall tool to connect the customer.
3. While waiting for the transfer, if the agent asks questions, say 'They'll be able to help with that momentarily.'"
```

The AI then calls the transferCall tool, which triggers the warm transfer.

**Option B: Add transferCall to system prompt from the start**

Configure the main assistant's system prompt to call `transferCall` when it detects a human agent, instead of (or in addition to) calling `human_detected`. This simplifies the flow but gives less server-side control over when the transfer happens.

**Option C: Use `transfer-destination-request` webhook**

If the `transferCall` tool has NO `destinations` configured, Vapi sends a `transfer-destination-request` webhook to your server. You respond with the destination (user's phone number) dynamically. This allows fully server-controlled destination but still requires the AI to initiate the transferCall.

**Recommended for our use case:** Option A. The AI calls `human_detected` (which updates our DB and starts stalling), then immediately calls `transferCall` (which triggers the warm transfer). The stall happens between the AI's first response and when the ISP agent is placed on hold.

---

## 7. Failure Modes and Handling

**Confidence: HIGH** (SDK types + official docs)

### User Doesn't Answer the Callback

| What Happens | Configuration |
|-------------|--------------|
| Transfer assistant's `maxDurationSeconds` expires | Transfer is cancelled automatically |
| Voicemail detected | Transfer assistant calls `transferCancel` (if prompted correctly) |
| `fallbackPlan.message` is spoken to ISP agent | After cancel, ISP agent hears: "I'm sorry, we couldn't connect you..." |
| `fallbackPlan.endCallEnabled: true` | Call ends after fallback message |
| `fallbackPlan.endCallEnabled: false` | ISP agent returns to original assistant |

**For our use case:**
- Set `maxDurationSeconds: 45` (enough for ~6 rings + a few seconds)
- Set `fallbackPlan.message: "I'm sorry, they're unavailable right now. We'll call back later. Thank you!"`
- Set `fallbackPlan.endCallEnabled: true` (end the call)
- The `end-of-call-report` will fire with reason indicating the transfer was cancelled

### Transfer Times Out (maxDurationSeconds)

When `maxDurationSeconds` on the transfer assistant expires:
1. Transfer is **automatically cancelled**
2. Transfer assistant disconnects from the destination (user)
3. `fallbackPlan.message` plays to the ISP agent (the "customer")
4. If `endCallEnabled: true`, the call ends
5. If `endCallEnabled: false`, the ISP agent returns to the original AI assistant

### User Rejects the Call

Same behavior as user not answering -- the transfer assistant eventually hits `maxDurationSeconds` or detects no one answered, calls `transferCancel`, and the fallback flow activates.

### ISP Agent Hangs Up During Hold

If the ISP agent hangs up while on hold (waiting for the user to answer):
- The Vapi call ends
- `end-of-call-report` fires with an appropriate ended reason
- The transfer assistant's sub-call to the user is also terminated
- **This is handled automatically by Vapi** -- no special handling needed

### Transfer Assistant Errors

If the transfer assistant encounters an error:
- `endedReason: "call.in-progress.error-warm-transfer-assistant-cancelled"` is sent
- The ISP agent hears the fallback message (if configured)

### Silence Timeout

If the transfer assistant's call to the user has `silenceTimeoutSeconds` seconds of silence:
- Transfer is automatically cancelled
- Fallback plan activates

---

## 8. AI Drop-Off Behavior

**Confidence: HIGH** (official docs + community confirmation)

### After `transferSuccessful` Is Called

When the transfer assistant calls `transferSuccessful`:

1. **Calls are merged:** The ISP agent's call leg and the user's call leg are connected directly
2. **Transfer assistant exits:** The AI is completely removed from both call legs
3. **Original assistant exits:** The original AI (that navigated the IVR) is also gone
4. **No AI processing:** After merge, there is no AI listening, speaking, or processing on the call
5. **Vapi call ends:** The original Vapi call object gets an `end-of-call-report` with `endedReason: "assistant-forwarded-call"`

**This means:**
- We do NOT need to manually drop the AI via controlUrl
- We do NOT need to monitor a conference
- The user and ISP agent are on a direct phone call (managed by Twilio under the hood)
- When either party hangs up, the call simply ends

### What About Monitoring After Merge?

**CRITICAL LIMITATION:** After the calls merge and the AI exits, we lose visibility into the call. Vapi does not send further webhooks about the merged call. We will:
- Know WHEN the transfer completed (via `end-of-call-report`)
- NOT know when the user and ISP agent's conversation ends
- NOT know the duration of their conversation
- NOT get a transcript of their conversation

**Mitigation:** We can set status to `"connected"` when we receive the `end-of-call-report` with `endedReason: "assistant-forwarded-call"`. We may not be able to detect when the call truly ends. This is a tradeoff of using Vapi's native warm transfer vs the Twilio Conference approach (which gave us conference-end callbacks).

---

## 9. Compatibility and Requirements

**Confidence: HIGH** (official docs + community reports + SDK docs)

### Phone Number Requirements

**CRITICAL:** Warm transfer (including `warm-transfer-experimental`) **only works with Twilio-based telephony**:
- Twilio phone numbers imported into Vapi: **YES**
- Free Vapi phone numbers: **LIKELY NO** -- community reports confirm warm transfers fail with Vapi numbers
- Telnyx/Vonage numbers: **NO**
- SIP trunks: **YES** (if properly configured)

**Current project status:** The project uses `VAPI_PHONE_NUMBER_ID=5bc0b339-cf93-498e-bae8-82ae61cf2812`. We need to verify whether this is a Twilio-imported number or a free Vapi number. If it's a free Vapi number, warm transfer will NOT work and we must either:
1. Import a Twilio number into Vapi, OR
2. Stay with the current Twilio Conference approach

### Outbound Call Compatibility

Warm transfer on outbound calls has been reported as problematic by some community members:
- Inbound call transfers: generally work well
- Outbound call transfers: some users report the call drops after the transfer message

However, these reports were primarily about non-Twilio providers (Telnyx SIP). With Twilio-based numbers, outbound warm transfers should work.

### Phone-to-Phone Requirement

The documentation confirms:
- **Phone to Phone:** Supported
- **Web to Phone:** NOT supported (always drops)
- **PSTN to SIP:** NOT supported

Our use case is Phone-to-Phone (Vapi calls ISP, then warm transfers to user's phone), so this should be compatible.

---

## 10. Dynamic Destination (User Phone Number)

**Confidence: HIGH** (official docs + SDK types)

### Option A: Set at Call Creation Time (Recommended)

Since we know the user's phone number when creating the call, we can set it directly in the `transferCall` tool's `destinations` array:

```typescript
// In the calls.create() assistant config:
model: {
  tools: [
    // ... other tools ...
    {
      type: "transferCall",
      destinations: [
        {
          type: "number",
          number: userRecord.phoneNumber,  // Set dynamically at call creation
          transferPlan: {
            mode: "warm-transfer-experimental",
            // ... rest of config
          },
        },
      ],
    },
  ],
}
```

Since we use transient (inline) assistants created per-call, the destination number is naturally dynamic -- each call gets its own assistant config with the correct user phone number.

### Option B: Use `transfer-destination-request` Webhook

If the `transferCall` tool has empty `destinations`, Vapi sends a `transfer-destination-request` webhook. Your server responds with the destination:

```typescript
// In webhook handler:
if (message.type === "transfer-destination-request") {
  const callRecord = await db.query.call.findFirst({
    where: eq(call.vapiCallId, message.call.id),
  });
  const userRecord = await db.query.user.findFirst({
    where: eq(user.id, callRecord.userId),
  });

  return Response.json({
    destination: {
      type: "number",
      number: userRecord.phoneNumber,
      transferPlan: {
        mode: "warm-transfer-experimental",
        // ... config
      },
    },
  });
}
```

**Recommendation:** Use Option A (set at creation time). It's simpler and avoids the additional webhook round-trip latency.

---

## 11. What Code Changes From Current Implementation

### Files to DELETE (no longer needed)

| File | Why It Can Be Removed |
|------|----------------------|
| `src/lib/transfer-orchestrator.ts` | Twilio Conference logic replaced by Vapi warm transfer |
| `src/lib/twilio-client.ts` | No longer need Twilio Conference/call management APIs |
| `src/app/api/webhooks/twilio/conference-status/route.ts` | No Twilio conference status callbacks needed |
| `src/app/api/webhooks/twilio/conference-bridge/route.ts` | No TwiML conference bridge endpoint needed |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/app/api/call/start/route.ts` | Add `transferCall` tool to assistant's `model.tools` array with user's phone number as destination |
| `src/app/api/webhooks/vapi/route.ts` | 1. Simplify `human_detected` handler: return stall instructions that tell AI to call transferCall next. Remove `orchestrateTransfer` fire-and-forget. 2. Add `transfer-update` to serverMessages (optional). 3. Handle `end-of-call-report` with `endedReason: "assistant-forwarded-call"` to set status to `connected`. 4. Handle `endedReason: "call.in-progress.error-warm-transfer-assistant-cancelled"` for transfer failure. 5. Remove transfer-managed status guards (no longer needed). |
| `src/lib/stall-prompt.ts` | Update stall instructions to include "call the transferCall tool" directive |
| `src/db/schema.ts` | No schema changes needed (existing statuses cover all states) |

### Files that STAY UNCHANGED

| File | Why |
|------|-----|
| `src/lib/vapi.ts` | VapiClient singleton unchanged |
| `src/lib/twilio.ts` | Still needed for OTP verification |
| `src/lib/pusher-server.ts` | Still needed for real-time UI updates |
| `src/lib/call-channel.ts` | Still needed for Pusher channels |

### Environment Variables

| Variable | Status |
|----------|--------|
| `TWILIO_PHONE_NUMBER` | No longer needed for transfer (only for OTP) |
| `TWILIO_CONFERENCE_BRIDGE_NUMBER` | Can be removed entirely |
| `VAPI_PHONE_NUMBER_ID` | Must be verified as Twilio-imported number |

---

## 12. Recommended Approach for EasyCallAI

### Complete Call Flow With Warm Transfer

```
User clicks "Start Call"
        |
        v
[call/start/route.ts] Creates Vapi call with:
  - IVR navigation prompt (existing)
  - human_detected tool (existing)
  - navigation_status tool (existing)
  - dtmf tool (existing)
  - transferCall tool (NEW) with user's phone as destination
        |
        v
AI navigates IVR, waits on hold (existing behavior)
        |
        v
AI detects live human, calls human_detected
        |
        v
[Webhook] human_detected handler:
  1. Update status to agent_detected (existing)
  2. Return stall instructions (modified):
     "Introduce yourself, then IMMEDIATELY call transferCall"
        |
        v
AI introduces itself to ISP agent, then calls transferCall
        |
        v
Vapi warm-transfer-experimental activates:
  - ISP agent placed on hold (hears hold audio)
  - Vapi dials user's phone number
  - Transfer assistant answers, says: "Your ISP call is ready!"
  - Transfer assistant calls transferSuccessful
  - Calls MERGED: user + ISP agent connected
  - AI exits
        |
        v
[Webhook] end-of-call-report fires:
  - endedReason: "assistant-forwarded-call"
  - Update status to "connected"
  - Push Pusher "connected" event
        |
        v
User and ISP agent talk directly
(no further Vapi/webhook visibility)
```

### Complete transferCall Tool Configuration

```typescript
// Add to model.tools array in call/start/route.ts
{
  type: "transferCall",
  destinations: [
    {
      type: "number",
      number: userRecord.phoneNumber,
      message: "",  // Silent -- no message to ISP agent before hold
      transferPlan: {
        mode: "warm-transfer-experimental",
        holdAudioUrl: undefined,  // Use Vapi default, or set custom URL
        transferAssistant: {
          firstMessage: "Hi! Your ISP agent is on the line. Connecting you now.",
          firstMessageMode: "assistant-speaks-first",
          maxDurationSeconds: 45,
          silenceTimeoutSeconds: 20,
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are connecting a user to their ISP customer service agent.
The agent is already on hold. Your ONLY job is:
1. Briefly confirm the user is there
2. Call transferSuccessful IMMEDIATELY

Do NOT ask questions or have a conversation.
If the user says anything, call transferSuccessful.
If you hear voicemail or an automated system, call transferCancel.
If the user doesn't respond after your greeting, wait 3 seconds then call transferSuccessful anyway.`,
              },
            ],
          },
        },
        fallbackPlan: {
          message: "I'm sorry, they're unavailable right now. We'll call back later. Thank you!",
          endCallEnabled: true,
        },
        contextEngineeringPlan: { type: "none" },
      },
    } as any,  // SDK types don't include transferAssistant
  ],
} as any
```

### Updated Stall Instructions

```typescript
export function getStallInstructions(userName: string): string {
  return `Human agent detected. You must do two things in order:

STEP 1 - Introduce yourself (speak this NOW):
"Hi, I'm an automated assistant calling on behalf of ${userName}. Please hold for just a moment while I connect them."

STEP 2 - IMMEDIATELY call the transferCall tool.
Do not wait. Do not ask questions. Call transferCall right after introducing yourself.

If the agent says anything before you can call transferCall, respond briefly:
"They'll be connected momentarily."

Do NOT provide any personal information, account numbers, or identifying details.
Do NOT impersonate the customer.`;
}
```

---

## 13. Key Decisions Needed

### Decision 1: Verify Phone Number Type

**BLOCKING.** Is `VAPI_PHONE_NUMBER_ID=5bc0b339-cf93-498e-bae8-82ae61cf2812` a Twilio-imported number or a free Vapi number?

- **If Twilio-imported:** Proceed with warm transfer approach
- **If free Vapi number:** Must either import a Twilio number or keep current Twilio Conference approach

**How to check:** Run `npx ts-node -e "..."` or check the Vapi dashboard under Phone Numbers. Twilio-imported numbers show the Twilio provider. Or via API:

```typescript
const phoneNumber = await vapiClient.phoneNumbers.get("5bc0b339-cf93-498e-bae8-82ae61cf2812");
console.log(phoneNumber.provider); // "twilio" or "vapi"
```

### Decision 2: Hold Audio for ISP Agent

Options:
- **Default Vapi hold music** (simplest, no configuration)
- **Custom MP3** with a spoken message like "Please hold while we connect you" (better UX, requires hosting an audio file)
- **No audio** (not recommended -- silence may cause ISP agent to hang up)

### Decision 3: Post-Transfer Monitoring

The Twilio Conference approach gave us visibility into when the user/ISP agent hung up. With Vapi warm transfer, we lose that:

- **Accept the tradeoff:** Set status to `connected` and don't track when the merged call ends. UI shows "Connected" indefinitely until user refreshes or starts a new call.
- **Mitigate with polling:** After setting `connected`, periodically check if the call is still active (but Vapi has no API for this on merged calls).
- **Mitigate with client-side:** The user's browser can detect when they return to the app (page focus event) and query the call status.

### Decision 4: Transfer Trigger Timing

- **AI-initiated (recommended):** The AI stalls briefly, then calls transferCall. This gives the AI a moment to identify itself before the ISP agent goes on hold.
- **Server-initiated (not possible with warm transfer):** Cannot trigger warm transfer via controlUrl.

---

## 14. Open Questions and Risks

### Risk 1: Outbound Call Transfer Reliability

**Level: MEDIUM**

Community reports suggest outbound call transfers can be unreliable. While most reports involve non-Twilio providers, there's some risk that outbound warm transfer with Twilio may have edge cases.

**Mitigation:** Test thoroughly. Keep the current Twilio Conference approach as a fallback that can be re-enabled.

### Risk 2: SDK Type Gap

**Level: LOW**

The `transferAssistant` property is not typed in SDK v0.11.0's `TransferPlan`. The API accepts it (confirmed by docs), but TypeScript will complain.

**Mitigation:** Use `as any` type assertion. Consider checking for a newer SDK version.

### Risk 3: Loss of Post-Merge Visibility

**Level: MEDIUM**

After the warm transfer completes (calls merged), we have no visibility into the ongoing call. We can't detect when the user and ISP agent hang up, can't record call duration, can't get a transcript.

**Mitigation:** Accept this tradeoff for the simplicity gained. The current Twilio Conference approach provides this visibility but at the cost of significantly more infrastructure.

### Risk 4: ISP Agent Experience During Hold

**Level: LOW-MEDIUM**

The ISP agent goes from talking to the AI to suddenly hearing hold music. This transition might confuse them. In the current approach, the AI stalls continuously until the user connects.

**Mitigation:** Have the AI say "Please hold for just a moment while I connect them" before calling transferCall. This sets the expectation that hold music is coming.

### Risk 5: Transfer Assistant Behavior

**Level: LOW**

The transfer assistant is a separate AI model call. It could behave unexpectedly (hallucinate, engage in conversation instead of immediately transferring).

**Mitigation:** Use a very constrained system prompt. Set `maxDurationSeconds: 45` and `silenceTimeoutSeconds: 20` as safety nets. The `firstMessage` handles the greeting, so the model just needs to call `transferSuccessful`.

### Open Question: Does `endCallEnabled: false` Work Reliably?

Community reports suggest `fallbackPlan.endCallEnabled: false` (keep the call going after transfer failure) may not always work as documented. For safety, use `endCallEnabled: true` to ensure the call ends cleanly on failure.

### Open Question: What Happens to `vapiControlUrl` After Transfer?

After the warm transfer starts, the original call's `controlUrl` may become invalid or behave differently. The ISP agent is on hold (not connected to the AI), so `say` commands via controlUrl would go nowhere. After `transferSuccessful`, the Vapi call ends and the controlUrl is definitely invalid.

---

## 15. Sources

### PRIMARY (HIGH confidence)

- **Vapi SDK v0.11.0 type definitions** -- `@vapi-ai/server-sdk/dist/cjs/api/types/`:
  - `TransferPlan.d.ts` -- All TransferPlan properties
  - `TransferPlanMode.d.ts` -- All available transfer modes
  - `TransferAssistant.d.ts` -- Transfer assistant configuration
  - `TransferAssistantModel.d.ts` -- Model config with default system prompt documented
  - `TransferFallbackPlan.d.ts` -- Fallback plan properties
  - `TransferDestinationNumber.d.ts` -- Destination configuration
  - `TransferSuccessfulToolUserEditable.d.ts` -- transferSuccessful tool
  - `TransferCancelToolUserEditable.d.ts` -- transferCancel tool
  - `ServerMessageStatusUpdateEndedReason.d.ts` -- All ended reasons including transfer-related

- **Vapi Official Docs:**
  - [Assistant-based warm transfer](https://docs.vapi.ai/calls/assistant-based-warm-transfer) -- Transfer assistant flow, configuration, tools
  - [Call Forwarding](https://docs.vapi.ai/call-forwarding) -- All transfer modes, transferPlan configuration
  - [Dynamic call transfers](https://docs.vapi.ai/calls/call-dynamic-transfers) -- Server-controlled destinations
  - [Default Tools](https://docs.vapi.ai/tools/default-tools) -- transferCall tool structure
  - [Server events](https://docs.vapi.ai/server-url/events) -- All webhook event types, transfer-update

### SECONDARY (MEDIUM confidence)

- **Vapi Changelog:**
  - [June 4, 2025](https://docs.vapi.ai/changelog/2025/6/4) -- Transfer timeout configuration
  - [May 25, 2025](https://docs.vapi.ai/changelog/2025/5/25) -- transferCompleteAudioUrl property

- **Vapi Community:**
  - [warm-transfer-experimental issues](https://vapi.ai/community/m/1384506884035186719) -- Twilio requirement confirmed, fallback configuration
  - [Warm Transfer to Live Rep](https://vapi.ai/community/m/1382150097026023467) -- Configuration examples, Twilio requirement
  - [Warm Transfer general](https://vapi.ai/community/m/1379637978023858237) -- summaryPlan configuration

### TERTIARY (LOW confidence)

- **Vapi Community (unresolved issues):**
  - [Warm transfer not working with transferCall tool](https://vapi.ai/community/m/1387819965469687949) -- Known issues with warm transfer activation
  - [Transfer call outbound issues](https://vapi.ai/community/m/1420812860090617887) -- Outbound transfer SIP REFER failures (non-Twilio)

---

## Metadata

**Confidence breakdown:**
- Configuration reference: HIGH -- Verified against SDK types and official docs
- Transfer flow: HIGH -- Consistent across docs and community
- Webhook events: MEDIUM -- Event types known, exact payloads during warm transfer not fully documented
- Failure modes: HIGH -- Well-documented in SDK types (endedReasons) and docs
- Outbound compatibility: MEDIUM -- Works in theory with Twilio numbers, community reports mixed but mostly non-Twilio issues
- Post-merge visibility: HIGH -- Confirmed limitation (no visibility after merge)

**Research date:** 2026-02-06
**Valid until:** 2026-03-06
