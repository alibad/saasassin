import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("community");

type PageProps = { params: Promise<{ token: string }> };

export default async function CommunityInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="community" token={token} />;
}
