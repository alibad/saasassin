import { redirect } from "next/navigation";

import { accountPageMetadata } from "@/components/account/account-pages";
import { AccountSettings } from "@/components/account/account-settings";
import { CreatorAccountFrame } from "@/components/creator/shell";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("creator");

export const dynamic = "force-dynamic";

export default async function CreatorAccountPage() {
  const user = await getFleetUser(CREATOR_SLUG);
  if (!user) redirect(`/apps/creator/sign-in?next=${encodeURIComponent("/apps/creator/account")}`);
  return (
    <CreatorAccountFrame>
      <div>
        <h1 className="brand-heading text-4xl">Account settings</h1>
        <p className="mt-2 text-muted-foreground">Your profile and photo, how you sign in, and where you&apos;re signed in.</p>
      </div>
      <AccountSettings product={CREATOR_SLUG} productName="Creator" signInHref="/apps/creator/sign-in" />
    </CreatorAccountFrame>
  );
}
