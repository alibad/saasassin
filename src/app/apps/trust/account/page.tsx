import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("trust");

export default function TrustAccountPage() {
  return <AccountSettingsPage product="trust" />;
}
