import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("studies");

export default function StudiesAccountPage() {
  return <AccountSettingsPage product="studies" />;
}
