/**
 * Returns stall instructions for the AI to use when a human agent is detected.
 * These instructions are injected into the tool-call response when human_detected fires.
 *
 * With Vapi warm transfer, the AI must call the transferCall tool itself to
 * initiate the transfer. The transfer assistant and fallbackPlan handle
 * timeout and failure cases automatically.
 */
export function getStallInstructions(_userName: string): string {
  return `Human agent detected. You must do two things in order:

STEP 1 - Say this NOW:
"One second please."

STEP 2 - IMMEDIATELY call the transferCall tool.
Do not wait. Do not ask questions. Call transferCall right after speaking.

If the agent says anything before the transfer initiates, respond briefly:
"One moment please."

Do NOT provide any personal information, account numbers, or identifying details.`;
}
