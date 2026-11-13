import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { accountPageMetadata } from "@/components/account/account-pages";
import { AccountSettings } from "@/components/account/account-settings";
import { StudiesTopBar } from "@/components/studies/top-bar";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("studies");

export default async function StudiesAccountPage() {
  const user = await getFleetUser("studies");
  if (!user) redirect(`/apps/studies/sign-in?next=${encodeURIComponent("/apps/studies/account")}`);

  return (
    <div className="min-h-dvh bg-brand-subtle text-foreground">
      <StudiesTopBar />
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <div>
          <Link href="/apps/studies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" /> Back to your studies
          </Link>
          <h1 className="brand-heading mt-3 text-4xl">Account settings</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Your profile and photo, how you sign in, and where you&apos;re signed in.</p>
        </div>
        <AccountSettings product="studies" productName="Studies" signInHref="/apps/studies/sign-in" />
      </main>
    </div>
  );
}
