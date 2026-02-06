import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { eq, and, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call, callEvent, isp, issueCategory, ispPhoneTree } from "@/db/schema";
import { vapiClient } from "@/lib/vapi";
import { buildNavigationPrompt } from "@/lib/prompt-builder";

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

    // Look up phone tree for ISP (optional -- dynamic fallback if none)
    const phoneTreeRecord = await db.query.ispPhoneTree.findFirst({
      where: eq(ispPhoneTree.ispId, ispId),
    });

    // Build navigation prompt
    const systemPrompt = phoneTreeRecord
      ? buildNavigationPrompt(
          ispRecord.name,
          categoryRecord.label,
          categoryRecord.slug,
          phoneTreeRecord.tree
        )
      : `You are an AI assistant calling ${ispRecord.name} customer support. Navigate the phone tree dynamically to reach the ${categoryRecord.label} department queue, then wait on hold for a live human agent.\n\nLISTEN to each menu prompt fully before pressing any keys. PREFER pressing keys (DTMF) over speaking. If unsure, press 0 to try reaching an operator. If asked for an account number, say "I don't have my account number available." Do NOT provide any personal information.\n\nOnce in the hold queue, WAIT SILENTLY. When a LIVE HUMAN AGENT answers (not a recording), call the human_detected tool. Be CONSERVATIVE -- wait for personal introductions or direct questions before signaling.\n\nCall navigation_status when entering a new menu level or reaching the hold queue.`;

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
                content: systemPrompt,
              },
            ],
          },
          voice: { provider: "vapi", voiceId: "Elliot" },
          transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
          firstMessage: " ",
          firstMessageMode: "assistant-speaks-first",
          // silenceTimeoutSeconds is accepted by the API but not typed in SDK v0.11
          ...({ silenceTimeoutSeconds: 3600 } as Record<string, unknown>),
          // Wait 1.5s before speaking to avoid interrupting IVR menus
          ...({ startSpeakingPlan: { waitSeconds: 1.5 } } as Record<string, unknown>),
          maxDurationSeconds: 2700,
          serverMessages: ["status-update", "end-of-call-report", "hang", "tool-calls", "transcript"],
          server: {
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi`,
            timeoutSeconds: 20,
            headers: {
              "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET!,
            },
          },
          // tools is accepted by the API but not typed in SDK v0.11 CreateAssistantDto
          ...({
            tools: [
              { type: "dtmf" },
              {
                type: "function",
                async: true,
                function: {
                  name: "human_detected",
                  description:
                    "Call this ONLY when you are confident a live human agent has answered. Do NOT call for automated messages, hold music interruptions, or IVR prompts.",
                  parameters: {
                    type: "object",
                    properties: {
                      confidence: {
                        type: "string",
                        enum: ["high", "medium"],
                        description:
                          "Your confidence level that this is a live human",
                      },
                      agentGreeting: {
                        type: "string",
                        description:
                          "What the agent said that indicated they are human",
                      },
                    },
                    required: ["confidence"],
                  },
                },
              },
              {
                type: "function",
                async: true,
                function: {
                  name: "navigation_status",
                  description:
                    "Report your current navigation status. Call when you enter a new menu level or reach a hold queue.",
                  parameters: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["navigating", "reached_queue", "on_hold", "stuck"],
                      },
                      detail: {
                        type: "string",
                        description:
                          "Brief description (e.g., 'Selected billing option', 'Entered hold queue')",
                      },
                    },
                    required: ["status"],
                  },
                },
              },
            ],
          } as Record<string, unknown>),
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
