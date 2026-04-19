import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { call, isp, issueCategory } from "@/db/schema";
import { ISP_LOGOS } from "@/data/isps";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const calls = await db
    .select({
      id: call.id,
      status: call.status,
      endedReason: call.endedReason,
      userNote: call.userNote,
      createdAt: call.createdAt,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      ispName: isp.name,
      ispSlug: isp.slug,
      ispLogoUrl: isp.logoUrl,
      categoryLabel: issueCategory.label,
      categorySlug: issueCategory.slug,
    })
    .from(call)
    .innerJoin(isp, eq(call.ispId, isp.id))
    .innerJoin(issueCategory, eq(call.issueCategoryId, issueCategory.id))
    .where(eq(call.userId, session.user.id))
    .orderBy(desc(call.createdAt));

  return (
    <HistoryClient
      calls={calls.map((c) => ({
        ...c,
        ispLogoUrl: ISP_LOGOS[c.ispSlug] ?? c.ispLogoUrl,
        createdAt: c.createdAt.toISOString(),
        startedAt: c.startedAt?.toISOString() ?? null,
        endedAt: c.endedAt?.toISOString() ?? null,
      }))}
    />
  );
}
