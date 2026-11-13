import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("revenue");

type PageProps = { params: Promise<{ token: string }> };

export default async function RevenueInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="revenue" token={token} />;
}
