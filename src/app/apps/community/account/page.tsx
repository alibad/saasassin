import { redirect } from "next/navigation";

import { accountPageMetadata } from "@/components/account/account-pages";
import { AccountSettings } from "@/components/account/account-settings";
import { CommunityAccountFrame } from "@/components/community/shell";
import { COMMUNITY_SLUG } from "@/lib/community/model";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("community");

export const dynamic = "force-dynamic";

export default async function CommunityAccountPage() {
  const user = await getFleetUser(COMMUNITY_SLUG);
  if (!user) redirect(`/apps/community/sign-in?next=${encodeURIComponent("/apps/community/account")}`);
  return (
    <CommunityAccountFrame>
      <div>
        <h1 className="brand-heading text-4xl">Account settings</h1>
        <p className="mt-2 text-muted-foreground">
          Your photo and name, how you sign in, and where you&apos;re signed in. Your @handle and bio live on your profile in each community.
        </p>
      </div>
      <AccountSettings product={COMMUNITY_SLUG} productName="Community" signInHref="/apps/community/sign-in" />
    </CommunityAccountFrame>
  );
}
