import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { eq, and, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call, callEvent, isp, issueCategory } from "@/db/schema";
import { vapiClient } from "@/lib/vapi";

const startCallSchema = z.object({
  ispId: z.string().uuid(),
  issueCategoryId: z.string().uuid(),
  userNote: z.string().optional(),
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
    const parsed = startCallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { ispId, issueCategoryId, userNote } = parsed.data;

    // Check for existing active call
    const existingCall = await db.query.call.findFirst({
      where: and(
        eq(call.userId, session.user.id),
        notInArray(call.status, ["completed", "failed"])
      ),
    });
    if (existingCall) {
      return NextResponse.json(
        { error: "You already have an active call", callId: existingCall.id },
        { status: 409 }
      );
    }

    // Look up ISP
    const ispRecord = await db.query.isp.findFirst({
      where: eq(isp.id, ispId),
    });
    if (!ispRecord) {
      return NextResponse.json(
        { error: "ISP not found" },
        { status: 404 }
      );
    }
    if (!ispRecord.supportPhone) {
      return NextResponse.json(
        { error: "ISP has no support phone number configured" },
        { status: 400 }
      );
    }

    // Look up issue category
    const categoryRecord = await db.query.issueCategory.findFirst({
      where: and(
        eq(issueCategory.id, issueCategoryId),
        eq(issueCategory.ispId, ispId)
      ),
    });
    if (!categoryRecord) {
      return NextResponse.json(
        { error: "Issue category not found" },
        { status: 404 }
      );
    }

    // Create call record BEFORE calling Vapi (prevents webhook race condition)
    const [callRecord] = await db
      .insert(call)
      .values({
        userId: session.user.id,
        ispId,
        issueCategoryId,
        userNote: userNote ?? null,
        status: "pending",
      })
      .returning();

    // Call Vapi to create outbound call with transient assistant
    try {
      const vapiCall = await vapiClient.calls.create({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
        customer: { number: ispRecord.supportPhone },
        assistant: {
          name: `EasyCallAI - ${ispRecord.name}`,
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are an AI assistant calling ${ispRecord.name} customer support. Your job is to wait on hold patiently. When asked questions by the automated system, say you need to speak with a representative. Do not provide any personal information. If asked for an account number or details, say "I'll provide that when I speak with a representative." Be polite and patient. The user's issue category is: ${categoryRecord.label}.`,
              },
            ],
          },
          voice: { provider: "vapi", voiceId: "Elliot" },
          transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
          firstMessage: "Hello",
          firstMessageMode: "assistant-speaks-first",
          // silenceTimeoutSeconds is accepted by the API but not typed in SDK v0.11
          ...({ silenceTimeoutSeconds: 3600 } as Record<string, unknown>),
          maxDurationSeconds: 2700,
          serverMessages: ["status-update", "end-of-call-report", "hang"],
          server: {
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi`,
            timeoutSeconds: 20,
            headers: {
              "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET!,
            },
          },
        },
      });

      // Narrow response type -- single call returns Call, batch returns CallBatchResponse
      if (!("id" in vapiCall)) {
        throw new Error("Unexpected batch response from Vapi");
      }

      // Update call record with Vapi call ID and control URL
      const controlUrl = vapiCall.monitor?.controlUrl ?? null;

      await db
        .update(call)
        .set({
          vapiCallId: vapiCall.id,
          vapiControlUrl: controlUrl,
          updatedAt: new Date(),
        })
        .where(eq(call.id, callRecord.id));

      // Insert "created" call event
      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType: "created",
        metadata: JSON.stringify({ vapiCallId: vapiCall.id }),
      });

      return NextResponse.json({ callId: callRecord.id }, { status: 201 });
    } catch (vapiError) {
      // Vapi call creation failed -- mark call as failed
      await db
        .update(call)
        .set({
          status: "failed",
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(call.id, callRecord.id));

      await db.insert(callEvent).values({
        callId: callRecord.id,
        eventType: "failed",
        metadata: JSON.stringify({
          error: vapiError instanceof Error ? vapiError.message : "Unknown Vapi error",
        }),
      });

      console.error("Vapi call creation failed:", vapiError);
      return NextResponse.json(
        { error: "Failed to place call. Please try again." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Call start error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
