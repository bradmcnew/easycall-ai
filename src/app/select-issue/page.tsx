import Image from "next/image";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { isp, issueCategory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SelectIssueForm } from "./select-issue-form";

interface SelectIssuePageProps {
  searchParams: Promise<{ isp?: string }>;
}

export default async function SelectIssuePage({ searchParams }: SelectIssuePageProps) {
  const params = await searchParams;
  const ispSlug = params.isp;

  if (!ispSlug) {
    redirect("/select-isp");
  }

  const ispRecord = await db.query.isp.findFirst({
    where: eq(isp.slug, ispSlug),
  });

  if (!ispRecord) {
    redirect("/select-isp");
  }

  const categories = await db
    .select()
    .from(issueCategory)
    .where(eq(issueCategory.ispId, ispRecord.id))
    .orderBy(issueCategory.sortOrder);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-10 w-28">
          <Image
            src={ispRecord.logoUrl}
            alt={`${ispRecord.name} logo`}
            fill
            className="object-contain"
          />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            What do you need help with?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the issue that best describes your problem
          </p>
        </div>
      </div>

      <SelectIssueForm
        ispSlug={ispRecord.slug}
        ispName={ispRecord.name}
        categories={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          label: c.label,
          description: c.description,
        }))}
      />
    </div>
  );
}
