"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Phone", path: "/" },
  { label: "Verify", path: "/verify" },
  { label: "Select ISP", path: "/select-isp" },
  { label: "Select Issue", path: "/select-issue" },
  { label: "Confirm", path: "/confirm" },
] as const;

function getStepIndex(pathname: string): number {
  const index = STEPS.findIndex((s) => s.path === pathname);
  return index === -1 ? 0 : index;
}

export function StepIndicator() {
  const pathname = usePathname();
  const currentStep = getStepIndex(pathname);

  return (
    <nav aria-label="Progress" className="flex items-center justify-center gap-2 py-4">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isUpcoming = i > currentStep;

        // Steps 3-5 (index 2-4) are clickable when current step >= that step
        // Steps 1-2 (index 0-1) are NOT clickable from steps 3+
        const isClickable =
          i >= 2 && i <= currentStep && i !== currentStep
            ? true
            : i < 2 && currentStep < 2 && i < currentStep
              ? true
              : false;

        const dot = (
          <span
            className={cn(
              "flex items-center justify-center rounded-full transition-all",
              isCurrent && "h-4 w-4 bg-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
              isCompleted && "h-3 w-3 bg-primary",
              isUpcoming && "h-3 w-3 border-2 border-muted-foreground/30 bg-transparent"
            )}
          />
        );

        return (
          <div key={step.path} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              {isClickable ? (
                <Link
                  href={step.path}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                  aria-label={`Go to ${step.label}`}
                >
                  {dot}
                </Link>
              ) : (
                dot
              )}
              <span
                className={cn(
                  "hidden text-[10px] md:block",
                  isCurrent && "font-medium text-foreground",
                  isCompleted && "text-muted-foreground",
                  isUpcoming && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mb-4 hidden h-px w-8 md:block",
                  i < currentStep ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
