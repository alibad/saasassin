import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("mail");

export default function MailAccountPage() {
  return <AccountSettingsPage product="mail" />;
}
