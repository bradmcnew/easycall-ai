"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session?.user) {
      router.replace("/select-isp");
    }
  }, [session, router]);

  async function handleSubmit(phoneNumber: string) {
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber,
      });
      if (error) {
        toast.error("Failed to send verification code. Please try again.");
        return;
      }
      router.push(`/verify?phone=${encodeURIComponent(phoneNumber)}`);
    } catch {
      toast.error("Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">EasyCallAI</h1>
          <p className="text-muted-foreground">Never wait on hold again</p>
        </div>

        <div className="space-y-4">
          <PhoneInput onSubmit={handleSubmit} disabled={loading} />
          <Button
            type="submit"
            form={undefined}
            className="w-full"
            size="lg"
            disabled={loading}
            onClick={() => {
              // Trigger the form submit inside PhoneInput
              const form = document.querySelector("form");
              form?.requestSubmit();
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Sending code...
              </span>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
