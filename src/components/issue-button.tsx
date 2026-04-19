"use client";

import { cn } from "@/lib/utils";
import {
  Receipt,
  Wrench,
  XCircle,
  MessageCircle,
  Truck,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  billing: Receipt,
  technical: Wrench,
  cancellation: XCircle,
  general: MessageCircle,
  "moving-service": Truck,
  moving: Truck,
  "new-service": RefreshCw,
  "plan-changes": RefreshCw,
};

interface IssueCategoryButtonProps {
  category: {
    id: string;
    slug: string;
    label: string;
    description: string | null;
  };
  selected: boolean;
  onClick: () => void;
}

export function IssueCategoryButton({
  category,
  selected,
  onClick,
}: IssueCategoryButtonProps) {
  const Icon = CATEGORY_ICONS[category.slug] ?? MessageCircle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
          : "border-input bg-background shadow-xs"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full",
        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <span className="block text-sm font-semibold">{category.label}</span>
        {category.description && (
          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
            {category.description}
          </span>
        )}
      </div>
    </button>
  );
}
