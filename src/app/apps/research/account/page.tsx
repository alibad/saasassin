import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("research");

export default function ResearchAccountPage() {
  return <AccountSettingsPage product="research" />;
}
