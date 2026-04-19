"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

interface CallRecord {
  id: string;
  status: string;
  endedReason: string | null;
  userNote: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  ispName: string;
  ispSlug: string;
  ispLogoUrl: string;
  categoryLabel: string;
  categorySlug: string;
}

interface HistoryClientProps {
  calls: CallRecord[];
}

const ACTIVE_STATUSES = [
  "pending",
  "dialing",
  "navigating",
  "on_hold",
  "agent_detected",
  "transferring",
  "connected",
];

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusBadge(status: string, endedReason: string | null) {
  if (ACTIVE_STATUSES.includes(status)) {
    return {
      label: "In Progress",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    };
  }
  if (status === "completed" && endedReason !== "manually-canceled") {
    return {
      label: "Completed",
      className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  }
  if (endedReason === "manually-canceled") {
    return {
      label: "Cancelled",
      className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      icon: <XCircle className="h-3 w-3" />,
    };
  }
  return {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    icon: <XCircle className="h-3 w-3" />,
  };
}

export function HistoryClient({ calls }: HistoryClientProps) {
  if (calls.length === 0) {
    return (
      <div className="w-full space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your past calls with ISP support
          </p>
        </div>
        <div className="flex flex-col items-center gap-4 py-12">
          <Phone className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">No calls yet</p>
          <Button asChild>
            <Link href="/select-isp">Start Your First Call</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {calls.length} call{calls.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/select-isp">
            <Phone className="h-4 w-4" />
            New Call
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {calls.map((c) => {
          const badge = getStatusBadge(c.status, c.endedReason);
          const duration = (() => {
            if (!c.startedAt) return null;
            const start = new Date(c.startedAt).getTime();
            const end = c.endedAt ? new Date(c.endedAt).getTime() : Date.now();
            const seconds = Math.max(0, Math.floor((end - start) / 1000));
            return formatDuration(seconds);
          })();

          return (
            <Link key={c.id} href={`/call/${c.id}`} className="block group">
              <Card className="transition-all hover:border-primary/40 hover:shadow-md group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
                <CardContent className="flex items-center gap-4 p-4">
                  {/* ISP Logo */}
                  <div className="relative h-8 w-16 shrink-0">
                    <Image
                      src={c.ispLogoUrl}
                      alt={`${c.ispName} logo`}
                      fill
                      className="object-contain"
                    />
                  </div>

                  {/* Call info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {c.ispName}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          badge.className
                        )}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.categoryLabel}
                      {c.userNote && ` \u2014 ${c.userNote}`}
                    </p>
                  </div>

                  {/* Date and duration */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </p>
                    {duration && (
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {duration}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
