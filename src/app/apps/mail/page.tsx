import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MailHome } from "@/brands/mail/home";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("mail");

export const metadata: Metadata = brandHomeMetadata();

export default async function MailAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);

  if (user) return <MailWorkspace />;

  return <MailHome />;
}
