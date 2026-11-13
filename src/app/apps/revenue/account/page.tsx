import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("revenue");

export default function RevenueAccountPage() {
  return <AccountSettingsPage product="revenue" />;
}
