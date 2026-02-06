"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Phone } from "lucide-react";

interface StartCallButtonProps {
  ispId: string;
  issueCategoryId: string;
  userNote?: string;
}

export function StartCallButton({
  ispId,
  issueCategoryId,
  userNote,
}: StartCallButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function startCall() {
    setIsLoading(true);

    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ispId, issueCategoryId, userNote }),
      });

      const data = await res.json();

      if (res.status === 201) {
        router.push(`/call/${data.callId}`);
        return;
      }

      if (res.status === 409 && data.callId) {
        toast.info("You already have an active call. Redirecting...");
        router.push(`/call/${data.callId}`);
        return;
      }

      toast.error(data.error || "Something went wrong. Please try again.");
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      onClick={startCall}
      disabled={isLoading}
      className="w-full"
      size="lg"
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" />
          Starting call...
        </>
      ) : (
        <>
          <Phone />
          Start Call
        </>
      )}
    </Button>
  );
}
