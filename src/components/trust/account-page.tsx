"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AccountSettings } from "@/components/account/account-settings";

import { TRUST_HOME, TRUST_SIGN_IN, TrustShell } from "./app-shell";
import { PageHeader } from "./shared";
import { TRUST_WORKSPACE_KEY } from "./trust-workspace";

/** Account settings inside the Trust frame. */
export function TrustAccountPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the last workspace is only known in the browser
      setTenantId(window.localStorage.getItem(TRUST_WORKSPACE_KEY));
    } catch {
      // No remembered workspace; the switcher offers the list.
    }
  }, []);

  return (
    <TrustShell
      tenantId={tenantId}
      active={null}
      onSwitchWorkspace={(id) => {
        try {
          window.localStorage.setItem(TRUST_WORKSPACE_KEY, id);
        } catch {
          // The address carries the choice anyway.
        }
        router.push(`${TRUST_HOME}?workspace=${encodeURIComponent(id)}`);
      }}
    >
      <div className="mx-auto grid w-full grid-cols-1 max-w-3xl gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <PageHeader title="Your account" description="Your profile and photo, how you sign in, two-step verification, and where you're signed in." />
        <AccountSettings product="trust" productName="Trust" signInHref={TRUST_SIGN_IN} />
      </div>
    </TrustShell>
  );
}
