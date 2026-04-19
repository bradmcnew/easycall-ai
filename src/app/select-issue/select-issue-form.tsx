"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssueCategoryButton } from "@/components/issue-button";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

interface Category {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

interface SelectIssueFormProps {
  ispSlug: string;
  ispName: string;
  categories: Category[];
}

export function SelectIssueForm({ ispSlug, ispName, categories }: SelectIssueFormProps) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const selectedCategory = categories.find((c) => c.slug === selectedSlug);

  function handleContinue() {
    if (!selectedSlug) return;
    const params = new URLSearchParams({
      isp: ispSlug,
      category: selectedSlug,
    });
    if (note.trim()) {
      params.set("note", note.trim());
    }
    router.push(`/confirm?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {categories.map((category) => (
          <IssueCategoryButton
            key={category.id}
            category={category}
            selected={selectedSlug === category.slug}
            onClick={() => setSelectedSlug(category.slug)}
          />
        ))}
      </div>

      {/* What happens next preview */}
      {selectedCategory && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Our AI will call {ispName}, navigate their phone menu to reach the{" "}
              <span className="font-medium text-foreground">
                {selectedCategory.label.toLowerCase()}
              </span>{" "}
              department, wait on hold, and connect you when an agent picks up.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="issue-note"
          className="text-sm font-medium text-foreground"
        >
          Describe your issue briefly (optional)
        </label>
        <textarea
          id="issue-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g., My internet has been dropping every hour for the past week"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <Button
        onClick={handleContinue}
        disabled={!selectedSlug}
        className="w-full"
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
}
