import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("mail");

type PageProps = { params: Promise<{ token: string }> };

export default async function MailInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="mail" token={token} />;
}
