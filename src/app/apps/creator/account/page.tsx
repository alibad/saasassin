import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("creator");

export default function CreatorAccountPage() {
  return <AccountSettingsPage product="creator" />;
}
