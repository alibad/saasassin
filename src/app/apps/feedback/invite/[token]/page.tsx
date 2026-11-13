import { InviteAcceptPage, invitePageMetadata } from "@/components/account/account-pages";

export const metadata = invitePageMetadata("feedback");

type PageProps = { params: Promise<{ token: string }> };

export default async function FeedbackInvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptPage product="feedback" token={token} />;
}
