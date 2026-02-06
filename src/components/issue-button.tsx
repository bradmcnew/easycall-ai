"use client";

import { cn } from "@/lib/utils";

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
      <span className="block text-sm font-semibold">{category.label}</span>
      {category.description && (
        <span className="block text-xs text-muted-foreground">
          {category.description}
        </span>
      )}
    </button>
  );
}
