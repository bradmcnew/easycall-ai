"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { OtpInput } from "@/components/otp-input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!phone) {
      router.replace("/");
    }
  }, [phone, router]);

  if (!phone) return null;

  async function handleVerify(code: string) {
    setLoading(true);
    try {
      const { error } = await authClient.phoneNumber.verify({
        phoneNumber: phone!,
        code,
      });
      if (error) {
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("expired")) {
          toast.error("Code expired. Please request a new one.");
        } else if (msg.includes("invalid") || msg.includes("incorrect")) {
          toast.error("Invalid code. Please try again.");
        } else {
          toast.error("Verification failed. Please try again.");
        }
        return;
      }
      toast.success("Phone verified!");
      router.push("/select-isp");
    } catch {
      toast.error("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber: phone!,
      });
      if (error) {
        toast.error("Failed to resend code. Please try again.");
        return;
      }
      toast.success("New code sent!");
    } catch {
      toast.error("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  // Format phone for display: +15551234567 -> (555) 123-4567
  function formatDisplay(e164: string): string {
    const digits = e164.replace(/\D/g, "");
    const local = digits.startsWith("1") ? digits.slice(1) : digits;
    if (local.length === 10) {
      return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
    return e164;
  }

  return (
    <div className="flex w-full flex-col items-center bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Verify your phone</h1>
          <p className="text-muted-foreground">
            Enter the code sent to{" "}
            <span className="font-medium text-foreground">
              {formatDisplay(phone)}
            </span>
          </p>
        </div>

        <div className="space-y-4">
          <OtpInput onSubmit={handleVerify} disabled={loading} />
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading}
            onClick={() => {
              const form = document.querySelector("form");
              form?.requestSubmit();
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Verifying...
              </span>
            ) : (
              "Verify"
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend code"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
