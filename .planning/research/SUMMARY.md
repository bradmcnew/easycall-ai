# Research Summary — EasyCallAI

**Domain:** Autonomous outbound phone call handler for ISP customers
**Researched:** 2026-02-06
**Overall Confidence:** MEDIUM-HIGH

---

## One-Line Summary

EasyCallAI is a dual-call orchestration system using Vapi AI to autonomously navigate ISP phone trees, wait on hold, detect human agents, and warm-transfer users into live conversations — built on Next.js 16 + Vapi + Twilio + BetterAuth + Drizzle/Neon with real-time browser updates via Pusher.

---

## Executive Summary

This product sits in a competitive space where first-generation "hold your place" utilities (LucyPhone, FastCustomer) failed, second-generation "we call for you" services (GetHuman) survive with mixed reviews, and third-generation "AI handles it end-to-end" products (Google Talk to a Live Rep, Piper) are emerging. EasyCallAI targets the gap between Gen 2 and Gen 3: autonomous navigation and hold-waiting like Gen 2, but leveraging modern voice AI infrastructure (Vapi) for reliability, and warm-transferring users like Gen 3 products aspire to do.

The technical approach is well-defined and achievable. **Vapi AI is the correct choice** — it provides purpose-built IVR navigation (DTMF tool), hold music detection via voice activity detection, and warm transfer capabilities that eliminate the need for manual dual-call orchestration. **Twilio is mandatory** because Vapi's warm transfer only works with Twilio-based telephony. The stack is modern and serverless-friendly: Next.js 16 for full-stack framework, BetterAuth with phone-number-as-identity for auth, Drizzle ORM + Neon for PostgreSQL persistence, and Pusher for real-time browser updates (SSE/WebSocket on Vercel are unreliable for this use case).

The core architectural pattern is an **event-driven state machine**. Each call transitions through states (initiating → navigating_ivr → on_hold → agent_detected → transferring → connected → completed/failed) driven by Vapi webhook events. The single webhook endpoint at `/api/webhooks/vapi` is the nervous system — it receives all Vapi server messages, updates call state in PostgreSQL, and publishes real-time updates to the browser via Pusher channels (channel-per-call pattern). Assistant configuration is transient (dynamically generated per ISP), not saved/reusable, because each ISP has unique phone tree structures.

**Critical risks:**
1. **Human detection reliability** (HIGH) — Distinguishing live agents from IVR recordings is imprecise and ISP-dependent. Requires conservative detection logic, prompt engineering per ISP, and acceptance of false negatives over false positives.
2. **Agent hangup during transfer gap** (CRITICAL) — The 10-30 second window between detecting an agent and connecting the user is deadly. Agents hang up after 15-30 seconds of hold. The AI must stall conversationally (not just hold music) before triggering transfer.
3. **Cost at scale** (MEDIUM-HIGH) — Vapi charges ~$0.07/min during hold, ~$0.20/min during active navigation. A 30-minute hold + 5-minute navigation/transfer = ~$2.50/call. At 100 calls/day, that's $7,500/month. This is NOT a free-tier product at scale.

**Mitigation strategies:**
- Implement progressive human detection (require conversational back-and-forth, not just speech)
- Build agent stalling dialogue into the prompt (pre-brief the agent about the issue to buy time)
- Set hard `maxDurationSeconds` caps per ISP (45 min for Comcast, 30 min for others)
- Track cost-per-successful-call, not cost-per-call (failed transfers waste money)

---

## Recommended Stack

### Core Technologies

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Framework** | Next.js | ^16.1.6 | App Router for SSE-capable route handlers, API routes for Vapi webhooks, Server Actions for mutations. Native Vercel deployment. Turbopack stable by default. |
| **Voice AI** | Vapi AI | N/A (SaaS) | Purpose-built for outbound calls + IVR navigation + warm transfers. DTMF tool, speech detection, webhook events. No self-hosted alternative matches time-to-market. |
| **Telephony** | Twilio | N/A (SaaS) | **Mandatory, not optional.** Warm transfer only works with Twilio in Vapi. Import Twilio numbers into Vapi for unlimited outbound calling (Vapi numbers have daily limits). |
| **Auth** | BetterAuth | ^1.4.18 | Phone-number-as-identity with built-in SMS OTP plugin. Framework-agnostic, TypeScript-first. No SaaS vendor lock-in (unlike Clerk). Integrates with Drizzle for session storage. |
| **SMS** | Twilio Verify | N/A (SaaS) | $0.05/verification. Handles OTP delivery, retry, fraud detection. Use same Twilio account for both telephony and auth SMS. |
| **Database** | PostgreSQL (Neon) | 16+ | Serverless PostgreSQL with native Vercel integration. Pure Postgres (no BaaS wrapper like Supabase). Built-in PgBouncer connection pooling. Free tier: 100 CU-hours, 0.5 GB. |
| **ORM** | Drizzle ORM | ^0.45.1 | Type-safe, zero dependencies (~7.4kb), serverless-optimized. Use `neon-http` driver for stateless API routes (lowest latency). |
| **Real-time** | Pusher Channels | N/A (SaaS) | Server-to-client push for call status updates. Free tier: 200K messages/day, 100 concurrent connections. SSE on Vercel has 25s timeout (unusable for long holds). |
| **Styling** | Tailwind CSS | ^4.1.18 | v4 stable with CSS-first config. First-class Next.js 16 support. |
| **TypeScript** | TypeScript | ^5.7 | Required by Drizzle for type-safe queries. Vapi SDK ships TypeScript types. Non-negotiable. |

### Critical Version Notes

- **Twilio compatibility:** Warm transfer requires Twilio, Vapi phone numbers, or SIP trunks. Telnyx/Vonage NOT supported.
- **Neon over Supabase:** Neon is pure Postgres (Supabase's auth conflicts with BetterAuth). Vercel migrated to Neon in 2024-2025.
- **Pusher over SSE:** Vercel Edge Functions timeout at 25s. SSE connections drop. Long holds (30+ min) require dedicated real-time infrastructure.

---

## Table Stakes Features

Features users expect. Missing any means the product feels broken.

### Core Flow (T1-T10)

1. **Phone tree navigation (T1)** — AI autonomously navigates ISP IVR menus using DTMF tones. Requires ISP-specific phone tree mapping (data, not code). Phone trees change periodically; needs maintenance strategy.

2. **Hold detection + waiting (T2)** — Classify hold music vs. human speech vs. silence vs. automated messages. This is the core value proposition. False negatives (missing the agent) are worse than false positives.

3. **User callback when agent answers (T3)** — Call the user back when a human agent is detected. Single callback attempt is acceptable for MVP.

4. **Real-time call status updates (T4)** — Users must see: "Did the call start? Am I in the queue? How long on hold? Is someone answering?" Without this, zero confidence the service is working. Web UI + SMS updates.

5. **Issue/reason categorization (T5)** — User specifies their problem (billing, tech support, cancel service, general) so AI navigates to correct department.

6. **ISP selection with known phone numbers (T6)** — Curated list of ISPs with stored phone numbers and phone tree maps. MVP scope: Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink.

7. **Authentication / identity (T7)** — Phone number is identity AND callback target. SMS OTP is standard.

8. **Call history (T8)** — Past calls, outcomes, retry capability. Basic list view: date, ISP, issue, status, duration.

9. **Agent stalling / warm handoff (T9)** — When agent picks up, AI keeps them engaged while calling user back. Dead air = agent hangs up. **This is the hardest table-stakes feature.** "Please hold one moment while I connect you" is minimum.

10. **Conference bridge / call merge (T10)** — User answers callback, gets connected to agent, AI drops off. Use Vapi's `warm-transfer-experimental` mode (handles this automatically).

### Dependency Chain

```
T7 (SMS Auth) ─────────────────────────┐
                                       │
T6 (ISP Selection) ──► T5 (Issue) ──► T1 (Nav) ──► T2 (Hold) ──► T9 (Stall) ──► T3 (Callback) ──► T10 (Bridge)
                                                                                           │
                                                                                           ├──► T4 (Status)
                                                                                           └──► T8 (History)
```

---

## Key Architecture Decisions

### 1. Vapi Warm Transfer (not dual-call orchestration)

**Decision:** Use Vapi's built-in `warm-transfer-experimental` mode rather than creating two independent Vapi calls and manually bridging via Twilio conference API.

**Why:** Vapi handles the hard part automatically — it places ISP caller on hold with audio, dials user's phone, merges both parties into Twilio conference when user answers, then drops the AI off.

**Constraint:** Only works with Twilio-based telephony. This is why Twilio is mandatory.

**Source:** [Vapi Warm Transfer Docs](https://docs.vapi.ai/calls/assistant-based-warm-transfer)

### 2. Single webhook endpoint, event-driven state machine

**Pattern:** One `/api/webhooks/vapi` route that dispatches on `message.type`. Webhook handler is the central nervous system — receives all Vapi events, drives state transitions.

**Call states:**
```
initiating → queued → ringing → in_progress → navigating_ivr → on_hold →
agent_detected → stalling_agent → transferring → user_ringing → connected →
completed/failed/cancelled
```

**Database schema (simplified):**
- `calls` table: id, user_id, isp_id, vapi_call_id, **state**, issue_description, phone_number, transcript, recording_url, metadata, timestamps
- `call_events` table: id, call_id, event_type, from_state, to_state, payload, timestamp

**Key webhook events:**
- `status-update` → Update call state, publish to Pusher
- `transcript` → Store transcript, publish live updates
- `speech-update` → Detect when human agent picks up (role: "user", status: "started")
- `tool-calls` → Execute business logic (e.g., transfer destination)
- `transfer-update` → Track transfer progress
- `end-of-call-report` → Finalize call record with recording URL, transcript, endedReason

### 3. Pusher for real-time browser updates (not SSE, not WebSocket)

**Decision:** Use Pusher Channels for server-to-client push. Do not attempt SSE or WebSocket on Vercel serverless.

**Why:**
- Vercel serverless functions timeout at 25s (even with streaming). SSE connections drop.
- Hold times can exceed 30+ minutes. SSE cannot maintain connection that long.
- Pusher is purpose-built for this: server publishes, browser subscribes. Zero polling.

**Pattern:**
```typescript
// Webhook handler
await pusher.trigger(`private-call-${callId}`, 'state-change', {
  state: 'agent_detected',
  message: 'Agent answered! Connecting you now...',
  timestamp: new Date().toISOString()
});

// Browser
const channel = pusher.subscribe(`private-call-${callId}`);
channel.bind('state-change', (data) => updateUI(data));
```

**Free tier:** 200K messages/day, 100 concurrent connections. Sufficient for MVP.

### 4. Transient assistants with ISP-specific prompts

**Decision:** Use transient (inline) assistant configuration per call, not saved/reusable assistants. Prompt is dynamically generated from ISP phone tree data.

**Why:** Each ISP has different phone trees, requiring different DTMF sequences. User's issue description must be embedded in the prompt.

**Configuration:**
```typescript
{
  model: { provider: "openai", model: "gpt-4o-mini" },
  tools: [{ type: "dtmf" }, { type: "function", function: { name: "transferCall" } }],
  firstMessage: " ",  // Silent — listen first, don't speak
  silenceTimeoutSeconds: 3600,  // Max allowed (increased from 600 in late 2024)
  maxDurationSeconds: 2700,     // 45 minutes for ISP holds
  transferPlan: { mode: "warm-transfer-experimental", ... }
}
```

**Human detection strategy:** Prompt instructs AI to distinguish IVR recordings from live humans by:
1. Conversational speech patterns (questions directed at caller)
2. Agent identification ("Hi, my name is X")
3. When confident, trigger transfer tool
4. Before transferring, stall with natural responses

### 5. ISP configuration as data, not code

**Pattern:** Store ISP phone trees, support numbers, DTMF sequences as structured data in PostgreSQL, not hardcoded in assistant prompts.

**Why:** Adding new ISPs should be a data operation, not code change. Phone trees change — Comcast is redesigning their entire system in H1 2025.

**Schema (conceptual):**
```typescript
{
  name: "Comcast Xfinity",
  supportNumber: "+18001234567",
  phoneTree: [
    { prompt: "For English, press 1", action: "dtmf", keys: "1" },
    { prompt: "For technical support, press 2", action: "dtmf", keys: "2" },
    { prompt: "Hold for next available agent", action: "wait" }
  ],
  estimatedHoldTime: "15-45 minutes",
  agentGreetingPattern: "Thank you for calling .* my name is"
}
```

---

## Critical Risks (Top 5)

### 1. Agent Hangs Up During Transfer Gap (CRITICAL)

**Description:** The 10-30 second window between detecting a live agent and user answering the callback is deadly. ISP agents hang up after 15-30 seconds of hold/silence. If user's phone rings 4-5 times (20s) without answer, the entire 30+ minute hold was wasted.

**Warning Signs:**
- Call state reaches `transferring` but never reaches `connected`
- End-of-call-report shows `endedReason: "customer-ended-call"` during transfer
- Users report "nobody was there when I answered"

**Prevention:**
- AI must stall with conversation BEFORE triggering transfer (not during)
- Pre-brief agent about the issue to buy 15-20 seconds: "Let me get the account holder. Their name is... and they're calling about..."
- Send SMS notification 2-3s before phone rings: "YOUR ISP AGENT IS READY! Answer NOW!"
- If user doesn't answer in 15s, AI returns to agent: "I'm sorry, having trouble connecting. One more moment?"
- Track agent patience per ISP

**Phase:** Phase 5 (Transfer and bridging), design stalling strategy in Phase 4

### 2. False Positive Human Detection (CRITICAL)

**Description:** AI mistakes IVR recordings or hold interruptions for live agents. ISPs play messages like "Your estimated wait time is 12 minutes" or "Did you know you can manage your account at xfinity.com?" User gets called back only to be connected to a recording. Trust destroyed.

**Warning Signs:**
- User reports hearing hold music or recording after callback
- Transfer triggered within 1-3 minutes of going on hold (too fast)
- Call transcripts show "agent" saying generic promotional phrases

**Prevention:**
- Require multiple signals: (1) speech directed at caller, (2) responsive to AI's reply, (3) conversational back-and-forth (minimum 2 exchanges)
- Build ISP-specific "known interruption" library — teach AI to ignore hold-interruption phrases
- Confidence threshold: don't trigger transfer until >90% confident
- Use `speech-update` webhook to analyze patterns — recordings have consistent timing, humans have variation
- Test by calling each ISP 10+ times, log every speech event during hold

**Phase:** Phase 4 (IVR navigation + hold detection) — this is the hardest engineering problem

### 3. Vapi Silence Timeout Kills Call During Hold (CRITICAL)

**Description:** ISP hold queues can have periods of pure silence between hold music tracks. If `silenceTimeoutSeconds` is too low (default 30s), Vapi hangs up thinking call was abandoned.

**Warning Signs:**
- `endedReason: "silence-timed-out"` during `on_hold` state
- Calls drop at similar hold durations for same ISP

**Prevention:**
- Set `silenceTimeoutSeconds: 3600` (maximum as of late 2024)
- Set `maxDurationSeconds: 2700` (45 min) or `3600` (1 hour)
- Use idle messages via Assistant Hooks to keep session active
- Monitor ISPs with unusually long silence gaps

**Phase:** Phase 2 (Vapi integration) — configure from first test

### 4. Outbound Number Flagged as Spam (CRITICAL)

**Description:** Many outbound calls to ISP support lines → carriers flag number as "Spam Likely." ISP phone systems may block calls from flagged numbers. Once flagged, calls don't connect or route to dead end.

**Warning Signs:**
- Call success rate drops suddenly
- Calls show `endedReason: "busy"` or fail to reach `in-progress`
- T-Mobile users report issues first (most aggressive carrier)

**Prevention:**
- Register with Twilio Trust Hub for STIR/SHAKEN A-level attestation
- Enroll in Twilio Voice Integrity to register with carrier analytics engines
- Use pool of 5-10 outbound numbers, rotate them
- Don't make >10-15 calls/day from single number
- Register with CNAM to display "EasyCallAI" instead of "Unknown Caller"
- Monitor per-number success rates, retire flagged numbers
- Avoid calling same ISP >3-4 times/hour from same number

**Phase:** Phase 2 (Vapi integration) — set up Trust Hub before making test calls at scale

### 5. IVR Phone Tree Changes Without Notice (HIGH)

**Description:** ISPs update phone trees regularly. Comcast announced complete redesign launching H1 2025. Hardcoded navigation breaks silently. AI presses "2 for tech support" but menu changed to "2 for billing." Users wait 30 minutes to reach wrong department.

**Warning Signs:**
- Sudden increase in `failed` state during `navigating_ivr`
- Transcripts show unfamiliar IVR prompts
- Users report wrong department connections
- AI loops (presses options that send back to main menu)

**Prevention:**
- Build adaptive AI, not scripted: "Here is EXPECTED phone tree. If different, use best judgment for [billing/tech support/etc.]"
- Store ISP configs with `last_verified` timestamp; alert when >7 days old
- Implement weekly automated verification calls — AI navigates tree, logs what it hears, diffs against stored config
- Track per-ISP success rates daily; sudden drop signals change
- Fallback: if can't navigate after 3 DTMF attempts, try speaking department name (many modern IVRs accept speech)
- Admin dashboard alert when IVR navigation failure rate >20% for any ISP

**Phase:** Phase 4 (IVR navigation) — build adaptive navigation from start

---

## Build Order Implications

### Suggested Phase Structure

Based on dependency analysis and risk mitigation, here's the recommended build order:

#### **Phase 1: Foundation (No Telephony)**
**Duration:** 1 week
**Deliverables:** Database schema, auth (BetterAuth + SMS OTP), user signup flow, ISP selection UI

**Rationale:** Everything depends on user identity and ISP data. No external service dependencies to debug. Can be fully tested locally.

**Features:** T7 (auth), T6 (ISP database), T5 (issue categorization)

**Critical setup:**
- Twilio 10DLC registration (1-5 business days approval time)
- BetterAuth phone number plugin with Twilio SMS
- Drizzle schema for users, ISPs, calls (schema only, no call execution)

#### **Phase 2: Vapi Integration (Outbound Call Only)**
**Duration:** 1 week
**Deliverables:** Vapi API client, outbound call creation, webhook endpoint, basic state machine (initiating → in_progress → completed/failed)

**Rationale:** Proves core telephony integration works. No IVR navigation yet — just call an ISP number and hang up. Tests webhook delivery, state persistence, Vapi configuration.

**Features:** Call creation API, webhook handler skeleton, call state tracking

**Critical setup:**
- Twilio Trust Hub registration (spam prevention)
- Import Twilio numbers into Vapi
- Configure `maxDurationSeconds: 2700`, `silenceTimeoutSeconds: 3600` from start
- Optimize webhook response time (<3s target) with Neon HTTP driver
- Implement webhook event deduplication (Vapi retries)

#### **Phase 3: Real-Time Updates**
**Duration:** 3-5 days
**Deliverables:** Pusher integration, channel-per-call pattern, frontend status display component

**Rationale:** Once webhooks work (Phase 2), wire them to browser. Thin integration layer. Seeing call status in real-time is first "wow" moment.

**Features:** T4 (real-time status), Pusher channel management, frontend status UI

**Pattern:** `private-call-{callId}` channels, browser subscribes on call creation

#### **Phase 4: IVR Navigation + Hold Detection** (HIGHEST RISK)
**Duration:** 2-3 weeks
**Deliverables:** ISP phone tree configs, dynamic assistant prompt generation, DTMF tool usage, hold detection logic, human agent detection

**Rationale:** This is the hard AI/telephony work. Requires Phase 2 (working calls) and Phase 3 (real-time feedback for testing). Will require iterative testing per ISP.

**Features:** T1 (phone tree navigation), T2 (hold detection), human detection (critical risk #2)

**Critical work:**
- Test each ISP 10+ times to map phone trees and hold patterns
- Build ISP-specific "known interruption" library
- Implement progressive DTMF retry (fast → paused → spoken)
- Develop conservative human detection (require conversational back-and-forth)
- Store ISP configs as data with `last_verified` timestamps

**Research flag:** This phase will need `/gsd:research-phase` for each ISP's phone tree structure and hold patterns.

#### **Phase 5: Transfer and Bridging**
**Duration:** 1 week
**Deliverables:** Warm transfer configuration, transfer-destination-request handler, agent stalling prompt, user callback flow, conference merging

**Rationale:** Depends on Phase 4 (must reach human agent before transferring). Completes core product loop.

**Features:** T3 (user callback), T9 (agent stalling), T10 (conference bridge)

**Critical work:**
- Agent stalling dialogue (15-20s of conversation before transfer)
- Pre-briefing strategy (tell agent about the issue)
- SMS notification timing (2-3s before phone rings)
- Handle missed callbacks (single attempt for MVP)
- CNAM registration for caller ID display

#### **Phase 6: Polish and Edge Cases**
**Duration:** 1-2 weeks
**Deliverables:** Error handling, retry logic, call history UI, recording playback, estimated hold time display

**Rationale:** Quality-of-life features that depend on full flow working. Can't handle edge cases until happy path is proven.

**Features:** T8 (call history), improved error messages, failure recovery

**Differentiators to add:**
- D3 (multiple callback attempts) — low complexity, high impact
- D4 (SMS fallback notification) — nearly free if SMS infra exists
- D9 (multi-channel status updates) — incremental

### Research Flags

**Needs deep research during planning:**
- Phase 4: Each ISP's phone tree structure (map IVR options, DTMF sequences, hold patterns)
- Phase 4: Human detection patterns (test calls, transcript analysis)

**Standard patterns (skip research):**
- Phase 1: BetterAuth setup (well-documented)
- Phase 2: Vapi API integration (official docs sufficient)
- Phase 3: Pusher integration (Vercel guide exists)
- Phase 5: Warm transfer (Vapi docs cover this)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| **Stack** | HIGH | All technologies verified via official docs. Versions confirmed current and stable. Twilio requirement is hard constraint (warm transfer limitation). |
| **Features** | MEDIUM | Table stakes features are standard for the domain (validated via GetHuman, Google Talk to a Live Rep). Differentiators are logical extensions. Human detection reliability is unknown (needs real-world testing). |
| **Architecture** | HIGH | Vapi warm transfer eliminates dual-call complexity. State machine pattern is proven for async telephony workflows. Pusher solves real-time problem cleanly. Webhook optimization strategies documented. |
| **Pitfalls** | MEDIUM-HIGH | Critical pitfalls identified via Vapi community forums, Twilio docs, competitive analysis. Mitigation strategies sourced from official docs and real-world examples. Transfer gap timing and human detection remain highest uncertainty. |

### Gaps to Address

**During roadmap planning:**
- Specific ISP phone tree mappings (requires manual testing)
- Hold time cost modeling (need usage estimates)
- Pusher tier planning (when to upgrade from free)
- Legal review for TCPA compliance and recording consent

**During implementation:**
- Human detection prompt engineering (iterative testing per ISP)
- Agent stalling dialogue scripts (A/B test stalling strategies)
- Transfer timing optimization (measure agent patience per ISP)
- DTMF reliability testing (some ISPs use in-band tones vs. RFC 2833)

**Post-MVP:**
- Cost optimization (minimize IVR navigation time, set tighter max duration caps)
- Spam prevention monitoring (track number reputation, rotate pool)
- Phone tree change detection (automated verification calls)

---

## Cost Estimates

### Per-Call Cost Breakdown

| Component | Hold Phase | Active Phase | Source |
|-----------|-----------|--------------|--------|
| Vapi platform fee | $0.05/min | $0.05/min | Vapi pricing |
| Twilio telephony | $0.01/min | $0.01/min | Standard PSTN rates |
| Deepgram STT | $0.01/min | $0.01/min | Transcription running throughout |
| LLM (GPT-4o-mini) | ~$0.005/min | ~$0.02-0.20/min | Minimal during hold, active during IVR nav + stalling |
| TTS (ElevenLabs) | ~$0.002/min | ~$0.04/min | Minimal during hold, active during conversation |
| **Total/min** | **~$0.08/min** | **~$0.13-0.31/min** | |

### Example Call Scenarios

**Scenario 1: Typical successful call**
- IVR navigation: 3 min × $0.20/min = $0.60
- Hold time: 25 min × $0.08/min = $2.00
- Agent stall + transfer: 2 min × $0.20/min = $0.40
- **Total: ~$3.00 per successful call**

**Scenario 2: Long hold, successful**
- IVR navigation: 3 min × $0.20/min = $0.60
- Hold time: 45 min × $0.08/min = $3.60
- Agent stall + transfer: 2 min × $0.20/min = $0.40
- **Total: ~$4.60 per successful call**

**Scenario 3: Failed transfer (agent hangs up)**
- IVR navigation: 3 min × $0.20/min = $0.60
- Hold time: 25 min × $0.08/min = $2.00
- Agent stall attempt: 1 min × $0.20/min = $0.20
- **Total: ~$2.80 (zero value delivered)**

### Scale Cost Projections

| Volume | Cost/Day | Cost/Month | Notes |
|--------|----------|------------|-------|
| 10 calls/day | $30-50 | $900-1,500 | MVP testing, free tiers sufficient |
| 50 calls/day | $150-250 | $4,500-7,500 | Need Pusher paid tier ($49/mo), Vapi line scaling |
| 100 calls/day | $300-500 | $9,000-15,000 | Add Twilio number pool ($11.50/mo for 10 numbers), monitor spam flagging |

**Additional monthly costs:**
- Vercel Pro: $20/mo (required for 60s function timeout)
- Pusher Startup (at 50+ concurrent calls): $49/mo
- Twilio phone numbers (pool of 10): $11.50/mo
- Twilio 10DLC registration: ~$19 one-time
- Vapi concurrent lines (beyond 10): $10/line/mo
- Neon paid tier (if needed): starts at $19/mo

**This is NOT a free-tier product at scale.** Even with free-tier services, Vapi + Twilio per-minute costs dominate. Monetization is critical.

---

## Open Questions

1. **Monetization strategy:** Free tier? Subscription? Per-call pricing? Credits? Need business model that covers $3-5 per successful call.

2. **ISP phone tree maintenance:** Who maintains ISP configs when phone trees change? Manual updates? Crowdsourced? Automated verification calls?

3. **Two-party consent states:** Can we record agent conversations for quality/transcript purposes in CA, FL, IL, etc.? Need legal review.

4. **Multi-attempt callback:** MVP is single attempt. Should retry logic be in Phase 6 or deferred to v2?

5. **Queue position announcements:** Some ISPs announce "You are caller number 7." Should we extract and display this? Requires NLU on hold audio.

6. **Best time to call data:** Do we build historical hold time tracking from day 1, or defer to post-MVP?

7. **International expansion:** All research assumes US-only. What changes for EU/UK (GDPR, different ISPs, languages)?

---

## Sources

### Stack Research
- Vapi documentation (IVR navigation, warm transfer, webhooks, costs)
- BetterAuth phone number plugin docs
- Drizzle ORM + Neon connection docs
- Twilio STIR/SHAKEN, Voice Integrity, 10DLC docs
- Vercel serverless limits and real-time pub/sub guides
- Pusher Channels pricing and integration docs

### Features Research
- GetHuman (primary Gen 2 competitor analysis)
- Google Talk to a Live Rep, Ask for Me, Pixel Hold for Me (Gen 3 products)
- LucyPhone, FastCustomer (defunct Gen 1 products)
- Piper (emerging beta competitor)
- Market data on hold times and customer service grievances

### Architecture Research
- Vapi official docs (outbound calling, transfers, server events, tools)
- Vercel real-time patterns and limitations
- Twilio conference bridge patterns
- Drizzle ORM + Neon serverless driver compatibility

### Pitfalls Research
- Vapi community forums (transfer failures, DTMF issues, timeout problems)
- Twilio docs (spam remediation, call recording, compliance)
- FCC TCPA rulings (AI calls, consent requirements)
- State-by-state recording consent laws
- BetterAuth GitHub issues (phone verification security gaps)
- Competitive analysis (GetHuman reviews, Vapi alternative analyses)

**Overall source quality:** HIGH for stack and architecture (official docs), MEDIUM for features (competitive analysis, limited public data), MEDIUM-HIGH for pitfalls (community forums + official docs + regulatory sources).

---

## Ready for Requirements

This synthesis provides:
- Clear technology recommendations with rationale
- Complete feature landscape (table stakes + differentiators + anti-features)
- Proven architectural patterns with specific implementation guidance
- Risk assessment with mitigation strategies
- Phase structure suggestions based on dependencies
- Cost modeling for roadmap scoping
- Identified gaps requiring validation during planning

**Next step:** Requirements definition can proceed with confidence. The roadmapper agent has sufficient context to structure phases, identify which phases need deeper research (`/gsd:research-phase`), and make technology/feature trade-offs.
