# Phase 1: Foundation - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

User authentication via SMS OTP and ISP/issue selection UI. Users can sign up and log in with their phone number, select their ISP from a fixed list of major US providers, and choose an issue category. Database schema for users, ISPs, calls, and call events. No call placement, no real-time status — those are Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Auth flow
- Single phone number input — system detects new vs returning user automatically (no separate sign up / log in)
- After OTP verification, user goes straight to ISP selection — no welcome screen or dashboard
- Toast notifications (shadcn toast) for OTP errors (wrong code, delivery failure, expired code)
- Persistent sessions — user stays logged in until explicit logout, survives browser restarts

### UI framework
- shadcn components for all UI throughout the app
- Use the frontend-design skill for all frontend implementation work

### ISP selection
- 6 ISPs: Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink
- Name and logo only — no subtitles, hold times, or extra metadata
- Browse only — no search bar (6 items doesn't warrant it)
- Only supported ISPs shown — no "my ISP isn't listed" fallback

### Issue category picker
- Categories are per-ISP, not universal — each ISP defines its own available categories based on their phone tree
- Optional free-text note field after category selection — user can describe their issue briefly
- Issue category presentation and confirmation step: Claude's discretion

### Page flow
- Step indicator showing progress through the flow (e.g., step dots)
- Page structure (single page vs separate routes), back navigation behavior, and visual direction: Claude's discretion

### Claude's Discretion
- ISP selection layout (grid cards vs list vs other)
- Issue category presentation style (buttons vs cards with descriptions)
- Confirmation step after selections (review screen vs direct)
- Page structure (single page transitions vs separate routes)
- Back navigation behavior
- Visual design direction (minimal, warm, bold, etc.)

</decisions>

<specifics>
## Specific Ideas

- "Use shadcn components for all the UI"
- "Use the frontend-design skill whenever working on the frontend"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-06*
