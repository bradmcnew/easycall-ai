# Requirements — EasyCallAI

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign up with phone number via SMS OTP verification
- [ ] **AUTH-02**: User can log in with phone number via SMS OTP verification
- [ ] **AUTH-03**: User session persists across browser sessions (stay logged in)

### ISP Selection

- [ ] **ISP-01**: User can select their ISP from a pre-configured list of major US providers (Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink) with logos
- [ ] **ISP-02**: User can select their issue category (billing, technical support, cancellation, general inquiry) to guide phone tree navigation

### Call Handling

- [ ] **CALL-01**: System places outbound call to selected ISP's customer service number via Vapi AI
- [ ] **CALL-02**: AI navigates ISP phone tree using DTMF tones and speech based on selected issue category
- [ ] **CALL-03**: AI waits on hold with extended silence timeout (up to 1 hour) without disconnecting
- [ ] **CALL-04**: AI detects when a live human agent picks up (via speech detection, distinguishing from recordings/hold interruptions)

### Transfer & Bridging

- [ ] **XFER-01**: AI stalls the ISP agent politely ("one moment please") while user is being called
- [ ] **XFER-02**: System triggers warm transfer callback to user's phone and conferences them into the live call
- [ ] **XFER-03**: AI drops off the call once user is successfully connected to the ISP agent
- [ ] **XFER-04**: If user doesn't answer callback, AI apologizes to ISP agent and ends the call

### Real-Time Status

- [ ] **STATUS-01**: User sees live call status in browser (dialing, navigating menu, on hold, agent detected, connecting you, connected, call ended)

---

## v2 Requirements (Deferred)

- Phone number management (add/update numbers)
- Custom ISP / phone number entry
- Estimated wait time indicator
- Call history with past calls
- SMS status updates as backup notification
- AI copilot mode (stays on call to coach user)
- AI briefs agent on user's issue before handoff
- Hold time prediction based on ISP/time patterns

---

## Out of Scope

- Non-ISP companies — ISP-focused for MVP
- Mobile native app — web-first
- Pay-per-call / billing — free MVP
- Multi-attempt callback retry — single attempt, then hang up
- Call recording playback — may store for debugging but not user-facing

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| AUTH-01 | — | — | pending |
| AUTH-02 | — | — | pending |
| AUTH-03 | — | — | pending |
| ISP-01 | — | — | pending |
| ISP-02 | — | — | pending |
| CALL-01 | — | — | pending |
| CALL-02 | — | — | pending |
| CALL-03 | — | — | pending |
| CALL-04 | — | — | pending |
| XFER-01 | — | — | pending |
| XFER-02 | — | — | pending |
| XFER-03 | — | — | pending |
| XFER-04 | — | — | pending |
| STATUS-01 | — | — | pending |

---
*Last updated: 2026-02-06 after requirements definition*
