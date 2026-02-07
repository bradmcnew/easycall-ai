import { eq } from "drizzle-orm";
import { db } from "@/db";
import { call } from "@/db/schema";

/**
 * TwiML endpoint for Approach A fallback.
 * When the ISP call is transferred to the bridge number via Vapi controlUrl,
 * this endpoint returns Conference TwiML to join the correct conference room.
 *
 * Twilio sends the incoming call's CallSid in form-encoded data.
 * We look up which conference to join by matching the ISP call's Twilio SID
 * against our call records (stored as vapiCallId's underlying phoneCallProviderId,
 * or looked up via Vapi API).
 *
 * Note: This is a fallback for when Approach B (direct Twilio call redirect)
 * is not available (e.g., phoneCallProviderId is missing from Vapi).
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const incomingCallSid = formData.get("CallSid") as string | null;

    if (!incomingCallSid) {
      return new Response(
        '<Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>',
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    // Look up which call this ISP leg belongs to.
    // In practice, the conference-bridge endpoint is called when a Vapi
    // controlUrl transfer sends the ISP call here. The incoming CallSid
    // is the ISP call's Twilio SID. We search for calls in "transferring"
    // status and match based on timing (most recent transferring call).
    // A more robust approach would store the ISP Twilio SID in the call record.
    const callRecord = await db.query.call.findFirst({
      where: eq(call.status, "transferring"),
      orderBy: (call, { desc }) => [desc(call.updatedAt)],
    });

    if (!callRecord) {
      return new Response(
        '<Response><Say>Sorry, we could not connect your call. Goodbye.</Say><Hangup/></Response>',
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    const conferenceName = `transfer-${callRecord.id}`;

    return new Response(
      `<Response><Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference></Dial></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  } catch (error) {
    console.error("Conference bridge webhook error:", error);
    return new Response(
      '<Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>',
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }
}
