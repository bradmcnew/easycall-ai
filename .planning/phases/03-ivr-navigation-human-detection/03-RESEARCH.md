# Phase 3: IVR Navigation & Human Detection - Research

**Researched:** 2026-02-06
**Domain:** Vapi AI IVR navigation (DTMF tool), phone tree data modeling, human agent detection via transcript/speech analysis, real-time status updates during navigation
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 transforms the passive "wait on hold" assistant (Phase 2) into an active IVR navigator and human detector. The core work is threefold: (1) design a phone tree data model stored in PostgreSQL JSONB that maps each ISP's menu system, (2) enhance the Vapi assistant configuration with DTMF tool, custom function tools, expanded server messages, and ISP-specific navigation prompts, and (3) build human detection logic using a prompt-driven approach where the AI calls a `human_detected` custom function tool when it determines a live agent has answered.

The recommended approach is **prompt-driven navigation with tool-call signaling**. The AI assistant receives the ISP's phone tree as structured data embedded in its system prompt. It uses the built-in DTMF tool to press keys and listens to transcripts to determine which menu it is in. When the tree mapping is stale or unrecognized, the prompt instructs it to fall back to dynamic listening. For human detection, the assistant calls an async `human_detected` function tool, which triggers a webhook to the backend. The backend updates call status to `agent_detected` and pushes a Pusher event to the browser.

**Primary recommendation:** Use prompt-driven IVR navigation with DTMF tool, a custom `human_detected` function tool for agent detection signaling, subscribe to `transcript` and `speech-update` server messages for live transcript capture, and store phone tree data as JSONB in a new `isp_phone_tree` table.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Phone tree data model
- Full tree mapping for each ISP -- map every known path, not just key routes
- Include timing data per menu step (expected delays, when to press/speak)
- When tree mapping is stale (ISP changed their menu), AI falls back to listening -- interprets what it hears and attempts to navigate dynamically
- Manual admin updates as primary maintenance model -- developer/admin edits tree data when notified of changes
- No automatic learning from failures in this phase

#### Navigation strategy
- Prefer DTMF (button presses) over speech when both are available -- more reliable, less chance of misinterpretation
- Execution approach (prompt-driven vs tool-call driven): Claude's discretion based on Vapi capabilities
- Stuck recovery strategy: Claude's discretion (press 0, restart, escalate -- pick best approach)
- Account verification prompts (enter account number): not in scope for Phase 3 -- AI skips/bypasses these

#### Human detection
- Wait silently when uncertain -- listen for the agent's greeting rather than proactively saying "Hello?"
- Ignore automated hold interruptions ("your call is important to us") -- treat as noise, don't change behavior
- Once a human is detected, count as connected even if agent immediately re-holds ("let me transfer you") -- proceed to Phase 4 transfer flow
- False positive rate tolerance: Claude's discretion -- balance accuracy vs responsiveness

#### Status updates during navigation
- Phase-level granularity -- "Navigating phone tree", "Reached billing queue", "Waiting for agent" -- not step-by-step menu details
- Collapsed transcript available -- live text of what AI hears, hidden behind a "show details" toggle
- No queue position or estimated wait time shown -- even if AI hears it, skip displaying (often inaccurate)
- Prominent alert when human detected -- big visual change, color shift, animation, clear "Agent found!" message

### Claude's Discretion
- Navigation execution approach (prompt-driven vs tool-call)
- Stuck recovery strategy (press 0, restart from top, escalate to user)
- False positive rate for human detection (conservative vs moderate)
- Exact phone tree data schema design
- Transcript capture implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vapi-ai/server-sdk` | ^0.11.0 (already installed) | Vapi API client -- create calls with DTMF tool, function tools | Official SDK; already in project |
| `pusher` / `pusher-js` | ^5.3.2 / ^8.4.0 (already installed) | Real-time transcript + status push to browser | Already in project; works for new event types |
| `drizzle-orm` | ^0.45.1 (already installed) | JSONB schema for phone tree data, new table | Already in project; supports `jsonb()` column type |

### Supporting

No new libraries needed. Phase 3 extends existing integrations (Vapi, Pusher, Drizzle) with new configurations and data.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prompt-driven IVR navigation | Vapi Workflows (visual flow builder) | Workflows are more structured but require dashboard config per ISP; prompt-driven keeps everything in code/data and supports dynamic fallback |
| Custom function tool for human detection | speech-update webhook analysis on backend | Function tool is simpler -- AI decides, backend just receives the signal. Backend speech analysis requires complex heuristics outside the LLM |
| JSONB column for phone tree | Separate relational tables (nodes, edges) | JSONB is simpler for tree-shaped data that's read as a whole, edited infrequently, and embedded directly into prompts. Relational is overkill for 6 ISPs with manual admin updates |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── call/
│   │   └── [id]/
│   │       ├── page.tsx                    # (existing) Server component shell
│   │       └── call-status-client.tsx      # (modify) Add transcript display, agent-found animation
│   ├── api/
│   │   ├── call/
│   │   │   └── start/route.ts             # (modify) Enhanced assistant config with DTMF + tools + expanded serverMessages
│   │   └── webhooks/
│   │       └── vapi/route.ts              # (modify) Handle tool-calls, transcript, speech-update events
├── db/
│   └── schema.ts                           # (modify) Add isp_phone_tree table
├── lib/
│   └── prompt-builder.ts                   # (new) Builds ISP-specific system prompt from phone tree data
├── data/
│   └── isps.ts                             # (modify) Add phone tree seed data
```

### Pattern 1: Prompt-Driven IVR Navigation (Claude's Discretion Recommendation)

**What:** The AI assistant receives the ISP's phone tree structure as structured text in its system prompt. The prompt instructs the assistant to: (1) listen to each menu, (2) match it against the known tree, (3) use the DTMF tool to press the correct key, (4) if the menu doesn't match any known path, fall back to dynamic listening and navigation.

**Why prompt-driven over tool-call driven:** Vapi's DTMF tool is a default tool that the LLM decides when to invoke. There is no separate "IVR navigation engine" in Vapi -- the LLM IS the navigation engine. The system prompt is the control mechanism. Tool-call-driven would mean the backend tells the AI what to press via webhooks, but this adds latency (webhook round-trip per menu step) and complexity. Prompt-driven keeps navigation decisions in the LLM, which has the real-time audio context.

**Confidence:** HIGH (verified: Vapi's IVR navigation docs explicitly describe this pattern)

**When to use:** Every outbound call to an ISP.

**Example:**
```typescript
// src/lib/prompt-builder.ts
interface PhoneTreeNode {
  id: string;
  prompt: string;              // What the IVR says (for matching)
  action: "dtmf" | "speak" | "wait" | "skip";
  keys?: string;               // DTMF keys to press (e.g., "1", "w2w1")
  spokenResponse?: string;     // What to say if action is "speak"
  expectedDelayMs?: number;    // How long to wait before pressing
  children?: PhoneTreeNode[];  // Sub-menu options
  isTargetQueue?: boolean;     // True if this node leads to the target queue
  categorySlug?: string;       // Which issue category this path serves
}

function buildNavigationPrompt(
  ispName: string,
  categoryLabel: string,
  phoneTree: PhoneTreeNode[]
): string {
  const treeDescription = formatTreeForPrompt(phoneTree, categoryLabel);

  return `You are an AI assistant calling ${ispName} customer support.

## Your Mission
Navigate the phone tree to reach the ${categoryLabel} department queue, then wait on hold for a live human agent.

## Phone Tree Map
${treeDescription}

## Navigation Rules
1. LISTEN to each menu prompt fully before pressing any keys.
2. When you recognize a menu from the tree map, use the DTMF tool with the specified keys.
3. PREFER pressing keys (DTMF) over speaking -- it's more reliable.
4. Insert pauses between digits: use "w" (0.5s pause) between keys. Example: "w1w2".
5. If the menu doesn't match anything in the tree map, LISTEN carefully and navigate dynamically:
   - Choose the option most likely to reach ${categoryLabel}
   - If unsure, press 0 to try reaching an operator
   - If you hear "press star to repeat", press * and listen again
6. If asked for an account number, say: "I don't have my account number available, can you help me without it?"
7. Do NOT provide any personal information.

## Hold Behavior
- Once you reach a hold queue, WAIT SILENTLY.
- Do NOT speak during hold music or "please continue to hold" messages.
- These automated interruptions are noise -- ignore them completely.

## Human Detection
When you believe a LIVE HUMAN AGENT has answered (not a recording):
- Listen for: personal greeting ("Hi, my name is..."), direct questions to you, conversational tone
- Do NOT mistake hold interruptions ("your call is important") for a human
- Do NOT proactively say "Hello?" -- wait for them to speak first
- When confident, call the human_detected tool immediately
- Be CONSERVATIVE -- a missed detection just means waiting a bit longer; a false positive wastes the user's time`;
}
```

### Pattern 2: Custom Function Tool for Human Detection Signaling

**What:** Define a `human_detected` function tool on the transient assistant. When the AI determines a live human agent has answered, it calls this tool. The tool-calls webhook fires on the backend, updating call status to `agent_detected` and pushing a Pusher event.

**Why this approach:** The LLM has real-time audio context and conversational understanding. It is better positioned to distinguish "Hi, my name is Sarah, how can I help you?" from "Your call is important to us" than any backend heuristic analyzing transcript snippets. The function tool is the cleanest signal mechanism -- one tool call = one state transition.

**Confidence:** HIGH (verified: Vapi function tools with `async: true` are designed for exactly this -- fire-and-forget signals to the backend)

**When to use:** When the AI detects a human agent has answered.

**Example (assistant tool config):**
```typescript
// In the transient assistant configuration
tools: [
  { type: "dtmf" },  // IVR navigation
  {
    type: "function",
    async: true,  // Don't block the assistant -- it needs to keep talking
    function: {
      name: "human_detected",
      description: "Call this when you are confident a live human agent has answered the phone. Do NOT call for automated messages, hold interruptions, or IVR prompts.",
      parameters: {
        type: "object",
        properties: {
          confidence: {
            type: "string",
            enum: ["high", "medium"],
            description: "How confident you are that this is a live human"
          },
          agentGreeting: {
            type: "string",
            description: "What the agent said that made you think they are human"
          }
        },
        required: ["confidence"]
      }
    }
  },
  {
    type: "function",
    async: true,
    function: {
      name: "navigation_status",
      description: "Report your current position in the phone tree. Call this when you reach a new menu level or enter a hold queue.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["navigating", "reached_queue", "on_hold", "stuck"],
            description: "Current navigation status"
          },
          detail: {
            type: "string",
            description: "Brief description of where you are (e.g., 'Selected billing', 'In hold queue')"
          }
        },
        required: ["status"]
      }
    }
  }
]
```

### Pattern 3: Expanded Webhook Handler for Tool-Calls and Transcripts

**What:** The existing webhook handler currently handles `status-update`, `end-of-call-report`, and `hang`. Phase 3 adds handling for `tool-calls` (human_detected, navigation_status), `transcript` (live transcript capture), and optionally `speech-update`.

**Confidence:** HIGH (verified: tool-calls webhook format documented in Vapi official docs)

**Example (webhook tool-calls handler):**
```typescript
// In /api/webhooks/vapi/route.ts -- new handler section
if (message.type === "tool-calls") {
  const vapiCallId = message.call?.id as string | undefined;
  if (!vapiCallId) return new Response("OK", { status: 200 });

  const callRecord = await db.query.call.findFirst({
    where: eq(call.vapiCallId, vapiCallId),
  });
  if (!callRecord) return new Response("OK", { status: 200 });

  const results = [];
  for (const toolCall of message.toolCallList ?? []) {
    if (toolCall.name === "human_detected") {
      // Update call status to agent_detected
      await db.update(call)
        .set({ status: "agent_detected", updatedAt: new Date() })
        .where(eq(call.id, callRecord.id));

      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType: "agent_detected",
        metadata: JSON.stringify({
          confidence: toolCall.parameters?.confidence,
          agentGreeting: toolCall.parameters?.agentGreeting,
        }),
      });

      // Push prominent alert to browser
      await pusherServer.trigger(callChannel(callRecord.id), "status-change", {
        status: "agent_detected",
        timestamp: new Date().toISOString(),
      });

      results.push({
        toolCallId: toolCall.id,
        result: "Human agent detected. Proceeding to transfer phase.",
      });
    } else if (toolCall.name === "navigation_status") {
      const navStatus = toolCall.parameters?.status;
      const detail = toolCall.parameters?.detail;

      // Map navigation status to call status
      const statusMap: Record<string, string> = {
        navigating: "navigating",
        reached_queue: "on_hold",
        on_hold: "on_hold",
        stuck: "navigating",
      };
      const newStatus = statusMap[navStatus] ?? "navigating";

      await db.update(call)
        .set({ status: newStatus as any, updatedAt: new Date() })
        .where(eq(call.id, callRecord.id));

      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType: "ivr_navigation",
        metadata: JSON.stringify({ status: navStatus, detail }),
      });

      await pusherServer.trigger(callChannel(callRecord.id), "status-change", {
        status: newStatus,
        detail,
        timestamp: new Date().toISOString(),
      });

      results.push({
        toolCallId: toolCall.id,
        result: "Status update received.",
      });
    }
  }

  return Response.json({ results });
}
```

### Pattern 4: Live Transcript Capture via Pusher

**What:** Subscribe to `transcript` server messages from Vapi. Forward final transcripts to the browser via a new `transcript` Pusher event on the call channel. The frontend accumulates transcript lines in a collapsible panel.

**Confidence:** HIGH (verified: transcript event payload includes `role`, `transcriptType`, and `transcript` text)

**Example (webhook transcript handler):**
```typescript
if (message.type === "transcript") {
  const vapiCallId = message.call?.id as string | undefined;
  const transcriptType = message.transcriptType; // "partial" or "final"
  const role = message.role; // "user" (ISP side) or "assistant" (our AI)
  const text = message.transcript;

  if (!vapiCallId || transcriptType !== "final") {
    return new Response("OK", { status: 200 });
  }

  const callRecord = await db.query.call.findFirst({
    where: eq(call.vapiCallId, vapiCallId),
  });
  if (!callRecord) return new Response("OK", { status: 200 });

  // Push transcript to browser (no DB storage needed -- it's transient)
  await pusherServer.trigger(callChannel(callRecord.id), "transcript", {
    role,  // "user" = ISP side, "assistant" = our AI
    text,
    timestamp: new Date().toISOString(),
  });

  return new Response("OK", { status: 200 });
}
```

### Pattern 5: Phone Tree Data as JSONB

**What:** Store ISP phone tree configurations in a new `isp_phone_tree` table with a JSONB `tree` column. Each row links an ISP + issue category to a specific navigation path through the phone tree. The seed script populates initial tree data for all 6 ISPs.

**Confidence:** HIGH (verified: Drizzle ORM supports `jsonb().$type<T>()` for typed JSONB columns)

**Example (schema):**
```typescript
// In db/schema.ts
export const ispPhoneTree = pgTable("isp_phone_tree", {
  id: uuid("id").primaryKey().defaultRandom(),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  version: integer("version").notNull().default(1),
  tree: jsonb("tree").notNull().$type<PhoneTreeNode[]>(),
  notes: text("notes"),  // Admin notes about last update
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("isp_phone_tree_isp_idx").on(table.ispId),
]);
```

### Anti-Patterns to Avoid

- **Backend-driven navigation (webhook per step):** Do NOT have the backend analyze each transcript line and send DTMF commands via the control URL. This adds round-trip latency per menu step (200-500ms each way) and makes navigation sluggish. The LLM has real-time audio context -- let it drive.

- **Storing phone trees in code:** Do NOT embed phone tree structures as TypeScript constants. They need to be updatable without code deployments. Use the database.

- **Parsing transcript on the backend for human detection:** Do NOT build regex-based or keyword-based human detection in the webhook handler. The LLM with real-time audio context is far better at distinguishing "Hi, my name is Sarah" from "Your call is important to us." Let the AI decide and signal via function tool.

- **Sending all transcript messages to Pusher (including partials):** Partial transcripts update very frequently (every few hundred milliseconds). Only forward `final` transcripts to avoid flooding the Pusher channel and causing browser jank.

- **Using speech-update events for human detection:** The `speech-update` event tells you WHEN someone starts/stops speaking and their role, but not WHAT they said. It cannot distinguish "your call is important" (automated) from "hi, how can I help?" (human). Use the LLM's transcript analysis instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IVR navigation engine | Custom state machine with webhook-driven DTMF commands | Prompt-driven LLM with DTMF tool | LLM has real-time audio context; state machine adds latency and fragility |
| Human detection classifier | Keyword matching / regex on transcripts | LLM-based detection via function tool call | Natural language understanding far exceeds pattern matching for conversational vs recorded speech |
| DTMF tone generation | Raw Twilio API DTMF sending | Vapi's built-in `dtmf` tool type | Native integration with telephony provider, RFC 2833 out-of-band, tested |
| Phone tree editing UI | Custom admin dashboard | Direct JSON editing (seed script or future admin API) | 6 ISPs with manual updates -- UI is overkill for Phase 3 |
| Transcript rendering | Custom WebSocket with message buffering | Pusher event on existing call channel | Already have Pusher infrastructure; just add a new event type |

**Key insight:** Phase 3 is primarily a **prompt engineering and data modeling** phase, not a new infrastructure phase. The existing Vapi + Pusher + Drizzle stack handles everything. The new work is: (1) phone tree data, (2) better prompts, (3) more webhook event handling, (4) UI enhancements.

## Common Pitfalls

### Pitfall 1: DTMF Timing Too Fast for IVR Systems
**What goes wrong:** The AI sends DTMF keys too quickly. The IVR doesn't register them. Navigation fails silently -- the IVR repeats the same menu or goes to a default path.
**Why it happens:** Different IVR systems have different DTMF timing requirements. Some need long gaps between digits.
**How to avoid:** Always include pause characters between digits in DTMF sequences. Use `w` (0.5s) as default. The prompt should instruct the AI to use progressive retry: first attempt with `w` pauses, second with `W` (1s) pauses, third attempt speak the option aloud. Store per-ISP timing preferences in the phone tree data.
**Warning signs:** Calls getting stuck in loops, repeating the same menu. Transcript shows the IVR repeating its prompt.
**Confidence:** HIGH (verified: Vapi IVR navigation docs explicitly recommend this progressive retry approach)

### Pitfall 2: AI Speaks Over IVR Menus
**What goes wrong:** The AI starts talking before the IVR finishes reading options. The IVR interprets the AI's speech as an input and routes to the wrong menu.
**Why it happens:** Default `startSpeakingPlan.waitSeconds` is 0.4s, which is too aggressive for IVR interactions where menus can have long pauses between options.
**How to avoid:** Configure `startSpeakingPlan.waitSeconds` to 1.5-2.0 seconds for IVR navigation phase. The system prompt should explicitly instruct: "Wait for ALL menu options to be fully spoken before responding. Reply with a single space character (' ') while waiting to avoid triggering speech."
**Warning signs:** Transcript shows the AI interrupting IVR menus. Navigation goes to wrong departments.
**Confidence:** HIGH (verified: Vapi speech configuration docs and IVR navigation docs both address this)

### Pitfall 3: Hold Interruptions Triggering False Human Detection
**What goes wrong:** Automated messages like "Thank you for your patience, a representative will be with you shortly" or "Did you know you can manage your account online?" trigger the AI to call `human_detected`.
**Why it happens:** These messages are conversational-sounding and can fool the AI into thinking a human has answered.
**How to avoid:** The system prompt must explicitly list common hold interruption patterns and instruct the AI to ignore them. Include ISP-specific known hold message patterns in the phone tree data. Instruct the AI to wait for DIRECT questions addressed to the caller or personal introductions before signaling human detection.
**Warning signs:** `human_detected` tool calls during hold music periods. Multiple false `agent_detected` status updates.
**Confidence:** MEDIUM (this is the highest-risk area -- prompt engineering will need iteration per ISP)

### Pitfall 4: Phone Tree Data Going Stale
**What goes wrong:** ISP changes their phone menu. The mapped tree no longer matches what the AI hears. Navigation fails or goes to the wrong department.
**Why it happens:** ISPs update their IVR systems periodically (quarterly, after mergers, seasonally).
**How to avoid:** The prompt includes a fallback strategy: "If the menu doesn't match the tree map, listen carefully and navigate dynamically." The phone tree data should include a `version` and `updatedAt` timestamp. The AI can still succeed without a perfect tree map -- it just takes longer. Log navigation events so admins can detect when trees are stale.
**Warning signs:** `navigation_status` tool calls with `status: "stuck"` increasing. Call durations increasing for a specific ISP.
**Confidence:** MEDIUM (dynamic fallback is untested but architecturally sound)

### Pitfall 5: Webhook Response Timeout on tool-calls
**What goes wrong:** The `tool-calls` webhook handler takes too long. Vapi times out and the assistant doesn't get the tool result.
**Why it happens:** For sync function tools, Vapi waits for the webhook response (the tool result). If the handler does too much work (multiple DB writes, Pusher trigger), it may exceed the timeout.
**How to avoid:** Use `async: true` on the `human_detected` and `navigation_status` function tools. This makes them fire-and-forget -- the assistant doesn't wait for the result. The webhook handler still processes them, but the assistant continues immediately. This eliminates the timeout risk AND avoids the assistant going silent while waiting for a response.
**Warning signs:** Tool calls appearing in logs but assistant going silent afterward.
**Confidence:** HIGH (verified: Vapi SDK `CreateFunctionToolDto` explicitly supports `async: boolean`)

### Pitfall 6: serverMessages Array Not Including New Event Types
**What goes wrong:** Phase 2 assistant config only subscribes to `["status-update", "end-of-call-report", "hang"]`. Without adding `"transcript"`, `"speech-update"`, and `"tool-calls"`, those events never reach the webhook handler.
**Why it happens:** Vapi only sends server messages you explicitly subscribe to.
**How to avoid:** Update the `serverMessages` array in the transient assistant config:
```typescript
serverMessages: [
  "status-update",
  "end-of-call-report",
  "hang",
  "tool-calls",       // NEW: human_detected, navigation_status
  "transcript",       // NEW: live transcript for UI
  "speech-update",    // NEW: optional, for debugging
]
```
**Warning signs:** Tool calls work from the assistant's perspective but webhook never receives them. No transcript events in logs.
**Confidence:** HIGH (verified from existing Phase 2 code and Vapi docs)

## Code Examples

### Phone Tree Data Schema (TypeScript Types)

```typescript
// src/lib/phone-tree-types.ts
// Source: Designed for this project based on CONTEXT.md requirements

/** A single node in an ISP phone tree */
export interface PhoneTreeNode {
  /** Unique identifier within the tree */
  id: string;
  /** What the IVR says at this menu level (for AI matching) */
  prompt: string;
  /** How to respond to this menu */
  action: "dtmf" | "speak" | "wait" | "skip";
  /** DTMF keys to press (with pause chars). e.g., "w1", "w2w1" */
  keys?: string;
  /** What to say if action is "speak" */
  spokenResponse?: string;
  /** Expected delay in ms before this menu plays */
  expectedDelayMs?: number;
  /** Sub-menu nodes (what happens after pressing/speaking) */
  children?: PhoneTreeNode[];
  /** Which issue categories this path serves (e.g., ["billing", "general"]) */
  categoryMatchSlugs?: string[];
  /** If true, this node means we've reached the target hold queue */
  isHoldQueue?: boolean;
  /** Notes for admin about this node */
  adminNotes?: string;
}

/** Per-ISP phone tree configuration */
export interface IspPhoneTreeConfig {
  /** Root-level menu nodes */
  nodes: PhoneTreeNode[];
  /** Known hold interruption patterns to ignore */
  holdInterruptionPatterns?: string[];
  /** ISP-specific navigation notes for the AI */
  navigationNotes?: string;
  /** Preferred DTMF pause character timing */
  dtmfPauseChar?: "w" | "W";
}
```

### Enhanced Transient Assistant Configuration

```typescript
// Source: Vapi SDK types + Phase 2 existing code in /api/call/start/route.ts
const vapiCall = await vapiClient.calls.create({
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
  customer: { number: ispRecord.supportPhone },
  assistant: {
    name: `EasyCallAI - ${ispRecord.name}`,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: buildNavigationPrompt(
            ispRecord.name,
            categoryRecord.label,
            categoryRecord.slug,
            phoneTreeData
          ),
        },
      ],
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
    transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
    firstMessage: " ",  // Silent -- wait for IVR to speak first
    firstMessageMode: "assistant-speaks-first",
    ...({ silenceTimeoutSeconds: 3600 } as Record<string, unknown>),
    maxDurationSeconds: 2700,
    // Slower response cadence for IVR interaction
    ...({
      startSpeakingPlan: { waitSeconds: 1.5 }
    } as Record<string, unknown>),
    serverMessages: [
      "status-update",
      "end-of-call-report",
      "hang",
      "tool-calls",
      "transcript",
    ],
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi`,
      timeoutSeconds: 20,
      headers: {
        "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET!,
      },
    },
    tools: [
      { type: "dtmf" },
      {
        type: "function",
        async: true,
        function: {
          name: "human_detected",
          description: "Call this ONLY when you are confident a live human agent has answered. Do NOT call for automated messages, hold music interruptions, or IVR prompts.",
          parameters: {
            type: "object",
            properties: {
              confidence: {
                type: "string",
                enum: ["high", "medium"],
                description: "Your confidence level that this is a live human",
              },
              agentGreeting: {
                type: "string",
                description: "What the agent said that indicated they are human",
              },
            },
            required: ["confidence"],
          },
        },
      },
      {
        type: "function",
        async: true,
        function: {
          name: "navigation_status",
          description: "Report your current navigation status. Call when you enter a new menu level or reach a hold queue.",
          parameters: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["navigating", "reached_queue", "on_hold", "stuck"],
              },
              detail: {
                type: "string",
                description: "Brief description (e.g., 'Selected billing option', 'Entered hold queue')",
              },
            },
            required: ["status"],
          },
        },
      },
    ],
  },
});
```

### Drizzle JSONB Column Definition

```typescript
// Source: Context7 - Drizzle ORM docs (column-types/pg)
import { jsonb } from "drizzle-orm/pg-core";
import type { IspPhoneTreeConfig } from "@/lib/phone-tree-types";

export const ispPhoneTree = pgTable("isp_phone_tree", {
  id: uuid("id").primaryKey().defaultRandom(),
  ispId: uuid("isp_id")
    .notNull()
    .references(() => isp.id),
  version: integer("version").notNull().default(1),
  tree: jsonb("tree").notNull().$type<IspPhoneTreeConfig>(),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("isp_phone_tree_isp_idx").on(table.ispId),
]);
```

### Tool-Calls Webhook Response Format

```typescript
// Source: Vapi official docs (server-url/events, custom-tools)
// CRITICAL: toolCallId must match the request's id exactly
// CRITICAL: result must be a string, not an object
// CRITICAL: always return HTTP 200, even for errors
return Response.json({
  results: [
    {
      toolCallId: "abc123",    // Must match toolCall.id from request
      result: "Human agent detected. Proceeding to transfer phase.",
    },
  ],
});
```

## Claude's Discretion Recommendations

### 1. Navigation Execution: Prompt-Driven (RECOMMENDED)

**Recommendation:** Use prompt-driven navigation where the LLM receives the phone tree in its system prompt and drives all navigation decisions autonomously, using the DTMF tool to press keys.

**Rationale:** Vapi's IVR navigation docs describe exactly this pattern. The LLM has real-time audio context that no webhook-based approach can match. The alternative (tool-call-driven where the backend sends DTMF commands) adds 200-500ms latency per step and requires the backend to parse transcripts in real-time.

**Confidence:** HIGH

### 2. Stuck Recovery: Tiered Strategy (RECOMMENDED)

**Recommendation:** Implement a three-tier stuck recovery strategy in the system prompt:
1. **Tier 1 - Retry:** Press `*` to repeat the current menu, listen again
2. **Tier 2 - Operator:** Press `0` to try to reach a general operator
3. **Tier 3 - Report stuck:** Call `navigation_status` with `status: "stuck"`, continue trying

Do NOT escalate to the user (interrupt their day) -- the whole point of the product is they don't have to deal with this. Only surface "stuck" as a status if it persists beyond 3 minutes without progress.

**Rationale:** ISP phone trees always have a "press 0 for operator" escape hatch. Pressing `*` to repeat is universally supported. Escalating to the user defeats the product's purpose.

**Confidence:** MEDIUM (press-0-for-operator works on most but not all ISPs)

### 3. Human Detection: Conservative with Medium Fallback (RECOMMENDED)

**Recommendation:** Start conservative. The prompt should instruct the AI to only call `human_detected` when it hears:
- A personal introduction ("Hi, my name is...")
- A direct question to the caller ("How can I help you today?")
- Conversational back-and-forth (agent responds to something the AI said)

The AI should NOT trigger on:
- Generic hold interruptions ("Your call is important to us")
- Automated transfer announcements ("I'm transferring you to...")
- Queue position updates ("You are caller number 5")

The `confidence` parameter on the tool allows the backend to potentially treat `medium` vs `high` differently in the future (e.g., asking the AI to confirm before triggering transfer).

**Rationale:** A false positive is worse than a false negative. A false positive means the user gets connected to an IVR prompt or hold message. A false negative just means waiting a few extra seconds for the AI to become more confident. The user decision explicitly states "wait silently when uncertain."

**Confidence:** MEDIUM (prompt engineering for this will need iteration)

### 4. Phone Tree Data Schema: Single-Table JSONB (RECOMMENDED)

**Recommendation:** Use a single `isp_phone_tree` table with one row per ISP. The `tree` column is JSONB containing the full `IspPhoneTreeConfig` (all paths for all categories). The tree includes `categoryMatchSlugs` on nodes to indicate which issue categories each path serves.

**Rationale:** With 6 ISPs and manual admin updates, a single JSONB column is the simplest approach. The data is read as a whole (embedded in prompts), never queried field-by-field. A relational model (separate `phone_tree_node` table with parent_id) would add schema complexity for zero query benefit.

**Confidence:** HIGH

### 5. Transcript Capture: Pusher-Only, No DB Storage (RECOMMENDED)

**Recommendation:** Forward final transcript events to the browser via Pusher but do NOT store individual transcript lines in the database during the call. The end-of-call-report from Vapi already includes the full transcript -- that's sufficient for post-call analysis. Real-time transcript is only needed for the UI's collapsible detail panel.

**Rationale:** Storing every transcript line would mean many DB writes per call (potentially hundreds during a 30-min hold). The transcript is transient display data. If the user refreshes the page, the transcript panel resets -- this is acceptable because it's a collapsed "show details" toggle, not a primary feature.

**Confidence:** HIGH

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DTMF via audio injection (unreliable) | Native DTMF via RFC 2833 out-of-band | May 2025 | Significantly more reliable IVR navigation |
| No IVR navigation support | DTMF tool + prompt-driven navigation | 2025 | IVR navigation is now a first-class Vapi feature |
| `serverMessages` limited set | Full event type list including `tool-calls`, `transcript`, `speech-update` | 2025 | Enables real-time transcript capture and tool signaling |
| No async function tools | `async: true` on CreateFunctionToolDto | 2025 | Fire-and-forget signals without blocking assistant |
| No assistant hooks | Hooks for speech timeout, interruption, call ending | 2025 | Could be used for stuck detection (future enhancement) |

**Deprecated/outdated:**
- The old DTMF approach (pre-May 2025) that injected audio tones is replaced by native provider integration
- Community reports from 2024 about DTMF not working are outdated -- native DTMF support resolved most issues

## Open Questions

1. **DTMF reliability per ISP**
   - What we know: Vapi's native DTMF uses RFC 2833 out-of-band signaling, which is more reliable than in-band audio. Twilio supports this natively.
   - What's unclear: Whether all 6 ISPs' IVR systems accept RFC 2833 DTMF. Some legacy systems may only accept in-band audio tones.
   - Recommendation: Test each ISP manually during development. If DTMF fails for a specific ISP, the prompt's fallback (speak the option) handles it. Store per-ISP DTMF preferences in the phone tree data.

2. **startSpeakingPlan configuration via SDK**
   - What we know: The speech configuration docs say this can "only be set via API." The Vapi SDK `CreateAssistantDto` may not type this field.
   - What's unclear: Whether the SDK v0.11 types include `startSpeakingPlan`. It may require the same type assertion workaround used for `silenceTimeoutSeconds`.
   - Recommendation: Use the same `...({ startSpeakingPlan: { waitSeconds: 1.5 } } as Record<string, unknown>)` type assertion pattern already established in Phase 2.

3. **Human detection accuracy in real-world conditions**
   - What we know: The LLM can distinguish conversational speech from automated messages in controlled testing.
   - What's unclear: Accuracy across all 6 ISPs' different agent greeting styles, accents, and handoff procedures. Some ISPs may use AI agents themselves before routing to humans.
   - Recommendation: Start conservative. Log all `human_detected` events with the `agentGreeting` field for post-call analysis. Iterate prompts per ISP based on real-world results. Accept that Phase 3 is the beginning of an iterative process, not a finished product.

4. **Phone tree accuracy for seed data**
   - What we know: ISP phone trees can be researched by actually calling the numbers and documenting the menu structure.
   - What's unclear: Whether the trees will be accurate at time of testing (ISPs change them periodically).
   - Recommendation: Create "best effort" initial trees from web research and manual calling. Include the dynamic fallback in every prompt. The tree data is an optimization (faster navigation), not a hard requirement (the AI can still navigate without it).

## Sources

### Primary (HIGH confidence)
- Vapi IVR Navigation docs: https://docs.vapi.ai/ivr-navigation -- DTMF tool usage, timing, progressive retry, pause characters
- Vapi Default Tools docs: https://docs.vapi.ai/tools/default-tools -- dtmf, transferCall, endCall tool configuration
- Vapi Custom Tools docs: https://docs.vapi.ai/tools/custom-tools -- function tool definition, webhook format, response structure
- Vapi Server Events docs: https://docs.vapi.ai/server-url/events -- transcript, speech-update, tool-calls event payloads
- Vapi Speech Configuration docs: https://docs.vapi.ai/customization/speech-configuration -- startSpeakingPlan, stopSpeakingPlan, endpointing
- Vapi Voice Pipeline docs: https://docs.vapi.ai/customization/voice-pipeline-configuration -- audio processing pipeline stages
- Vapi Assistant Hooks docs: https://docs.vapi.ai/assistants/assistant-hooks -- hook events and actions
- Vapi Call Features docs: https://docs.vapi.ai/calls/call-features -- controlUrl, say, add-message, end-call
- Context7: `/llmstxt/vapi_ai_llms_txt` -- speech-update event structure, tool-calls format, webhook examples
- Context7: `/llmstxt/orm_drizzle_team_llms_txt` -- JSONB column type definition, `.$type<T>()` for typed columns
- Vapi SDK types (local): `@vapi-ai/server-sdk/dist/cjs/api/types/CreateDtmfToolDto.d.ts`, `CreateFunctionToolDto.d.ts` -- confirmed tool DTOs

### Secondary (MEDIUM confidence)
- Vapi Blog: https://vapi.ai/blog/vapi-now-supports-sending-native-dtmf (May 2025) -- native DTMF via provider integration
- Vapi Blog: https://vapi.ai/blog/everything-we-shipped-in-august-2025 -- DTMF reliability improvements
- Vapi Community: https://vapi.ai/community/m/1360413780416139314 -- IVR detection challenges, workarounds discussed

### Tertiary (LOW confidence)
- Human detection accuracy in real-world ISP calls -- no authoritative source; requires testing
- Phone tree data for specific ISPs -- requires manual research/calling
- `startSpeakingPlan` SDK type support in v0.11 -- needs runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed; all existing tools support Phase 3 requirements
- Architecture: HIGH -- prompt-driven navigation with tool-call signaling is the documented Vapi pattern
- Phone tree schema: HIGH -- JSONB in Drizzle is well-documented and fits the use case
- Human detection approach: MEDIUM -- architecturally sound but accuracy requires real-world iteration
- DTMF reliability: MEDIUM -- native support is much better than old approach, but ISP-specific testing needed
- Prompt engineering: LOW -- the prompts are educated hypotheses; they will need iteration after testing

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days; Vapi API is stable, DTMF feature is mature)
