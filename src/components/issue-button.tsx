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
        "w-full rounded-lg border px-4 py-3 text-left transition-all",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-input bg-background shadow-xs"
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          selected ? "text-primary" : "text-muted-foreground"
        )} />
        <div>
          <span className="block text-sm font-semibold">{category.label}</span>
          {category.description && (
            <span className="block text-xs text-muted-foreground">
              {category.description}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
