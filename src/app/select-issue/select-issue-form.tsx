"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssueCategoryButton } from "@/components/issue-button";
import { Button } from "@/components/ui/button";
import { Bot, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [accountNumber, setAccountNumber] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [address, setAddress] = useState("");
  const [showAccountDetails, setShowAccountDetails] = useState(false);

  const selectedCategory = categories.find((c) => c.slug === selectedSlug);

  function handleContinue() {
    if (!selectedSlug) return;
    const params = new URLSearchParams({
      isp: ispSlug,
      category: selectedSlug,
    });
    if (note.trim()) params.set("note", note.trim());
    if (accountNumber.trim()) params.set("account", accountNumber.trim());
    if (zipCode.trim()) params.set("zip", zipCode.trim());
    if (address.trim()) params.set("address", address.trim());
    router.push(`/confirm?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Category grid */}
      <div className="grid grid-cols-2 gap-2">
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

      {/* Details section — only show after category is selected */}
      {selectedCategory && (
        <div className="animate-in fade-in duration-300 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="issue-note"
              className="text-sm font-medium text-foreground"
            >
              Describe your issue briefly{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="issue-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., My internet has been dropping every hour for the past week"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          {/* Collapsible account details */}
          <div className="rounded-lg border border-input">
            <button
              type="button"
              onClick={() => setShowAccountDetails(!showAccountDetails)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>
                Account details{" "}
                <span className="text-xs">(helps the AI navigate faster)</span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  showAccountDetails && "rotate-180"
                )}
              />
            </button>
            {showAccountDetails && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-3 border-t px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="account-number" className="text-xs text-muted-foreground">
                      Account number
                    </label>
                    <input
                      id="account-number"
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="e.g., 8001234567"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="zip-code" className="text-xs text-muted-foreground">
                      ZIP code
                    </label>
                    <input
                      id="zip-code"
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="e.g., 90210"
                      maxLength={10}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="address" className="text-xs text-muted-foreground">
                    Service address
                  </label>
                  <input
                    id="address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g., 123 Main St, Apt 4B"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
