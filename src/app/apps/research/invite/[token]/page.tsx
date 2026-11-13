import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("research");

type PageProps = { params: Promise<{ token: string }> };

export default async function ResearchInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="research" token={token} />;
}
