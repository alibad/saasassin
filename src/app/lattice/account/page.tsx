import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountSettings } from "@/components/account/account-settings";
import { PerformanceShell } from "@/components/lattice-shell";
import { PageHeader } from "@/components/lattice-ui";
import { getShellContext } from "@/lib/lattice/account";
import { getCurrentSessionUser } from "@/lib/lattice/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};

/**
 * Account settings inside the Performance frame: profile and photo, sign-in methods, password,
 * two-step verification and sessions. Performance's own session cookie authenticates it; the
 * shared account routes under /api/fleet/performance do the work (src/lib/lattice/account.ts).
 */
export default async function PerformanceAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const user = await getCurrentSessionUser();
  if (!user) redirect(`/lattice/sign-in?next=${encodeURIComponent("/lattice/account")}`);
  const { organization } = await searchParams;
  const shell = await getShellContext(user, organization);

  return (
    <PerformanceShell
      organization={shell.organization}
      memberships={shell.memberships}
      permissions={shell.permissions}
      roleName={shell.roleName}
      view={null}
      crumb="Account settings"
    >
      <div className="mx-auto grid max-w-3xl gap-8">
        <PageHeader title="Account settings" description="Your profile and photo, how you sign in, and where you're signed in." />
        <AccountSettings product="performance" productName="Performance" signInHref="/lattice/sign-in" />
      </div>
    </PerformanceShell>
  );
}
