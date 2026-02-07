import {
  handleUserAnswered,
  handleUserNoAnswer,
  handleConferenceEnded,
} from "@/lib/transfer-orchestrator";

/**
 * Twilio conference status callback webhook.
 * Receives form-encoded data (NOT JSON) from Twilio when a conference
 * participant's status changes.
 *
 * statusCallback events for participants use CallStatus:
 * - "initiated" / "ringing": call is being placed to user
 * - "in-progress": user answered (participant connected)
 * - "completed": participant leg ended
 * - "no-answer" / "busy" / "failed" / "canceled": user did not answer
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const callStatus = formData.get("CallStatus") as string | null;
    const friendlyName = formData.get("FriendlyName") as string | null;

    // Derive our app's callId from the conference name (transfer-{callId})
    if (!friendlyName || !friendlyName.startsWith("transfer-")) {
      return new Response("OK", { status: 200 });
    }
    const callId = friendlyName.replace("transfer-", "");

    if (!callStatus) {
      return new Response("OK", { status: 200 });
    }

    switch (callStatus) {
      case "in-progress":
        // User answered the callback -- bridge the ISP call
        await handleUserAnswered(callId);
        break;

      case "no-answer":
      case "busy":
      case "failed":
      case "canceled":
        // User did not answer -- AI apologizes and hangs up
        await handleUserNoAnswer(callId);
        break;

      case "completed":
        // Participant leg ended -- conference may be over
        await handleConferenceEnded(callId);
        break;

      // "initiated" and "ringing" are informational -- no action needed
      default:
        break;
    }
  } catch (error) {
    console.error("Conference status webhook error:", error);
  }

  // Always return 200 to Twilio to prevent retries
  return new Response("OK", { status: 200 });
}
