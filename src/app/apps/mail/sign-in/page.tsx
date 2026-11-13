import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { brand } from "@/brands/mail/brand";
import { MailMark } from "@/brands/mail/mark";
import { Key } from "@/brands/mail/preview";
import { site } from "@/brands/mail/site";
import { FleetAuthForm } from "@/components/fleet-auth-form";
import { SignInLayout } from "@/components/product-site/sign-in-layout";
import { productLinks } from "@/lib/brand/links";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("mail");

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name} or create a workspace and import your mail.`,
  robots: { index: false, follow: false },
};

function KeysArt() {
  return (
    <div className="relative max-w-md">
      <div className="absolute -top-20 -left-10 h-72 w-96 rounded-full bg-primary/25 blur-[90px]" />
      <div className="relative grid grid-cols-4 gap-2.5">
        {["j", "k", "e", "h", "f", "m", "/", "z"].map((key) => (
          <Key key={key} className="h-14 w-full rounded-lg text-xl">
            {key}
          </Key>
        ))}
      </div>
    </div>
  );
}

export default async function MailSignInPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) redirect(`/apps/${app.slug}`);
  const links = productLinks(brand.slug);

  return (
    <SignInLayout name={brand.name} mark={<MailMark />} homeHref={links.home} signIn={site.signIn} tone="subtle" art={<KeysArt />}>
      <FleetAuthForm product={app.slug} productName={brand.name} description={app.audience} next={`/apps/${app.slug}`} />
    </SignInLayout>
  );
}
