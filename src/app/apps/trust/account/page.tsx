import { redirect } from "next/navigation";

import { accountPageMetadata } from "@/components/account/account-pages";
import { TrustAccountPage } from "@/components/trust/account-page";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("trust");

export default async function TrustAccountRoute() {
  const user = await getFleetUser("trust");
  if (!user) redirect(`/apps/trust/sign-in?next=${encodeURIComponent("/apps/trust/account")}`);
  return <TrustAccountPage />;
}
