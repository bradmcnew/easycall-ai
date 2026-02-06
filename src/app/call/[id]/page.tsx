import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call, isp, issueCategory } from "@/db/schema";
import { CallStatusClient } from "./call-status-client";

interface CallPageProps {
  params: Promise<{ id: string }>;
}

export default async function CallPage({ params }: CallPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const { id } = await params;

  const [result] = await db
    .select({
      callId: call.id,
      callStatus: call.status,
      callUserId: call.userId,
      userNote: call.userNote,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      endedReason: call.endedReason,
      ispName: isp.name,
      ispLogoUrl: isp.logoUrl,
      ispSlug: isp.slug,
      categoryLabel: issueCategory.label,
      categorySlug: issueCategory.slug,
    })
    .from(call)
    .innerJoin(isp, eq(call.ispId, isp.id))
    .innerJoin(issueCategory, eq(call.issueCategoryId, issueCategory.id))
    .where(eq(call.id, id))
    .limit(1);

  if (!result || result.callUserId !== session.user.id) {
    redirect("/select-isp");
  }

  return (
    <CallStatusClient
      callId={result.callId}
      initialStatus={result.callStatus}
      ispName={result.ispName}
      ispLogoUrl={result.ispLogoUrl}
      categoryLabel={result.categoryLabel}
      userNote={result.userNote}
      startedAt={result.startedAt?.toISOString() ?? null}
      endedAt={result.endedAt?.toISOString() ?? null}
      endedReason={result.endedReason}
      ispSlug={result.ispSlug}
      categorySlug={result.categorySlug}
    />
  );
}
