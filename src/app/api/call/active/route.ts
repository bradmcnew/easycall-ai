import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call } from "@/db/schema";

export async function GET() {
  try {
    // Authenticate
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the most recent active call (not completed, not failed)
    const activeCall = await db.query.call.findFirst({
      where: and(
        eq(call.userId, session.user.id),
        notInArray(call.status, ["completed", "failed"])
      ),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });

    if (activeCall) {
      return NextResponse.json({
        hasActiveCall: true,
        callId: activeCall.id,
      });
    }

    return NextResponse.json({ hasActiveCall: false });
  } catch (error) {
    console.error("Active call check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
