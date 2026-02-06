"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssueCategoryButton } from "@/components/issue-button";
import { Button } from "@/components/ui/button";

interface Category {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

interface SelectIssueFormProps {
  ispSlug: string;
  categories: Category[];
}

export function SelectIssueForm({ ispSlug, categories }: SelectIssueFormProps) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [note, setNote] = useState("");

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
