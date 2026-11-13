import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("studies");

type PageProps = { params: Promise<{ token: string }> };

export default async function StudiesInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="studies" token={token} />;
}
