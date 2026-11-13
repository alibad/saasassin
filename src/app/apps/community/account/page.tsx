import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("community");

export default function CommunityAccountPage() {
  return <AccountSettingsPage product="community" />;
}
