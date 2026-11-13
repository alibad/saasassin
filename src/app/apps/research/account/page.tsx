import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { accountPageMetadata } from "@/components/account/account-pages";
import { AccountSettings } from "@/components/account/account-settings";
import { ResearchTopBar } from "@/components/research/top-bar";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("research");

export default async function ResearchAccountPage() {
  const user = await getFleetUser("research");
  if (!user) redirect(`/apps/research/sign-in?next=${encodeURIComponent("/apps/research/account")}`);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ResearchTopBar>Account settings</ResearchTopBar>
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <div>
          <Link href="/apps/research" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" /> Back to your workspace
          </Link>
          <h1 className="brand-heading mt-3 text-4xl">Account settings</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Your profile and photo, how you sign in, and where you&apos;re signed in.</p>
        </div>
        <AccountSettings product="research" productName="Research" signInHref="/apps/research/sign-in" />
      </main>
    </div>
  );
}
