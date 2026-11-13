import { AccountSettingsPage, accountPageMetadata } from "@/components/account/account-pages";

export const metadata = accountPageMetadata("planner");

export default function PlannerAccountPage() {
  return <AccountSettingsPage product="planner" />;
}
