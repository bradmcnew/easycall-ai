import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call, callEvent } from "@/db/schema";
import { vapiClient } from "@/lib/vapi";
import { pusherServer } from "@/lib/pusher-server";
import { callChannel } from "@/lib/call-channel";

const cancelCallSchema = z.object({
  callId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    // Authenticate
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = cancelCallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { callId } = parsed.data;

    // Look up call owned by this user
    const callRecord = await db.query.call.findFirst({
      where: and(eq(call.id, callId), eq(call.userId, session.user.id)),
    });
    if (!callRecord) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Cannot cancel already completed or failed calls
    if (callRecord.status === "completed" || callRecord.status === "failed") {
      return NextResponse.json(
        { error: "Call has already ended" },
        { status: 400 }
      );
    }

    // Cancel via Vapi -- try controlUrl first, fall back to SDK delete
    try {
      if (callRecord.vapiControlUrl) {
        await fetch(callRecord.vapiControlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "end-call" }),
        });
      } else if (callRecord.vapiCallId) {
        await vapiClient.calls.delete({ id: callRecord.vapiCallId });
      }
    } catch (vapiError) {
      // Vapi may have already ended the call -- continue with local cleanup
      console.warn("Vapi cancel attempt:", vapiError);
    }

    // Update call record
    await db
      .update(call)
      .set({
        status: "completed",
        endedReason: "manually-canceled",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(call.id, callId));

    // Insert call_event
    await db.insert(callEvent).values({
      callId,
      eventType: "completed",
      metadata: JSON.stringify({ reason: "user-cancelled" }),
    });

    // Trigger Pusher call-ended event
    await pusherServer.trigger(callChannel(callId), "call-ended", {
      status: "completed",
      endedReason: "manually-canceled",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Call cancel error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
