# Roadmap: EasyCallAI

## Overview

EasyCallAI delivers an autonomous outbound phone call handler that navigates ISP phone trees, waits on hold, and connects users to live agents via warm transfer. The roadmap moves from user identity and ISP configuration, through telephony integration and real-time status, into the hard AI problems of IVR navigation and human detection, culminating in the transfer and bridging flow that completes the product loop.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - User auth via SMS OTP and ISP/issue selection UI
- [ ] **Phase 2: Outbound Calling & Live Status** - Place calls to ISPs via Vapi, wait on hold, show real-time status in browser
- [ ] **Phase 3: IVR Navigation & Human Detection** - AI navigates phone trees and detects when a live agent picks up
- [ ] **Phase 4: Transfer & Bridging** - Stall agent, callback user, conference everyone in, AI drops off

## Phase Details

### Phase 1: Foundation
**Goal**: Users can authenticate with their phone number and configure a call request by selecting their ISP and issue category
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, ISP-01, ISP-02
**Success Criteria** (what must be TRUE):
  1. User can sign up with their phone number and receive an SMS OTP to verify
  2. User can log in with their phone number via SMS OTP and remain logged in across browser sessions
  3. User can select an ISP from a branded list of major US providers (Comcast, AT&T, Spectrum, Verizon, Cox, CenturyLink)
  4. User can select an issue category (billing, technical support, cancellation, general inquiry) after choosing their ISP
  5. Database schema for users, ISPs, calls, and call events exists and is migrated
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Outbound Calling & Live Status
**Goal**: System can place outbound calls to ISPs via Vapi, survive extended hold times, and users see real-time call status in their browser
**Depends on**: Phase 1
**Requirements**: CALL-01, CALL-03, STATUS-01
**Success Criteria** (what must be TRUE):
  1. User can initiate a call to their selected ISP and the system places an outbound call via Vapi to the correct support number
  2. The call stays connected during extended hold periods (up to 45 minutes) without timing out or disconnecting
  3. User sees live call status updates in the browser (dialing, on hold, call ended) that reflect actual call state within seconds
  4. Vapi webhook events are received, processed, and persisted as call state transitions in the database
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: IVR Navigation & Human Detection
**Goal**: AI autonomously navigates ISP phone trees to reach the correct department queue and reliably detects when a live human agent picks up
**Depends on**: Phase 2
**Requirements**: CALL-02, CALL-04
**Success Criteria** (what must be TRUE):
  1. AI navigates ISP phone trees using DTMF tones and speech to reach the department matching the user's issue category
  2. AI distinguishes live human agents from IVR recordings, hold music, and automated hold interruptions with low false-positive rate
  3. ISP phone tree configurations are stored as data (not hardcoded) and can be updated without code changes
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Transfer & Bridging
**Goal**: When a live agent picks up, the AI stalls them, calls the user back, conferences everyone together, and drops off -- completing the full product loop
**Depends on**: Phase 3
**Requirements**: XFER-01, XFER-02, XFER-03, XFER-04
**Success Criteria** (what must be TRUE):
  1. AI engages the ISP agent in polite stalling conversation while the user is being called back
  2. User receives a callback on their phone and is conferenced into the live call with the ISP agent
  3. AI drops off the call once the user is successfully connected to the ISP agent
  4. If the user does not answer the callback, AI apologizes to the ISP agent and ends the call gracefully
  5. The full end-to-end flow works: user initiates call, AI navigates tree, waits on hold, detects agent, stalls, calls user back, conferences, drops off
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation | 0/3 | Not started | - |
| 2. Outbound Calling & Live Status | 0/3 | Not started | - |
| 3. IVR Navigation & Human Detection | 0/3 | Not started | - |
| 4. Transfer & Bridging | 0/3 | Not started | - |
