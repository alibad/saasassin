import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("feedback");

export default function FeedbackAccountPage() {
  return <AccountSettingsPage product="feedback" />;
}
