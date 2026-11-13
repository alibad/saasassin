"use client";

import type { ReactNode } from "react";

import { AuthPanel } from "@/components/account/auth-panel";

type FleetAuthFormProps = {
  product: string;
  productName: string;
  description: string;
  /** Where to land after the session is created, e.g. "/apps/research". A safe ?next= in the URL wins. */
  next: string;
  /** Optional product mark shown above the title. */
  mark?: ReactNode;
};

/**
 * The original sign-in form's props, now rendered by the shared AuthPanel (Google plus any
 * enabled Microsoft / GitHub / Apple sign-in, password reset, email verification, account
 * linking and two-step codes). New code can use AuthPanel directly.
 */
export function FleetAuthForm({ product, productName, description, next, mark }: FleetAuthFormProps) {
  return <AuthPanel product={product} productName={productName} description={description} next={next} mark={mark} />;
}
