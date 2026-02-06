# Phase 3: IVR Navigation & Human Detection - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

AI autonomously navigates ISP phone trees using DTMF tones and speech to reach the correct department queue, then reliably detects when a live human agent picks up. Phone tree configurations are stored as data (not hardcoded). Account verification prompts are out of scope — the AI navigates to the queue, not through account gates.

</domain>

<decisions>
## Implementation Decisions

### Phone tree data model
- Full tree mapping for each ISP — map every known path, not just key routes
- Include timing data per menu step (expected delays, when to press/speak)
- When tree mapping is stale (ISP changed their menu), AI falls back to listening — interprets what it hears and attempts to navigate dynamically
- Manual admin updates as primary maintenance model — developer/admin edits tree data when notified of changes
- No automatic learning from failures in this phase

### Navigation strategy
- Prefer DTMF (button presses) over speech when both are available — more reliable, less chance of misinterpretation
- Execution approach (prompt-driven vs tool-call driven): Claude's discretion based on Vapi capabilities
- Stuck recovery strategy: Claude's discretion (press 0, restart, escalate — pick best approach)
- Account verification prompts (enter account number): not in scope for Phase 3 — AI skips/bypasses these

### Human detection
- Wait silently when uncertain — listen for the agent's greeting rather than proactively saying "Hello?"
- Ignore automated hold interruptions ("your call is important to us") — treat as noise, don't change behavior
- Once a human is detected, count as connected even if agent immediately re-holds ("let me transfer you") — proceed to Phase 4 transfer flow
- False positive rate tolerance: Claude's discretion — balance accuracy vs responsiveness

### Status updates during navigation
- Phase-level granularity — "Navigating phone tree", "Reached billing queue", "Waiting for agent" — not step-by-step menu details
- Collapsed transcript available — live text of what AI hears, hidden behind a "show details" toggle
- No queue position or estimated wait time shown — even if AI hears it, skip displaying (often inaccurate)
- Prominent alert when human detected — big visual change, color shift, animation, clear "Agent found!" message

### Claude's Discretion
- Navigation execution approach (prompt-driven vs tool-call)
- Stuck recovery strategy (press 0, restart from top, escalate to user)
- False positive rate for human detection (conservative vs moderate)
- Exact phone tree data schema design
- Transcript capture implementation details

</decisions>

<specifics>
## Specific Ideas

- Phone tree data stored as data, not code — already a roadmap requirement, reinforced here
- The "agent found" moment is the payoff for the user — UI should treat it as a celebration, not just another status update
- Hold interruptions are noise — the AI should be rock-solid about not reacting to "please continue to hold" messages

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ivr-navigation-human-detection*
*Context gathered: 2026-02-06*
