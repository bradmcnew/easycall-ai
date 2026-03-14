# Phase 4: Transfer & Bridging - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

When a live ISP agent picks up, the AI stalls them, calls the user back via Twilio, conferences everyone together, and the AI drops off -- completing the full product loop. This phase covers stalling, callback, conferencing, drop-off, and failure handling.

</domain>

<decisions>
## Implementation Decisions

### Stalling behavior
- AI identifies as an assistant calling on behalf of the user (transparent, not impersonating the customer)
- Tone: polite, competent, minimal -- no fumbling or chatty filler
- Stalling tactics and duration are at Claude's discretion (see below)

### Callback mechanism
- Callback via Twilio phone call to the user's phone number on file
- One attempt only -- if user doesn't answer, move to failure handling (no retries)
- User hears nothing when they pick up -- immediate bridge into the conference with the ISP agent (no AI greeting)

### AI drop-off
- Silent drop -- AI disconnects its leg without saying anything
- Drop happens immediately when the user's call leg connects to the conference (no delay, no waiting for user to speak)
- System monitors the conference after AI drops off -- detects when user/agent hang up, records call duration, updates status to completed

### Failure: user doesn't answer callback
- AI apologizes to the ISP agent and hangs up ("I'm sorry, they're unavailable right now. We'll call back later. Thank you!")
- Call status updated in UI

### Failure: ISP agent hangs up during stall
- UI notifies user that the agent hung up and the call ended
- No automatic redial -- user can retry manually

### Failure: conference/bridge technical failure
- Fail immediately and notify user in UI (no retries)
- Show error summary: what happened (agent found but bridge failed, user didn't answer, etc.) with option to start over

### Frontend
- All frontend UI work must use the `frontend-design` skill
- UI updates during callback/bridge process are at Claude's discretion

### Claude's Discretion
- Stalling script content and conversation tactics
- Maximum stall duration before giving up
- UI state transitions during the callback/bridge flow (how granular the status updates are)
- Post-handoff UI design (connected state, call timer, etc.)
- Loading/transition animations

</decisions>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-transfer-bridging*
*Context gathered: 2026-02-06*
