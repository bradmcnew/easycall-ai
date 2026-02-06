import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { isp, issueCategory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ConfirmPageProps {
  searchParams: Promise<{ isp?: string; category?: string; note?: string }>;
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const ispSlug = params.isp;
  const categorySlug = params.category;
  const note = params.note;

  if (!ispSlug || !categorySlug) {
    redirect("/select-isp");
  }

  const ispRecord = await db.query.isp.findFirst({
    where: eq(isp.slug, ispSlug),
  });

  if (!ispRecord) {
    redirect("/select-isp");
  }

  const [categoryRecord] = await db
    .select()
    .from(issueCategory)
    .where(
      and(
        eq(issueCategory.ispId, ispRecord.id),
        eq(issueCategory.slug, categorySlug)
      )
    )
    .limit(1);

  if (!categoryRecord) {
    redirect(`/select-issue?isp=${ispSlug}`);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Review your selections
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Make sure everything looks right before we place your call
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ISP */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-20">
                <Image
                  src={ispRecord.logoUrl}
                  alt={`${ispRecord.name} logo`}
                  fill
                  className="object-contain"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Internet provider</p>
                <p className="text-sm font-medium">{ispRecord.name}</p>
              </div>
            </div>
            <Link
              href="/select-isp"
              className="text-xs font-medium text-primary hover:underline"
            >
              Change
            </Link>
          </div>

          <div className="border-t" />

          {/* Issue Category */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Issue</p>
              <p className="text-sm font-medium">{categoryRecord.label}</p>
              {categoryRecord.description && (
                <p className="text-xs text-muted-foreground">
                  {categoryRecord.description}
                </p>
              )}
            </div>
            <Link
              href={`/select-issue?isp=${ispSlug}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Change
            </Link>
          </div>

          {/* Note */}
          {note && (
            <>
              <div className="border-t" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Your note</p>
                  <p className="text-sm">{decodeURIComponent(note)}</p>
                </div>
                <Link
                  href={`/select-issue?isp=${ispSlug}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Edit
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button disabled className="w-full" size="lg">
          Start Call
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Call placement coming soon in the next update
        </p>
      </div>
    </div>
  );
}
