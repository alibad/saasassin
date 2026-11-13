import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("trust");

type PageProps = { params: Promise<{ token: string }> };

export default async function TrustInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="trust" token={token} />;
}
