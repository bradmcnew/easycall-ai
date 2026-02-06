"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Remove leading 1 for display formatting
  const local = digits.startsWith("1") && digits.length > 10
    ? digits.slice(1)
    : digits;

  if (local.length <= 3) return local;
  if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`;
}

const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .transform(normalizePhone)
    .refine(
      (val) => /^\+1\d{10}$/.test(val),
      "Enter a valid 10-digit US phone number"
    ),
});

type PhoneFormData = z.input<typeof phoneSchema>;

interface PhoneInputProps {
  onSubmit: (phoneNumber: string) => void;
  disabled?: boolean;
}

export function PhoneInput({ onSubmit, disabled }: PhoneInputProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const onFormSubmit = handleSubmit((data) => {
    // data.phone is already transformed to E.164 by zod
    onSubmit(data.phone);
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatPhoneDisplay(raw);
    setValue("phone", formatted, { shouldValidate: false });
  };

  return (
    <form onSubmit={onFormSubmit} className="w-full space-y-2">
      <Label htmlFor="phone">Phone number</Label>
      <Input
        id="phone"
        type="tel"
        placeholder="(555) 123-4567"
        autoComplete="tel-national"
        disabled={disabled}
        {...register("phone", { onChange: handleChange })}
        aria-invalid={!!errors.phone}
      />
      {errors.phone && (
        <p className="text-sm text-destructive">{errors.phone.message}</p>
      )}
    </form>
  );
}
