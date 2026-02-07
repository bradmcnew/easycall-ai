import { eq } from "drizzle-orm";
import { db } from "@/db";
import { call, callEvent, user } from "@/db/schema";
import { pusherServer } from "@/lib/pusher-server";
import { callChannel } from "@/lib/call-channel";
import { getStallInstructions } from "@/lib/stall-prompt";

// Map Vapi status-update statuses to app call status enum
function mapVapiStatusToCallStatus(
  vapiStatus: string,
  endedReason?: string
): "pending" | "dialing" | "navigating" | "on_hold" | "completed" | "failed" {
  switch (vapiStatus) {
    case "queued":
      return "pending";
    case "ringing":
      return "dialing";
    case "in-progress":
      return "navigating"; // Phase 3: call starts with IVR navigation, not on_hold
    case "ended": {
      const failedReasons = [
        "customer-busy",
        "customer-did-not-answer",
        "twilio-failed-to-connect-call",
        "assistant-error",
      ];
      if (endedReason && failedReasons.includes(endedReason)) {
        return "failed";
      }
      return "completed";
    }
    default:
      return "pending";
  }
}

// Map Vapi status to call_event_type enum
function mapVapiStatusToEventType(
  vapiStatus: string
): "created" | "dialing" | "ivr_navigation" | "on_hold" | "completed" | "failed" {
  switch (vapiStatus) {
    case "queued":
      return "created";
    case "ringing":
      return "dialing";
    case "in-progress":
      return "ivr_navigation"; // Phase 3: call starts with IVR navigation
    case "ended":
      return "completed";
    default:
      return "created";
  }
}

// Determine if endedReason indicates failure
function isFailedEndedReason(endedReason: string): boolean {
  const failedReasons = [
    "customer-busy",
    "customer-did-not-answer",
    "twilio-failed-to-connect-call",
    "assistant-error",
  ];
  return failedReasons.includes(endedReason);
}

export async function POST(req: Request) {
  try {
    // Validate webhook secret
    const webhookSecret = req.headers.get("x-vapi-secret");
    if (webhookSecret !== process.env.VAPI_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { message } = body;

    if (!message || !message.type) {
      return new Response("OK", { status: 200 });
    }

    // Handle status-update messages
    if (message.type === "status-update") {
      const vapiCallId = message.call?.id as string | undefined;
      const vapiStatus = message.status as string | undefined;

      if (!vapiCallId || !vapiStatus) {
        return new Response("OK", { status: 200 });
      }

      // Look up call by vapiCallId
      const callRecord = await db.query.call.findFirst({
        where: eq(call.vapiCallId, vapiCallId),
      });
      if (!callRecord) {
        // Unknown call -- ignore (idempotent)
        return new Response("OK", { status: 200 });
      }

      const mappedStatus = mapVapiStatusToCallStatus(vapiStatus, message.endedReason);
      const eventType = mapVapiStatusToEventType(vapiStatus);

      // Insert call_event
      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType,
        metadata: JSON.stringify({
          vapiStatus,
          endedReason: message.endedReason ?? null,
          timestamp: message.timestamp ?? null,
        }),
      });

      // Build update fields
      const updateFields: Record<string, unknown> = {
        status: mappedStatus,
        updatedAt: new Date(),
      };

      // Set startedAt when call starts ringing/dialing
      if (vapiStatus === "ringing" && !callRecord.startedAt) {
        updateFields.startedAt = new Date();
      }

      // Set endedAt when call ends
      if (mappedStatus === "completed" || mappedStatus === "failed") {
        updateFields.endedAt = new Date();
        if (message.endedReason) {
          updateFields.endedReason = message.endedReason;
        }
      }

      // Update call record
      await db
        .update(call)
        .set(updateFields)
        .where(eq(call.id, callRecord.id));

      // Trigger Pusher event
      await pusherServer.trigger(callChannel(callRecord.id), "status-change", {
        status: mappedStatus,
        timestamp: new Date().toISOString(),
      });

      return new Response("OK", { status: 200 });
    }

    // Handle end-of-call-report messages
    if (message.type === "end-of-call-report") {
      const vapiCallId = message.call?.id as string | undefined;
      const endedReason = message.endedReason as string | undefined;

      if (!vapiCallId) {
        return new Response("OK", { status: 200 });
      }

      // Look up call by vapiCallId
      const callRecord = await db.query.call.findFirst({
        where: eq(call.vapiCallId, vapiCallId),
      });
      if (!callRecord) {
        return new Response("OK", { status: 200 });
      }

      // Warm transfer outcomes
      if (endedReason === "assistant-forwarded-call") {
        // Successful warm transfer -- user and ISP agent are connected
        await db.insert(callEvent).values({
          callId: callRecord.id,
          eventType: "user_connected",
          metadata: JSON.stringify({
            endedReason,
            source: "end-of-call-report",
          }),
        });

        await db
          .update(call)
          .set({
            status: "connected",
            updatedAt: new Date(),
          })
          .where(eq(call.id, callRecord.id));

        await pusherServer.trigger(callChannel(callRecord.id), "status-change", {
          status: "connected",
          timestamp: new Date().toISOString(),
        });

        return new Response("OK", { status: 200 });
      }

      if (endedReason?.includes("warm-transfer-assistant-cancelled")) {
        // Transfer assistant cancelled -- user didn't answer or transfer failed
        await db.insert(callEvent).values({
          callId: callRecord.id,
          eventType: "failed",
          metadata: JSON.stringify({
            endedReason,
            source: "end-of-call-report",
            reason: "transfer_cancelled",
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
          .where(eq(call.id, callRecord.id));

        await pusherServer.trigger(callChannel(callRecord.id), "status-change", {
          status: "failed",
          timestamp: new Date().toISOString(),
        });

        await pusherServer.trigger(callChannel(callRecord.id), "call-ended", {
          status: "failed",
          endedReason: "user-no-answer",
          endedAt: new Date().toISOString(),
        });

        return new Response("OK", { status: 200 });
      }

      const isFailed = endedReason ? isFailedEndedReason(endedReason) : false;
      const finalStatus = isFailed ? "failed" : "completed";
      const eventType = isFailed ? "failed" : "completed";

      // Insert call_event
      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType,
        metadata: JSON.stringify({
          endedReason: endedReason ?? null,
          source: "end-of-call-report",
        }),
      });

      // Update call record
      await db
        .update(call)
        .set({
          status: finalStatus,
          endedReason: endedReason ?? null,
          endedAt: callRecord.endedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(call.id, callRecord.id));

      // Trigger Pusher call-ended event
      await pusherServer.trigger(callChannel(callRecord.id), "call-ended", {
        status: finalStatus,
        endedReason: endedReason ?? null,
        endedAt: new Date().toISOString(),
      });

      return new Response("OK", { status: 200 });
    }

    // Handle hang message (Vapi asking if it should hang up)
    // Return empty response -- do not hang up (we want to stay on hold)
    if (message.type === "hang") {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle tool-calls messages (human_detected, navigation_status)
    if (message.type === "tool-calls") {
      const vapiCallId = message.call?.id as string | undefined;
      if (!vapiCallId) return new Response("OK", { status: 200 });

      const callRecord = await db.query.call.findFirst({
        where: eq(call.vapiCallId, vapiCallId),
      });
      if (!callRecord) return new Response("OK", { status: 200 });

      const results = [];
      for (const toolCall of message.toolCallList ?? []) {
        const funcName = toolCall.function?.name ?? toolCall.name;
        const params =
          typeof toolCall.function?.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function?.arguments ?? toolCall.parameters ?? {};

        if (funcName === "human_detected") {
          // Update call status to agent_detected
          await db
            .update(call)
            .set({ status: "agent_detected", updatedAt: new Date() })
            .where(eq(call.id, callRecord.id));

          await db.insert(callEvent).values({
            callId: callRecord.id,
            eventType: "agent_detected",
            metadata: JSON.stringify({
              confidence: params.confidence,
              agentGreeting: params.agentGreeting,
            }),
          });

          // Push prominent alert to browser
          await pusherServer.trigger(
            callChannel(callRecord.id),
            "status-change",
            {
              status: "agent_detected",
              timestamp: new Date().toISOString(),
            }
          );

          // Look up user's phone number and name for transfer callback
          const userRecord = await db.query.user.findFirst({
            where: eq(user.id, callRecord.userId),
            columns: { phoneNumber: true, name: true },
          });

          // Determine display name -- BetterAuth sets name to phone number
          // (which contains "@" if it's the temp email format)
          const userName =
            userRecord?.name && !userRecord.name.includes("@")
              ? userRecord.name
              : "the customer";

          // Get stall instructions for the AI (includes transferCall directive)
          const stallInstructions = getStallInstructions(userName);

          // Also set transferring status since AI will call transferCall next
          await db
            .update(call)
            .set({ status: "transferring", updatedAt: new Date() })
            .where(eq(call.id, callRecord.id));

          await db.insert(callEvent).values({
            callId: callRecord.id,
            eventType: "transfer_initiated",
            metadata: JSON.stringify({ method: "vapi-warm-transfer" }),
          });

          await pusherServer.trigger(
            callChannel(callRecord.id),
            "status-change",
            {
              status: "transferring",
              timestamp: new Date().toISOString(),
            }
          );

          results.push({
            toolCallId: toolCall.id,
            result: stallInstructions,
          });
        } else if (funcName === "navigation_status") {
          const navStatus = params.status;
          const detail = params.detail;

          // Map navigation status to call status
          const statusMap: Record<string, string> = {
            navigating: "navigating",
            reached_queue: "on_hold",
            on_hold: "on_hold",
            stuck: "navigating",
          };
          const newStatus = statusMap[navStatus] ?? "navigating";

          await db
            .update(call)
            .set({
              status: newStatus as typeof callRecord.status,
              updatedAt: new Date(),
            })
            .where(eq(call.id, callRecord.id));

          await db.insert(callEvent).values({
            callId: callRecord.id,
            eventType: "ivr_navigation",
            metadata: JSON.stringify({ status: navStatus, detail }),
          });

          await pusherServer.trigger(
            callChannel(callRecord.id),
            "status-change",
            {
              status: newStatus,
              detail,
              timestamp: new Date().toISOString(),
            }
          );

          results.push({
            toolCallId: toolCall.id,
            result: "Status update received.",
          });
        }
      }

      return Response.json({ results });
    }

    // Handle transcript messages (forward final transcripts to Pusher)
    if (message.type === "transcript") {
      const vapiCallId = message.call?.id as string | undefined;
      const transcriptType = message.transcriptType; // "partial" or "final"
      const role = message.role; // "user" (ISP side) or "assistant" (our AI)
      const text = message.transcript;

      // Only forward final transcripts to avoid flooding Pusher
      if (!vapiCallId || transcriptType !== "final") {
        return new Response("OK", { status: 200 });
      }

      const callRecord = await db.query.call.findFirst({
        where: eq(call.vapiCallId, vapiCallId),
      });
      if (!callRecord) return new Response("OK", { status: 200 });

      // Push transcript to browser (no DB storage -- transient display data)
      await pusherServer.trigger(callChannel(callRecord.id), "transcript", {
        role,
        text,
        timestamp: new Date().toISOString(),
      });

      return new Response("OK", { status: 200 });
    }

    // Unknown message types -- return 200 (Vapi retries on non-200)
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Vapi webhook error:", error);
    // Always return 200 to Vapi to prevent retries on server errors
    return new Response("OK", { status: 200 });
  }
}
