# EasyCallAI

## What This Is

An autonomous outbound phone call handler for ISP customers. Users pick their ISP, describe their issue, and an AI agent calls the ISP on their behalf — navigating the phone tree, waiting on hold, and calling the user back when a human agent picks up so they can skip straight to the conversation.

## Core Value

Users never sit on hold again. The AI handles the wait and gets them connected to a human agent ready to help.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can sign up and log in via SMS verification (BetterAuth)
- [ ] User can select their ISP from a list of major US providers
- [ ] User can describe their issue (categorized for phone tree navigation)
- [ ] AI calls the ISP and navigates the phone tree based on issue category
- [ ] AI waits on hold and detects when a human agent picks up
- [ ] AI stalls the agent politely while calling the user back
- [ ] User receives a callback and is conferenced into the live call
- [ ] AI drops off the call once the user joins
- [ ] If user doesn't answer the callback, AI apologizes to agent and hangs up
- [ ] User sees real-time status of the call (dialing, navigating, on hold, agent picked up, etc.)
- [ ] Call history is stored and viewable by the user

### Out of Scope

- AI copilot mode (staying on the call to coach the user) — complexity, defer to v2
- AI briefing the agent on the issue before user joins — defer to v2
- Pay-per-call / billing — MVP is free, monetization later
- Non-ISP companies — ISP-focused for MVP
- Mobile native app — web-first
- OAuth / social login — SMS auth only for MVP
- Retry callback if user doesn't answer — single attempt, then hang up

## Context

- **Telephony:** Vapi AI handles all voice/call infrastructure. Has built-in IVR navigation, outbound calling, DTMF keypad, and call transfer capabilities. Hold detection and mid-call conferencing will need creative solutions using Vapi's primitives.
- **Target ISPs:** Major US providers — Comcast/Xfinity, AT&T, Spectrum, Verizon, Cox, CenturyLink/Lumen. Phone trees will need to be mapped or navigated generically via AI.
- **Key technical challenge:** Detecting when hold music ends and a live human agent picks up. Vapi has voicemail detection but hold-to-human transition detection may require custom logic (silence detection, speech detection, or Vapi's built-in capabilities).
- **Key technical challenge:** Conferencing — adding the user to an existing call. Vapi supports warm transfers and dynamic call transfers. The likely approach is: AI is on call with ISP → detects human → initiates outbound call to user → bridges/transfers to create a three-way, then AI drops.
- **School project context:** This is a school project ("easycallai" in school directory).

## Constraints

- **Tech stack**: Next.js (TypeScript starter template) + Tailwind CSS + Drizzle ORM + PostgreSQL — already decided
- **Auth**: BetterAuth with SMS verification — user's phone number doubles as callback number
- **Telephony**: Vapi AI — all voice capabilities go through their API
- **Hosting**: Vercel — natural fit for Next.js
- **Cost**: Free for MVP — Vapi per-minute costs absorbed during testing
- **ISP scope**: Major US ISPs only (~6-8 providers) — not arbitrary phone numbers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SMS auth via BetterAuth | Need user's phone number for callback anyway; simplifies auth flow | — Pending |
| Vapi AI for telephony | Built-in IVR navigation, outbound calls, transfers — avoids building from scratch | — Pending |
| AI drops off after user joins | Simplifies MVP — no need for copilot/coaching logic | — Pending |
| Stall only (no issue briefing) | Reduces complexity — AI just keeps agent on line until user joins | — Pending |
| Single callback attempt | If user misses it, call ends — avoids retry complexity | — Pending |
| Navigation-only issue description | Issue text only used to pick correct phone tree path, not for deep understanding | — Pending |

---
*Last updated: 2026-02-06 after initialization*
