import { redirect } from "next/navigation";

import { accountPageMetadata } from "@/components/account/account-pages";
import { FeedbackAccountPage } from "@/components/feedback/account-page";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata = accountPageMetadata("feedback");

export default async function FeedbackAccountRoute() {
  const user = await getFleetUser("feedback");
  if (!user) redirect(`/apps/feedback/sign-in?next=${encodeURIComponent("/apps/feedback/account")}`);
  return <FeedbackAccountPage />;
}
