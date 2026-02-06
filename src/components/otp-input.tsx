"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const otpSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type OtpFormData = z.input<typeof otpSchema>;

interface OtpInputProps {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}

export function OtpInput({ onSubmit, disabled }: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  const { ref: formRef, ...rest } = register("code");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onFormSubmit = handleSubmit((data) => {
    onSubmit(data.code);
  });

  return (
    <form onSubmit={onFormSubmit} className="w-full space-y-2">
      <Label htmlFor="code">Verification code</Label>
      <Input
        id="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        disabled={disabled}
        ref={(el) => {
          formRef(el);
          inputRef.current = el;
        }}
        {...rest}
        className="text-center text-2xl tracking-[0.5em] font-mono"
        aria-invalid={!!errors.code}
      />
      {errors.code && (
        <p className="text-sm text-destructive">{errors.code.message}</p>
      )}
    </form>
  );
}
