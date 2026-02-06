# Phase 2: Outbound Calling & Live Status - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Place outbound calls to ISPs via Vapi, survive extended hold times, and show real-time call status in the browser via Pusher. This phase covers call initiation, hold persistence, and live status display. IVR navigation, human detection, and transfer/bridging are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Call initiation flow
- No extra confirmation step — the confirmation page IS the final step, button immediately starts the call
- After hitting "Call Now", redirect to a dedicated `/call/[id]` status page
- Cancel available at all times during the call, with an "Are you sure?" confirmation prompt
- One call at a time — user must wait for current call to finish before starting another

### Live status display
- Minimal & calm visual style — clean page with subtle animation, not a busy dashboard
- Subtle timer in corner showing hold duration — visible but not anxiety-inducing
- Detailed status labels: Dialing → Ringing → Connected → Navigating Menu → On Hold → Agent Found → Complete
  - Note: "Navigating Menu" and "Agent Found" won't trigger until Phase 3 but the status model should define them now
- Progress visualization: Claude's Discretion (step indicators vs just the status label)

### Hold experience & resilience
- Call continues running on the server when user closes browser tab
- Auto-redirect to active call status page when user returns to the app with an active call
- No push notifications or SMS alerts for now — rely on in-app status page only
- Show a small "Reconnecting..." indicator when Pusher connection drops, silent reconnect in background

### Call lifecycle & endings
- Failed calls (busy signal, wrong number, Vapi error) show error message + "Try Again" button
- Hold timeout: Claude's Discretion (pick a reasonable maximum)
- When call ends, show a summary card: call result, duration, ISP, category — like a receipt
- No call history UI in Phase 2 — data is stored but history page deferred

### Claude's Discretion
- Progress visualization approach (step indicators vs status label only)
- Hold timeout duration
- Loading skeleton/animation design on status page
- Exact layout and spacing of the status page
- Error state details and messaging copy

</decisions>

<specifics>
## Specific Ideas

- Status page should feel calm enough to leave open for 30+ minutes — think meditation app waiting screen, not a busy control panel
- The call-ended summary card should feel like a receipt — concise, scannable
- Status labels should be granular enough to map to Vapi webhook events

</specifics>

<deferred>
## Deferred Ideas

- Push notifications / SMS alerts for call status changes — future enhancement
- Call history page — data stored in Phase 2, UI can come later
- Multiple simultaneous calls — not needed for MVP

</deferred>

---

*Phase: 02-outbound-calling-live-status*
*Context gathered: 2026-02-06*
