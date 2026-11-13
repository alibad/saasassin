"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AccountSettings } from "@/components/account/account-settings";

import { FEEDBACK_SIGN_IN, FeedbackShell, viewHref } from "./app-shell";
import { WORKSPACE_STORAGE_KEY } from "./feedback-workspace";
import { PageHeader } from "./settings-section";

/** Account settings inside the Feedback frame, so the person never leaves the product. */
export function FeedbackAccountPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the last workspace is only known in the browser
      setTenantId(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
    } catch {
      // No remembered workspace; the switcher offers the list.
    }
  }, []);

  return (
    <FeedbackShell
      tenantId={tenantId}
      active={null}
      onSwitchWorkspace={(id) => {
        try {
          window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
        } catch {
          // The address below carries the choice anyway.
        }
        router.push(viewHref("inbox", id));
      }}
      portalHref={tenantId ? `/apps/feedback/b/${tenantId}` : null}
    >
      <main id="main" className="mx-auto grid w-full grid-cols-1 max-w-3xl gap-6 px-4 py-8 sm:px-6">
        <PageHeader title="Your account" description="Your profile and photo, how you sign in, and where you're signed in. Your photo appears next to everything you do in Feedback." />
        <AccountSettings product="feedback" productName="Feedback" signInHref={FEEDBACK_SIGN_IN} />
      </main>
    </FeedbackShell>
  );
}
