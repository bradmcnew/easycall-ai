import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call } from "@/db/schema";
import { pusherServer } from "@/lib/pusher-server";

export async function POST(req: Request) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Parse form-encoded body (Pusher client sends socket_id and channel_name as form data)
    const formData = await req.formData();
    const socketId = formData.get("socket_id") as string | null;
    const channelName = formData.get("channel_name") as string | null;

    if (!socketId || !channelName) {
      return NextResponse.json(
        { error: "Missing socket_id or channel_name" },
        { status: 400 }
      );
    }

    // Extract callId from channel name (strip "private-call-" prefix)
    const prefix = "private-call-";
    if (!channelName.startsWith(prefix)) {
      return NextResponse.json(
        { error: "Invalid channel name" },
        { status: 403 }
      );
    }
    const callId = channelName.slice(prefix.length);

    // Verify the user owns this call
    const callRecord = await db.query.call.findFirst({
      where: and(eq(call.id, callId), eq(call.userId, session.user.id)),
    });
    if (!callRecord) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Authorize the Pusher channel subscription
    const authResponse = pusherServer.authorizeChannel(socketId, channelName);
    return NextResponse.json(authResponse);
  } catch (error) {
    console.error("Pusher auth error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
