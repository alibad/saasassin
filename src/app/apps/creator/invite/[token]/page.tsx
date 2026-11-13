import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("creator");

type PageProps = { params: Promise<{ token: string }> };

export default async function CreatorInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="creator" token={token} />;
}
