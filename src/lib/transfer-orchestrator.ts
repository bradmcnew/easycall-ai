import { eq } from "drizzle-orm";
import { db } from "@/db";
import { call, callEvent } from "@/db/schema";
import { twilioClient } from "@/lib/twilio-client";
import { vapiClient } from "@/lib/vapi";
import { pusherServer } from "@/lib/pusher-server";
import { callChannel } from "@/lib/call-channel";

interface TransferParams {
  callId: string;
  vapiCallId: string;
  vapiControlUrl: string;
  userPhone: string;
}

/**
 * Orchestrate the transfer sequence. Called asynchronously (fire-and-forget)
 * from the human_detected webhook handler.
 *
 * 1. Update status to transferring
 * 2. Call the user via Twilio Conference Participant API
 * 3. Wait for user to answer (monitored via conference-status webhook)
 * 4. On answer: redirect ISP call into conference, drop AI
 * 5. On no-answer: AI apologizes and hangs up
 */
export async function orchestrateTransfer(params: TransferParams): Promise<void> {
  const { callId, vapiCallId, vapiControlUrl, userPhone } = params;
  const conferenceName = `transfer-${callId}`;

  try {
    // Update status to transferring
    await db
      .update(call)
      .set({ status: "transferring", updatedAt: new Date() })
      .where(eq(call.id, callId));

    await db.insert(callEvent).values({
      callId,
      eventType: "transfer_initiated",
      metadata: JSON.stringify({ conferenceName, userPhone }),
    });

    await pusherServer.trigger(callChannel(callId), "status-change", {
      status: "transferring",
      timestamp: new Date().toISOString(),
    });

    // Call the user and place them in a Twilio conference
    const participant = await twilioClient
      .conferences(conferenceName)
      .participants.create({
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: userPhone,
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
        beep: "false",
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/conference-status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      });

    // Log the user callback attempt
    await db.insert(callEvent).values({
      callId,
      eventType: "user_callback",
      metadata: JSON.stringify({
        participantCallSid: participant.callSid,
        conferenceSid: participant.conferenceSid,
      }),
    });
  } catch (error) {
    console.error("Transfer orchestration failed:", error);
    await handleTransferFailure(callId, vapiControlUrl, "bridge_failed");
  }
}

/**
 * Called by conference-status webhook when the user answers the callback.
 * Redirects the ISP call into the conference and drops the AI leg.
 */
export async function handleUserAnswered(callId: string): Promise<void> {
  const callRecord = await db.query.call.findFirst({
    where: eq(call.id, callId),
  });
  if (!callRecord?.vapiCallId || !callRecord.vapiControlUrl) return;

  try {
    // Log user connected event
    await db.insert(callEvent).values({
      callId,
      eventType: "user_connected",
    });

    // Approach B (primary): Get the Twilio CallSid for the ISP call and
    // redirect it directly into the conference via TwiML update
    const vapiCall = await vapiClient.calls.get({ id: callRecord.vapiCallId });
    const twilioCallSid = vapiCall.phoneCallProviderId;
    const conferenceName = `transfer-${callId}`;

    if (twilioCallSid) {
      // Redirect ISP call into the conference
      await twilioClient.calls(twilioCallSid).update({
        twiml: `<Response><Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference></Dial></Response>`,
      });
    } else {
      // Approach A (fallback): Transfer via Vapi controlUrl to bridge number
      const bridgeNumber = process.env.TWILIO_CONFERENCE_BRIDGE_NUMBER;
      if (bridgeNumber) {
        await fetch(callRecord.vapiControlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "transfer",
            destination: {
              type: "number",
              number: bridgeNumber,
            },
          }),
        });
      } else {
        throw new Error(
          "Cannot redirect ISP call: no phoneCallProviderId and no bridge number configured"
        );
      }
    }

    // Drop the AI leg (silent -- no goodbye message)
    await fetch(callRecord.vapiControlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "end-call" }),
    });

    await db.insert(callEvent).values({
      callId,
      eventType: "ai_dropped",
    });

    // Update status to connected
    await db
      .update(call)
      .set({ status: "connected", updatedAt: new Date() })
      .where(eq(call.id, callId));

    await pusherServer.trigger(callChannel(callId), "status-change", {
      status: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("handleUserAnswered failed:", error);
    await handleTransferFailure(
      callId,
      callRecord.vapiControlUrl,
      "bridge_failed"
    );
  }
}

/**
 * Called by conference-status webhook when the user does not answer
 * (no-answer, busy, failed, canceled).
 * AI apologizes to the ISP agent and hangs up.
 */
export async function handleUserNoAnswer(callId: string): Promise<void> {
  const callRecord = await db.query.call.findFirst({
    where: eq(call.id, callId),
  });
  if (!callRecord?.vapiControlUrl) return;

  // Tell AI to apologize and end the call
  await fetch(callRecord.vapiControlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "say",
      content:
        "I'm sorry, they're unavailable right now. We'll call back later. Thank you!",
      endCallAfterSpoken: true,
    }),
  });

  await db
    .update(call)
    .set({
      status: "failed",
      endedReason: "user-no-answer",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(call.id, callId));

  await db.insert(callEvent).values({
    callId,
    eventType: "failed",
    metadata: JSON.stringify({ reason: "user_no_answer" }),
  });

  await pusherServer.trigger(callChannel(callId), "status-change", {
    status: "failed",
    timestamp: new Date().toISOString(),
  });

  await pusherServer.trigger(callChannel(callId), "call-ended", {
    status: "failed",
    endedReason: "user-no-answer",
    endedAt: new Date().toISOString(),
  });
}

/**
 * Called by conference-status webhook when the conference ends
 * (user or agent hung up).
 */
export async function handleConferenceEnded(callId: string): Promise<void> {
  const callRecord = await db.query.call.findFirst({
    where: eq(call.id, callId),
  });
  if (!callRecord) return;

  // Only mark completed if currently connected (avoid overwriting failed status)
  if (callRecord.status !== "connected") return;

  await db
    .update(call)
    .set({
      status: "completed",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(call.id, callId));

  await db.insert(callEvent).values({
    callId,
    eventType: "completed",
    metadata: JSON.stringify({ source: "conference_ended" }),
  });

  await pusherServer.trigger(callChannel(callId), "call-ended", {
    status: "completed",
    endedAt: new Date().toISOString(),
  });
}

/**
 * Generic transfer failure handler. AI apologizes and ends the call.
 */
export async function handleTransferFailure(
  callId: string,
  controlUrl: string,
  reason: string
): Promise<void> {
  try {
    await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "say",
        content:
          "I'm sorry, we're experiencing a technical issue. We'll call back shortly. Thank you for your patience.",
        endCallAfterSpoken: true,
      }),
    });
  } catch {
    // Best effort -- controlUrl may be unavailable
  }

  await db
    .update(call)
    .set({
      status: "failed",
      endedReason: reason,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(call.id, callId));

  await db.insert(callEvent).values({
    callId,
    eventType: "failed",
    metadata: JSON.stringify({ reason }),
  });

  await pusherServer.trigger(callChannel(callId), "status-change", {
    status: "failed",
    timestamp: new Date().toISOString(),
  });

  await pusherServer.trigger(callChannel(callId), "call-ended", {
    status: "failed",
    endedReason: reason,
    endedAt: new Date().toISOString(),
  });
}
