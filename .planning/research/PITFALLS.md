# Pitfalls Research — EasyCallAI

**Domain:** Autonomous outbound phone call handler (ISP hold-waiting service)
**Researched:** 2026-02-06
**Overall confidence:** MEDIUM-HIGH — synthesized from Vapi docs, Vapi community forums, Twilio docs, FCC regulations, competitive analysis (GetHuman), and real-world telephony engineering patterns.

---

## Critical Pitfalls (Will Break the Product)

### CP-1: Agent Hangs Up During the Transfer Gap

**Description:** The most dangerous moment in the entire flow is the 10-30 second window between when your AI detects a live agent and when the user's phone actually rings. During warm transfer, Vapi places the ISP agent on hold (with hold audio), dials the user, waits for the user to answer, then merges. ISP agents are trained to hang up after ~15-30 seconds of hold/silence. If the user's phone rings 4-5 times (15-20 seconds) and they don't answer immediately, the agent hangs up. The entire 30+ minute hold was wasted.

**Warning Signs:**
- End-of-call-report shows `endedReason: "customer-ended-call"` (the ISP agent hung up) during transfer state
- Call state reaches `transferring` or `user_ringing` but never reaches `connected`
- Users report "the service called me but when I answered, nobody was there"

**Prevention Strategy:**
- AI must stall the agent with conversation BEFORE triggering the transfer, not during. Build 15-20 seconds of natural dialogue ("Let me get the account holder on the line, they'll be right with you. Their name is... and they're calling about...")
- Pre-brief the agent about the issue (D8 feature) to buy stalling time
- Configure the transfer assistant's `firstMessage` to be short and immediate: "Connecting you now" rather than a long greeting
- Send SMS notification to user 2-3 seconds before the phone rings ("Your ISP agent is ready! Answering incoming call NOW")
- If user doesn't answer within 15 seconds, AI should return to the ISP agent and say "I'm sorry, the account holder is having trouble connecting. Could you hold for just one more moment?" then retry
- Track agent patience per ISP — some ISPs have agents that wait longer than others

**Which Phase Should Address:** Phase 5 (Transfer and bridging) — but design the stalling strategy in Phase 4 (IVR navigation + hold detection)

---

### CP-2: False Positive Human Detection (Transferring to a Recording)

**Description:** The AI mistakes an IVR recording, automated message, or hold interruption for a live human agent and triggers the transfer prematurely. ISP phone systems frequently interrupt hold music with messages like "Thank you for your patience. Your estimated wait time is 12 minutes" or "Did you know you can manage your account at xfinity.com?" These sound conversational and can fool speech detection. The user gets called back only to be connected to a recording, destroying trust.

**Warning Signs:**
- User reports hearing hold music or a recording after being called back
- Call transcripts show the "agent" saying generic promotional phrases
- Transfer is triggered within 1-3 minutes of going on hold (too fast for most ISP queues)
- Multiple rapid transfers on the same call

**Prevention Strategy:**
- Require multiple signals before declaring "human detected": (1) speech directed AT the caller ("How can I help you?"), (2) responsive to AI's reply, (3) conversational back-and-forth (minimum 2 exchanges)
- Build an ISP-specific "known interruption" library — record the common hold-interruption phrases per ISP and instruct the AI to ignore them
- Implement a confidence threshold: don't trigger transfer until the AI is >90% confident it's a human, even if it means the agent waits 5-10 extra seconds
- Use `speech-update` webhook events to analyze speech patterns — recorded messages have consistent timing and cadence; humans have natural variation
- Test by calling each ISP 10+ times and logging every speech event during hold phase

**Which Phase Should Address:** Phase 4 (IVR navigation + hold detection) — this is the single hardest engineering problem in the product

---

### CP-3: Vapi Silence Timeout Kills Call During Hold

**Description:** Vapi's `silenceTimeoutSeconds` defaults to 30 seconds. ISP hold queues can have periods of pure silence between hold music tracks, especially during queue position changes or system transitions. If `silenceTimeoutSeconds` is too low, Vapi hangs up thinking the call was abandoned. A 45-minute hold wasted because of a 35-second silence gap.

**Warning Signs:**
- End-of-call-report shows `endedReason: "silence-timed-out"` during `on_hold` state
- Calls consistently drop at similar hold durations for the same ISP (suggesting a predictable silence gap in their hold system)
- Users report "it was on hold and then just hung up"

**Prevention Strategy:**
- Set `silenceTimeoutSeconds` to 3600 (the maximum, as of late 2024 Vapi increased the limit from 600 to 3600)
- Set `maxDurationSeconds` to 2700 (45 minutes) or 3600 (1 hour) depending on ISP
- Use idle messages via Assistant Hooks to keep the Vapi session active during long silences — configure a `customer-speech-timeout` hook that triggers every 60 seconds with a silent response rather than ending the call
- Monitor for ISPs whose hold systems have unusually long silence gaps and adjust per-ISP

**Which Phase Should Address:** Phase 2 (Vapi integration) — configure these values from the very first outbound call test

---

### CP-4: Outbound Number Flagged as Spam

**Description:** When your Twilio/Vapi number makes many outbound calls to ISP support lines, carriers and ISP phone systems may flag it as "Spam Likely" or "Scam Likely." ISP phone systems themselves may block calls from numbers flagged by analytics engines (Hiya, TNS, First Orion). Once flagged, your calls either don't connect or the ISP system routes them to a dead end. STIR/SHAKEN attestation only helps partially — attestation level A (verified caller) is input to but does not override carrier spam analytics.

**Warning Signs:**
- Call success rate drops suddenly (calls show `endedReason: "busy"` or fail to reach `in-progress`)
- ISP-side calls ring but go to a generic voicemail or "this number is not in service" message
- Users of specific carriers (T-Mobile is most aggressive) report issues first
- Twilio logs show calls completing but Vapi reports no IVR interaction (call was silently blocked)

**Prevention Strategy:**
- Register with Twilio's Trust Hub to achieve STIR/SHAKEN A-level attestation
- Enroll in Twilio Voice Integrity ($) to register numbers with T-Mobile, AT&T, and Verizon analytics engines
- Use a pool of 5-10 outbound numbers and rotate them; don't make more than 10-15 calls/day from any single number
- Register with CNAM (Caller ID Name) to display "EasyCallAI" instead of "Unknown Caller"
- Consider Twilio Branded Calling to display your business name on the recipient's phone
- Monitor per-number success rates and retire/replace numbers that get flagged
- Avoid calling the same ISP number more than 3-4 times per hour from the same outbound number

**Which Phase Should Address:** Phase 2 (Vapi integration) — set up Trust Hub and Voice Integrity before making any significant volume of test calls

---

### CP-5: IVR Phone Tree Changes Without Notice

**Description:** ISPs update their phone trees regularly — menu options change, department numbers shift, new authentication requirements are added, seasonal prompts appear. Comcast specifically announced a complete phone system redesign launching in the first half of 2025. Your hardcoded phone tree navigation will break silently. The AI will press "2 for technical support" but the menu now has "2 for billing." Users wait 30 minutes only to reach the wrong department.

**Warning Signs:**
- Sudden increase in calls reaching `failed` state during `navigating_ivr` phase
- Call transcripts show the AI hearing unfamiliar IVR prompts
- Users report being connected to the wrong department
- The AI gets stuck in a loop (pressing options that send it back to the main menu)

**Prevention Strategy:**
- Build the AI to be adaptive, not scripted. The system prompt should say "Here is the EXPECTED phone tree. If you hear different options, use your best judgment to select the option most likely to reach [billing/tech support/etc.]"
- Store ISP phone tree configs as data with a `last_verified` timestamp; alert when configs are older than 7 days without verification
- Implement automated weekly verification calls — AI calls each ISP, navigates the tree, logs what it hears, and diffs against stored config
- Track per-ISP success rates daily; a sudden drop signals a phone tree change
- Build a fallback strategy: if the AI cannot navigate the tree after 3 DTMF attempts, it should try speaking the department name (e.g., "technical support") since many modern IVRs accept speech input
- Consider an admin dashboard alert system that flags when IVR navigation failure rate exceeds 20% for any ISP

**Which Phase Should Address:** Phase 4 (IVR navigation) — build adaptive navigation from the start, not rigid scripts

---

### CP-6: Webhook Processing Exceeds Vapi's Response Time Limit

**Description:** Vapi enforces a hard ~7.5 second timeout for webhook responses on request-type events (`tool-calls`, `transfer-destination-request`, `assistant-request`). If your Vercel serverless function experiences a cold start (500ms-2s) + database connection (200-500ms) + query execution (100-500ms) + business logic, you can easily exceed 5-6 seconds. When the webhook times out, Vapi retries 3 times with exponential backoff (5s, 10s, 20s). If all retries fail, the call loses context — the AI won't know where to transfer the user, which tool response to use, or what assistant configuration to apply. The call effectively breaks.

**Warning Signs:**
- Vapi dashboard shows webhook errors (503, timeout)
- Call logs show `hang` events (Vapi detected delay)
- `tool-calls` for DTMF or transfer don't execute — AI says "Let me try that" but nothing happens
- Sporadic failures that correlate with deployment times (cold starts after new deployment)

**Prevention Strategy:**
- Use Neon's HTTP driver (`drizzle-orm/neon-http`) for webhook handlers — avoids TCP connection overhead, ~50ms vs ~500ms for cold WebSocket connections
- Acknowledge webhooks immediately with HTTP 200 and process asynchronously for non-response events (status-update, transcript, end-of-call-report)
- For response-required events (tool-calls, transfer-destination-request), minimize DB queries — cache ISP configs in memory or use edge-compatible KV store
- Keep the webhook handler on Node.js runtime (not Edge) for compatibility, but precompute transfer destinations at call creation time and store in the call record
- Set up a Vercel cron job that pings the webhook endpoint every 5 minutes to keep the function warm
- Target <3 second response time to leave margin for network jitter
- Use `waitUntil` (Next.js `after()`) to defer non-critical work (logging, Pusher publish, event storage) after the response is sent

**Which Phase Should Address:** Phase 2 (Vapi integration) — optimize webhook performance from the very first implementation

---

## Significant Pitfalls (Will Degrade Experience)

### SP-1: False Negative Human Detection (Missing the Agent)

**Description:** The AI fails to recognize that a human agent has answered, continuing to "wait on hold" while the agent says "Hello? Hello? Is anyone there?" and eventually hangs up. This is the inverse of CP-2. It happens when the agent's greeting is short, mumbled, or overlaps with the hold music fade-out. The user's wait was wasted, but unlike CP-2, the user never even gets called back — they just see "still on hold" in the UI while the agent has already hung up.

**Warning Signs:**
- End-of-call-report transcripts show an agent speaking and the AI not responding
- Call ends with `endedReason: "customer-ended-call"` (agent hung up) while state was `on_hold`
- Hold times significantly exceed the ISP's published averages

**Prevention Strategy:**
- Configure the AI to respond to ANY direct speech with acknowledgment, even if uncertain: "Hello, yes, I'm here. One moment please while I connect you with the account holder."
- Use `speech-update` webhook with `role: "user"` and `status: "started"` as a trigger to transition from `on_hold` to `agent_detected` — don't rely solely on transcript content analysis
- Set the AI's `silenceTimeoutSeconds` generously but have it proactively respond to speech events during hold phase
- Build a "guard response" — if any non-hold-music speech is detected during `on_hold` state, the AI immediately engages conversationally even before confirming it's a human

**Which Phase Should Address:** Phase 4 (IVR navigation + hold detection)

---

### SP-2: User Doesn't Answer the Callback

**Description:** When the AI detects a live agent and initiates the warm transfer to the user, the user may not answer their phone. They might have stepped away, be in a meeting, or not recognize the incoming number. With single-attempt callback (MVP scope), the call fails entirely. The AI must apologize to the ISP agent and hang up. The user sees "agent answered but you missed the call" — deeply frustrating after a 30-minute wait.

**Warning Signs:**
- Transfer state reaches `user_ringing` but never reaches `connected`
- High percentage of calls fail at the transfer stage
- User complaints about missing the callback

**Prevention Strategy:**
- Send push notification AND SMS simultaneously when agent is detected: "YOUR ISP AGENT IS ON THE LINE. Answer your phone NOW!"
- Make the callback number recognizable — use CNAM registration so the caller ID shows "EasyCallAI" not an unknown number
- Show a countdown timer in the browser UI: "We're calling you now! Answer your phone within 20 seconds"
- Play a distinctive ringtone pattern if possible (Twilio supports custom caller tunes)
- Implement multiple callback attempts post-MVP (D3) — try 3 times with 15-second gaps
- If all attempts fail, SMS the user with "We reached an agent but couldn't connect you. Would you like us to try again? Reply YES"
- Track per-user answer rates; if a user consistently misses callbacks, prompt them to keep their phone nearby before future calls

**Which Phase Should Address:** Phase 5 (Transfer and bridging) for core, Phase 6 for retry logic

---

### SP-3: DTMF Tones Not Recognized by ISP IVR

**Description:** Vapi sends DTMF tones via RFC 2833 (out-of-band), but some legacy ISP IVR systems only recognize in-band audio tones, or have specific timing requirements. The AI "presses 1" but the IVR doesn't register it. The AI is stuck at the first menu, repeatedly pressing buttons that don't work. Some IVRs require specific pause durations between digits, or require the `#` key to confirm selections.

**Warning Signs:**
- AI transcript shows DTMF tool being called repeatedly for the same menu option
- Call gets stuck in `navigating_ivr` state for more than 2-3 minutes
- IVR repeats the same menu options despite AI pressing the correct key
- Works for some ISPs but not others

**Prevention Strategy:**
- Implement Vapi's progressive retry strategy: fast first (`1`), then with short pauses (`1w`), then with long pauses (`1W`), then speak the option ("one" or "technical support")
- Test each ISP's IVR system with different DTMF methods and document what works in the ISP config
- Use the `w` (500ms) and `W` (1000ms) pause characters between multi-digit sequences
- Instruct the AI to wait for the IVR to finish speaking ALL options before sending any DTMF — premature digit sending is the #1 cause of failure
- Configure `startSpeakingPlan` with slower cadence during the first 30 seconds (IVR phase)
- If DTMF fails 3 times, fall back to speech input: say the option name out loud
- Add a timeout: if IVR navigation takes more than 5 minutes, log it as a configuration issue and fail gracefully

**Which Phase Should Address:** Phase 4 (IVR navigation)

---

### SP-4: Pusher Free Tier Exhaustion / Real-Time Update Failures

**Description:** Pusher's free sandbox tier allows 200K messages/day and 100 concurrent connections. During hold, you're sending periodic status updates (every 30-60 seconds). With 50 concurrent calls on 45-minute holds, you're generating ~2,250 messages/hour for status updates alone, plus state changes, transcript updates, etc. At scale, you'll hit the daily message limit. More critically, 100 concurrent connections means only 100 users can have the browser open simultaneously.

**Warning Signs:**
- Users report the status display freezing or going blank
- Pusher dashboard shows rate limiting or quota exceeded errors
- Browser console shows WebSocket disconnection errors
- Status updates arrive late or not at all during peak hours

**Prevention Strategy:**
- Reduce message frequency during hold: send status updates every 60 seconds, not every 10 seconds
- Batch multiple event types into a single Pusher message where possible
- Implement client-side polling as a fallback: if Pusher disconnects, poll `/api/calls/{id}/status` every 10 seconds
- Plan for Pusher paid tier ($49/month Startup plan: 2M messages/day, 500 connections) once you exceed 20-30 concurrent users
- Consider switching to Ably (more generous free tier: 6M messages/month, 200 concurrent connections) if costs become an issue
- Use private channels to prevent unauthorized subscriptions consuming connection slots

**Which Phase Should Address:** Phase 3 (Real-time updates)

---

### SP-5: LLM Context Window Degradation on Long Holds

**Description:** During a 30-60 minute hold, the Vapi assistant accumulates a massive transcript of hold music descriptions, silence notifications, automated messages, and idle responses. The LLM's context window fills up with irrelevant hold content. When the agent finally answers, the AI's performance degrades — it may forget its instructions about stalling, transfer procedures, or the user's issue description. With GPT-4o-mini's 128K context window this is less likely, but token costs increase with context length.

**Warning Signs:**
- AI behaves erratically after long holds — forgets to stall, triggers transfer incorrectly, or doesn't recognize the agent
- Token usage spikes for calls with long hold times
- AI responses become slower as the call progresses (more tokens to process)

**Prevention Strategy:**
- Configure the assistant prompt to explicitly state: "During hold periods, do not generate verbose descriptions of hold music or silence. Simply note 'still on hold' periodically."
- Use Vapi's `messagePlan` to control what gets added to the conversation history — minimize hold-phase noise
- Set `maxTokens` on the model to limit response length during hold phase
- Consider using GPT-4o-mini for IVR navigation + hold (cheap, fast) and switching to a more capable model only when human detection triggers (if Vapi supports mid-call model switching)
- Keep the system prompt concise; embed only the essential phone tree info, not a verbose description

**Which Phase Should Address:** Phase 4 (IVR navigation + hold detection)

---

### SP-6: 10DLC Registration Not Completed for SMS

**Description:** Since September 2023, A2P (Application-to-Person) messaging on 10-digit long codes requires 10DLC registration with carriers via Twilio's Trust Hub. Without registration, SMS OTP messages for authentication will be heavily filtered or outright blocked by carriers. Users will sign up, request an OTP, and never receive it. This is not a gradual degradation — it's a hard block for unregistered senders.

**Warning Signs:**
- Users report not receiving OTP codes (especially on T-Mobile and AT&T)
- Twilio message logs show `status: "undelivered"` with error code 30007 or 30034
- SMS delivery rates below 80% (should be >95% when properly registered)
- Delivery failures concentrated on specific carriers

**Prevention Strategy:**
- Register for 10DLC through Twilio Trust Hub BEFORE launching, even for development/testing
- Brand registration costs ~$4 one-time; campaign registration costs ~$15 one-time
- Registration approval takes 1-5 business days — don't wait until launch week
- Use Twilio Verify API instead of raw SMS for OTP — it handles compliance routing and has better delivery rates
- Test OTP delivery on multiple carriers (T-Mobile, AT&T, Verizon) during development
- If using Twilio Verify with BetterAuth's custom OTP mode, be aware that "Custom Verification Code" mode costs $0.05 per attempt (not per success) and disables Twilio's fraud protection

**Which Phase Should Address:** Phase 1 (Foundation) — register 10DLC during initial Twilio setup

---

### SP-7: Vercel Function Timeout on Long Webhook Processing Chains

**Description:** While individual webhook events are fast, certain event sequences trigger chain reactions: agent detection -> update DB -> publish to Pusher -> trigger transfer -> update DB again -> publish to Pusher again. If any step is slow, the entire chain may exceed Vercel's function timeout (60 seconds on Pro plan, 10 seconds on Hobby). More critically, Vercel's Hobby plan has a 10-second timeout — development testing will silently truncate webhook processing that works fine locally.

**Warning Signs:**
- Webhook handler returns 504 Gateway Timeout
- Partial state updates (DB updated but Pusher event not sent, or vice versa)
- Functions work locally (no timeout) but fail on Vercel
- Inconsistent behavior between Hobby and Pro plans

**Prevention Strategy:**
- Use Vercel Pro plan from the start ($20/month) for 60-second timeout; Hobby's 10-second limit is unworkable for production webhook processing
- Split webhook processing: respond to Vapi immediately, then use `waitUntil`/`after()` for non-critical operations
- Never chain multiple external API calls synchronously in the webhook handler — Vapi response, DB update, and Pusher publish should be parallelized or deferred
- Use a queue (Upstash QStash or Inngest) for complex multi-step reactions to decouple the webhook response from downstream processing
- Set `maxDuration` in the route handler: `export const maxDuration = 30;`

**Which Phase Should Address:** Phase 2 (Vapi integration)

---

## Minor Pitfalls (Worth Knowing)

### MP-1: BetterAuth Phone Number Verification Security Gap

**Description:** BetterAuth's phone number plugin has a known security issue where `authClient.updateUser()` can modify `phoneNumber` directly while `phoneNumberVerified` stays `true`. A user could change their phone number to someone else's without re-verification.

**Prevention Strategy:** Override the `updateUser` endpoint to require re-verification when `phoneNumber` changes. BetterAuth 1.4+ includes fixes for this, but verify the behavior with your version.

---

### MP-2: BetterAuth + Twilio Verify OTP Mismatch

**Description:** BetterAuth generates its own OTP codes, but Twilio Verify also generates OTPs. If you use BetterAuth's `sendOTP` hook with Twilio Verify in standard mode, the two OTPs won't match. You must either use Twilio's "Custom Verification Code" mode (which costs $0.05/attempt instead of $0.05/success and disables fraud protection) or use raw Twilio SMS instead of Twilio Verify.

**Prevention Strategy:** Use raw Twilio SMS with BetterAuth's `sendOTP` hook for simplicity. If you need Twilio Verify's fraud protection, use the `verifyOTP` hook to delegate verification entirely to Twilio, bypassing BetterAuth's OTP generation.

---

### MP-3: Neon Cold Start After Scale-to-Zero

**Description:** Neon's free tier scales compute to zero after 5 minutes of inactivity. Reactivation adds 500ms to a few seconds of latency. During off-peak hours, the first user interaction may feel slow. This compounds with Vercel's own cold starts.

**Prevention Strategy:** Use Neon's HTTP driver (no persistent connection needed). On paid plans, configure a minimum compute size to avoid scale-to-zero. For the free tier, accept the latency or keep the connection warm with a Vercel cron job.

---

### MP-4: Twilio Verify vs. Programmable SMS Pricing Confusion

**Description:** Twilio Verify costs $0.05 per successful verification. Programmable SMS costs $0.0079 per segment in the US. For OTP, Verify seems 6x more expensive, but it includes retry logic, fraud detection, and delivery optimization. Choosing raw SMS to save money may result in higher costs from undelivered OTPs and support overhead.

**Prevention Strategy:** Start with Twilio Verify ($0.05/verification) for simplicity and security. Switch to raw SMS only if verification costs become a significant line item at scale (>1000 verifications/month).

---

### MP-5: Time Zone and ISP Operating Hours

**Description:** ISP support lines have different hours. Comcast is 24/7, but some smaller ISPs close at 8 PM local time. Calling outside hours means navigating the IVR to a "we're closed" message, wasting Vapi minutes.

**Prevention Strategy:** Store ISP operating hours in the database. Check hours before initiating a call. Display a message like "Cox support opens at 8 AM ET. We'll start your call automatically at 8:01 AM." if outside hours.

---

### MP-6: Call Recording Storage and Retention

**Description:** Vapi provides recording URLs in the `end-of-call-report` webhook. These URLs may expire (check Vapi's retention policy). If you store them in the database without downloading the actual audio, users may find broken links when reviewing call history weeks later.

**Prevention Strategy:** If you offer call recording playback (D2 feature), download and store recordings in your own storage (e.g., Vercel Blob or S3) immediately upon receiving the webhook. Don't rely on Vapi's URLs for long-term access.

---

### MP-7: Vapi Assistant First Message on Outbound Calls

**Description:** When creating an outbound call, the assistant's `firstMessage` is spoken immediately when the call connects. If you set it to a greeting ("Hello, I'm calling about..."), it may start speaking over the ISP's IVR welcome message, confusing the system. Vapi's IVR documentation recommends using a space character `" "` as the first message to stay silent.

**Prevention Strategy:** Set `firstMessage: " "` (single space) for IVR navigation calls. The AI should listen first, then respond to IVR prompts.

---

## ISP-Specific Gotchas

### ISP-1: Comcast/Xfinity Phone System Redesign

Comcast announced a complete redesign of their 1-800-XFINITY phone support experience, targeting the first half of 2025. This means any phone tree mapping done before the redesign will be invalidated. Additionally, Comcast is expanding to multilingual support (English, Spanish, ASL, and more). Your AI may encounter language selection prompts that weren't there before.

**Mitigation:** Build adaptive IVR navigation, not static. Plan for a complete Comcast re-mapping effort. Monitor Comcast community forums for phone system change announcements.

### ISP-2: ISP IVR Authentication Requirements

Many ISPs require account verification early in the phone tree ("Please enter your 10-digit account number" or "Please enter the last 4 digits of the account holder's Social Security number"). Your AI cannot and should not handle this. If the IVR requires authentication before reaching a queue, the AI gets stuck.

**Mitigation:** Map which ISPs require authentication at which points. For ISPs that require it early, instruct the AI to say "I don't have my account number available" or try to bypass with "I'd like to speak with a representative." Test each ISP's bypass paths. Document which ISPs are compatible (no auth required to queue) vs. incompatible.

### ISP-3: ISP Callback Systems Competing with Yours

Many ISPs now offer their own callback systems ("Press 1 to receive a callback when an agent is available"). If the AI accidentally opts into the ISP's callback, the ISP hangs up your call and calls back the Vapi phone number — which can't handle inbound calls in the same session. The callback arrives on a different context, and the user's session is lost.

**Mitigation:** Instruct the AI to NEVER accept ISP callback offers. Always choose "wait on hold" when offered the choice. Add this to every ISP's prompt configuration.

### ISP-4: ISP Hold Queue Re-Authentication

Some ISPs play a message after long holds asking "Are you still there? Press 1 to stay in the queue." If the AI doesn't respond, the ISP drops the call.

**Mitigation:** Instruct the AI to listen for these prompts and respond with DTMF or speech. Include common "still there?" patterns in the system prompt for each ISP.

### ISP-5: ISP Chat Deflection

ISPs increasingly try to deflect phone callers to chat. The IVR may say "For faster service, visit xfinity.com/chat" and then provide fewer phone options. Some ISPs have made it intentionally harder to reach a human by phone.

**Mitigation:** Map the persistence path for each ISP. Some require pressing "0" multiple times or saying "representative" repeatedly. Test and document the shortest path to a human queue.

---

## Vapi-Specific Gotchas

### VG-1: Default 10-Minute Call Duration Limit

Vapi's `maxDurationSeconds` defaults to 600 (10 minutes). ISP holds regularly exceed 30 minutes. If you forget to override this, every call will terminate after 10 minutes during hold. This is the most common rookie mistake with Vapi.

**Fix:** Always set `maxDurationSeconds: 2700` (45 min) or `3600` (60 min) in the transient assistant config.

### VG-2: Default 30-Second Silence Timeout

Vapi's `silenceTimeoutSeconds` defaults to 30 seconds. Hold music has gaps. Set it to the maximum (3600 seconds) for hold-waiting use cases.

**Fix:** Set `silenceTimeoutSeconds: 3600` in every ISP call assistant config.

### VG-3: 10 Concurrent Call Limit

Vapi's default plan allows only 10 concurrent calls (inbound + outbound). Each additional SIP line costs $10/month. If you have 11 users requesting calls simultaneously, the 11th call creation API request will fail.

**Fix:** Monitor concurrent call count. Queue calls if at capacity. Display "All lines are busy, your call will start in approximately X minutes." Upgrade Vapi plan before hitting the limit. Budget for $10/concurrent-line/month.

### VG-4: Warm Transfer Only Works with Twilio

The `warm-transfer-experimental` mode is limited to Twilio-based telephony (Twilio numbers, Vapi-provisioned numbers, or SIP trunks). Telnyx and Vonage are NOT supported. This is not a temporary limitation — it's an architectural constraint of how Vapi bridges calls.

**Fix:** Use Twilio or Vapi-provisioned phone numbers exclusively. Do not import Telnyx numbers hoping warm transfer will work.

### VG-5: Webhook Retry Behavior

Vapi retries webhooks 3 times with exponential backoff (5s, 10s, 20s). This means your webhook handler may receive the same event multiple times. If your handler is not idempotent, you'll process transfers twice, send duplicate Pusher events, or create duplicate call event records.

**Fix:** Implement event deduplication. Use a composite key of `callId + messageType + timestamp` or Vapi's message ID. Check for existing records before processing.

### VG-6: Transfer Assistant Configuration Pitfalls

When using `warm-transfer-experimental` with a `transferAssistant`, the transfer assistant is a separate AI that talks to the user during the callback. If its `maxDurationSeconds` is too short (e.g., 30 seconds), it will hang up before the user answers. If its `firstMessage` is too long, the ISP agent is waiting while the transfer assistant delivers a monologue.

**Fix:** Set transfer assistant `maxDurationSeconds: 120` (2 minutes) to handle slow user answers. Keep `firstMessage` under 5 seconds: "Hi, your ISP agent is on the line. Connecting you now."

### VG-7: Vapi Server URL Must Be HTTPS

Vapi silently fails to deliver webhooks if your server URL is HTTP (not HTTPS). During local development with tools like ngrok, this is usually fine. But misconfiguring the production URL without HTTPS means zero webhooks arrive and the call has no backend visibility.

**Fix:** Always use HTTPS. On Vercel, this is automatic. During local development, use ngrok or Vapi's CLI webhook testing tool.

### VG-8: Speech-Update Event Timing

The `speech-update` webhook event with `role: "user"` fires when the ISP-side speech starts. But there's latency between when the agent starts speaking and when the webhook arrives at your server (100-500ms network + processing). Your state machine must account for this: the agent may have already spoken several words by the time you process the `speech-update`.

**Fix:** Don't rely on `speech-update` alone for human detection. Combine it with transcript analysis. The AI should be instructed to respond to speech regardless of webhook processing timing.

---

## Legal/Compliance Considerations

### LC-1: TCPA Classification of AI Calls

**The rule:** The FCC's February 2024 declaratory ruling confirmed that AI-generated voice calls are classified as "artificial or prerecorded voice" under the Telephone Consumer Protection Act (TCPA). Making such calls without prior express consent is illegal.

**Impact on EasyCallAI:** Your outbound calls TO ISPs use AI-generated voice. Technically, the AI is calling the ISP's support line, not a consumer. TCPA primarily regulates calls TO consumers, not calls to business support lines. However, the ISP agent is a person receiving an AI-generated voice — disclosure may be required.

**What to do:**
- The user explicitly requests the call (implied consent for the call on their behalf)
- The AI should disclose to the ISP agent: "This is an automated assistant calling on behalf of a customer. The account holder will be joining shortly."
- Do NOT auto-call ISPs without user initiation; each call must be user-triggered
- Document consent: store a timestamp and the user's explicit action in the call record

### LC-2: State Call Recording Consent Laws

**Two-party consent states:** California, Connecticut, Delaware, Florida, Illinois, Maryland, Massachusetts, Michigan, Montana, Nevada, New Hampshire, Pennsylvania, Washington. In these states, ALL parties must consent to recording.

**Impact on EasyCallAI:**
- During IVR + hold phase: no human on the ISP side = no consent needed for monitoring
- When agent answers: the agent is a party to the call. ISPs typically announce "this call may be recorded" at the start (their own recording), but that doesn't grant YOU recording rights
- If you record the agent conversation portion, you may need separate consent

**What to do:**
- Do NOT record the user-agent conversation portion by default
- Only record/transcribe the AI-ISP interaction during IVR navigation and hold (no human present)
- If offering transcripts (D2 feature), implement opt-in with an announcement: "This call may be recorded for quality purposes"
- When the user connects, stop Vapi's recording/transcription or clearly announce recording to the agent
- Consult an actual attorney — this is not legal advice

### LC-3: AI Disclosure Laws

**California AB 2905 (2025):** Requires disclosure when a person is interacting with AI. Fines of $500 per undisclosed AI interaction.

**Other states:** Multiple states are considering or have passed AI disclosure requirements.

**Impact on EasyCallAI:** When the AI stalls the ISP agent, the agent is interacting with AI. Depending on the state, you may be required to disclose this.

**What to do:** Have the AI identify itself when interacting with the agent: "This is an automated assistant connecting you with the account holder." This satisfies disclosure requirements and is also just good practice — agents who know they're talking to a bot are less likely to hang up thinking it's a dead line.

### LC-4: FCC Consent Per-Seller Rule (April 2026)

**The rule:** Starting April 11, 2026, consent must be obtained separately per seller/entity. This primarily affects marketing, but any AI-initiated calls should document clear, single-purpose consent.

**Impact on EasyCallAI:** Minimal if the user explicitly triggers each call. But if you ever implement features like scheduled callbacks or "we'll try again automatically," you need explicit per-feature consent.

**What to do:** Keep a clear consent trail. Every call should trace back to a specific user action (button press). Never auto-initiate calls.

---

## Cost Traps

### CT-1: Vapi Per-Minute Costs During Extended Holds

**The math:**
- Vapi platform fee: $0.05/min
- Twilio telephony: ~$0.01/min
- Deepgram STT: ~$0.01/min
- LLM (GPT-4o-mini, minimal during hold): ~$0.005/min
- TTS (minimal during hold): ~$0.002/min
- **Hold-phase cost: ~$0.07-0.08/min**
- **Active-phase cost (IVR nav + agent stall): ~$0.15-0.25/min**

**Real scenario:**
- Average ISP hold time: 25 minutes
- IVR navigation: 3 minutes
- Agent stall + transfer: 2 minutes
- **Total: 30 minutes = ~$2.40-2.80 per successful call**
- **Failed call (agent hangs up during transfer): same cost, zero value**

**At scale:** 100 calls/day at $2.50 = $250/day = $7,500/month in Vapi costs alone.

**Mitigation:**
- Set a `maxDurationSeconds` cap per ISP based on reasonable hold expectations (45 min for Comcast, 30 min for Spectrum, etc.)
- Track cost per call and set budget alerts
- Investigate if Vapi offers any "hold mode" pricing (reduced rate when AI is mostly silent) — currently they do not
- Consider per-call pricing for users or a subscription model that covers estimated costs
- Optimize IVR navigation speed — every minute saved in IVR navigation is $0.25 saved in active-phase costs

### CT-2: Twilio Phone Number Costs Add Up

**Costs:**
- Each Twilio phone number: $1.15/month
- A pool of 10 numbers for spam rotation: $11.50/month
- Voice Integrity registration: contact Twilio for pricing (enterprise feature)
- Branded Calling: additional cost per number
- 10DLC registration: ~$4 (brand) + ~$15 (campaign) one-time

**Mitigation:** Start with 2-3 numbers. Only expand the pool if spam flagging becomes an issue.

### CT-3: Pusher Pricing Cliff

**Free tier:** 200K messages/day, 100 concurrent connections
**Startup tier:** $49/month for 2M messages/day, 500 connections
**Pro tier:** $99+/month for more

The jump from free to paid is significant for a student project. Monitor usage closely.

**Mitigation:** Reduce message frequency. Consider Ably's free tier (6M messages/month) as an alternative. SSE with polling fallback eliminates this cost entirely but adds complexity.

### CT-4: Vapi Concurrent Call Line Costs

Each line beyond the default 10 costs $10/month. If you pre-provision 50 lines for expected traffic, that's $400/month regardless of usage.

**Mitigation:** Only provision lines as needed. Monitor concurrent call peaks. Queue excess requests rather than over-provisioning.

### CT-5: Failed Calls Cost the Same as Successful Ones

A call that navigates the IVR for 3 minutes, holds for 20 minutes, detects an agent, but fails during transfer costs exactly the same as a successful call. There's no refund for failed value delivery.

**Mitigation:** Track failure rates by stage. Invest heavily in transfer reliability (CP-1) — a 90% transfer success rate vs. 70% means 20% less wasted spend. Calculate cost-per-successful-call, not cost-per-call.

### CT-6: Development/Testing Costs

Every test call to an ISP costs $2-3 in Vapi + Twilio charges. Testing IVR navigation for 6 ISPs with 10 test calls each = $120-180 in testing costs alone. Hold testing is especially expensive.

**Mitigation:** Use Vapi's web call feature for non-telephony testing. Build a mock IVR for local testing (a simple Twilio IVR that simulates hold + agent pickup). Only test against real ISP numbers for validation, not iteration. Record and replay audio from real calls for offline testing.

---

## Sources

### Vapi Official Documentation
- [Vapi IVR Navigation](https://docs.vapi.ai/ivr-navigation) — DTMF timing, retry strategies, pause characters
- [Vapi Call Forwarding / Transfer](https://docs.vapi.ai/call-forwarding) — warm transfer modes, provider limitations
- [Vapi Assistant-Based Warm Transfer](https://docs.vapi.ai/calls/assistant-based-warm-transfer) — transfer assistant configuration
- [Vapi Call Concurrency](https://docs.vapi.ai/calls/call-concurrency) — 10-call default, line pricing
- [Vapi Server Events](https://docs.vapi.ai/server-url/events) — webhook timing, response requirements
- [Vapi Speech Configuration](https://docs.vapi.ai/customization/speech-configuration) — silence timeout, max duration
- [Vapi Debug Forwarding Drops](https://docs.vapi.ai/phone-calling/transfer-calls/debug-forwarding-drops) — troubleshooting transfer failures
- [Vapi Default Tools](https://docs.vapi.ai/tools/default-tools) — DTMF tool behavior
- [Vapi Idle Messages](https://docs.vapi.ai/assistants/idle-messages) — handling silence during hold

### Vapi Community Issues
- [Outbound call transfer fails every time](https://vapi.ai/community/m/1380675203637575690) — SIP REFER failures
- [DTMF failing for IVR for some systems](https://vapi.ai/community/m/1413582433382830152) — IVR compatibility issues
- [Calls ending because of silence timeouts](https://vapi.ai/community/m/1373959886865913876) — timeout configuration
- [Max Duration 10.0 min](https://vapi.ai/community/m/1371553008923578538) — default duration limit
- [How We Solved DTMF Reliability in Voice AI Systems](https://vapi.ai/blog/how-we-solved-dtmf-reliability-in-voice-ai-systems) — Vapi's approach to DTMF

### Twilio Documentation
- [Trusted Calling with SHAKEN/STIR](https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir) — caller attestation levels
- [Voice Integrity for Spam Remediation](https://www.twilio.com/docs/voice/spam-monitoring-with-voiceintegrity) — number reputation management
- [Outbound Calls Blocked as Spam](https://help.twilio.com/articles/9375068873499-Outbound-calls-blocked-or-labeled-as-spam-or-scam-likely) — troubleshooting spam labels
- [A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) — SMS registration requirements
- [SMS Message Filtering](https://support.twilio.com/hc/en-us/articles/360022449893-SMS-Message-Filtering-in-the-United-States-and-Canada) — carrier filtering behavior

### Legal/Regulatory
- [FCC TCPA AI Ruling](https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices) — AI calls classified under TCPA
- [AI-Powered Robocalls Guide 2025](https://www.kixie.com/sales-blog/ai-powered-robocalls-in-2025-a-guide-to-the-new-rules/) — compliance requirements summary
- [State Call Recording Compliance for AI](https://hostie.ai/resources/state-by-state-call-recording-compliance-ai-virtual-hosts-2025) — two-party consent states
- [AI in Customer Service Legal Tips](https://commlawgroup.com/2025/using-ai-in-customer-service-and-telemarketing-top-7-legal-tips/) — disclosure and consent best practices
- [5 Rules for AI Phone Agent Compliance](https://www.ringly.io/blog/is-your-ai-phone-agent-breaking-the-law-5-rules-you-need-to-know-2025) — practical compliance checklist

### BetterAuth Issues
- [Phone Number Plugin Docs](https://www.better-auth.com/docs/plugins/phone-number) — configuration and limitations
- [Security: phoneNumber modifiable via updateUser](https://github.com/better-auth/better-auth/issues/5597) — verification bypass bug
- [Allow better integration with SMS OTP providers](https://github.com/better-auth/better-auth/issues/4702) — Twilio Verify incompatibility
- [Questions on phone number verification](https://github.com/better-auth/better-auth/issues/4065) — edge cases in OTP flow

### Infrastructure
- [Vercel Function Timeouts](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) — timeout limits by plan
- [Vercel Function Limits](https://vercel.com/docs/functions/limitations) — constraints and workarounds
- [Neon Connection Pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer configuration
- [Neon Cold Start Latency](https://neon.com/docs/guides/benchmarking-latency) — scale-to-zero behavior
- [Pusher Channels Pricing](https://pusher.com/channels/pricing/) — tier limits
- [How to Stop Twilio Calls from Being Marked as Spam](https://www.agentvoice.com/how-to-stop-twilio-calls-from-being-marked-as-spam/) — spam mitigation strategies

### Competitive Analysis
- [Vapi Review: In-Depth Analysis 2026](https://softailed.com/blog/vapi-review) — platform limitations and known issues
- [Vapi AI Alternatives 2026](https://www.lindy.ai/blog/vapi-ai-alternatives) — why teams leave Vapi
- [GetHuman](https://gethuman.com/) — competitor callback reliability complaints
