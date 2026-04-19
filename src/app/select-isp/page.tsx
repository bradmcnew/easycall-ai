import Link from "next/link";
import { db } from "@/db";
import { isp } from "@/db/schema";
import { IspCard } from "@/components/isp-card";

export default async function SelectIspPage() {
  const isps = await db.select().from(isp);

  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Who&apos;s your internet provider?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your ISP to get started
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {isps.map((ispItem) => (
          <IspCard key={ispItem.id} isp={ispItem} />
        ))}
      </div>

      <div className="text-center">
        <Link
          href="/history"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          View call history
        </Link>
      </div>
    </div>
  );
}
