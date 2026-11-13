"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A six-digit authenticator code field that browsers and password managers can autofill. */
export function TotpCodeInput({ className, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, "onChange"> & {
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="123456"
      className={cn("text-center text-lg tracking-[0.4em] tabular-nums", className)}
      onChange={(event) => onValueChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      {...props}
    />
  );
}
