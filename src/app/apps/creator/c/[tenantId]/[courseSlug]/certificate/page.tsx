import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SchoolMark } from "@/components/creator/public-chrome";
import { Button } from "@/components/ui/button";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { getCertificate } from "@/lib/creator/store";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = { params: Promise<{ tenantId: string; courseSlug: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Certificate of completion", robots: { index: false, follow: false } };

export default async function CertificatePage({ params }: PageProps) {
  const { tenantId, courseSlug } = await params;
  const landing = `/apps/creator/c/${tenantId}/${courseSlug}`;
  const user = await getFleetUser(CREATOR_SLUG);
  if (!user) redirect(`/apps/creator/sign-in?next=${encodeURIComponent(`${landing}/certificate`)}`);

  let certificate;
  try {
    certificate = await getCertificate(tenantId, courseSlug, user);
  } catch (error) {
    if (error instanceof FleetError && error.status === 403) redirect(`${landing}/learn`);
    if (error instanceof FleetError && error.status === 404) notFound();
    throw error;
  }

  const completed = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(certificate.completedAt));

  return (
    <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 py-10 text-foreground print:bg-white">
      <div className="grid w-full max-w-4xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button asChild variant="ghost" className="rounded-xl"><Link href={`${landing}/learn`}><ArrowLeft aria-hidden="true" /> Back to the course</Link></Button>
          <p className="text-sm text-muted-foreground">Use your browser&apos;s print dialog to save it as a PDF.</p>
        </div>
        <article className="relative overflow-hidden rounded-[2rem] bg-card p-3 shadow-[0_50px_100px_-50px_rgb(0_0_0/0.45)] ring-1 ring-border print:shadow-none">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-border px-8 py-14 text-center sm:px-16 sm:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_60%_at_0%_0%,color-mix(in_oklab,var(--brand-accent)_40%,transparent)_0%,transparent_70%),radial-gradient(45%_60%_at_100%_100%,color-mix(in_oklab,var(--chart-1)_22%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
            <div className="relative grid justify-items-center gap-2">
              <SchoolMark name={certificate.schoolName} className="size-14 rounded-2xl text-lg" />
              <p className="mt-4 text-sm font-medium tracking-wide text-primary">Certificate of completion</p>
              <p className="mt-8 text-muted-foreground">This certifies that</p>
              <h1 className="brand-heading text-5xl leading-tight sm:text-6xl">{certificate.learnerName}</h1>
              <p className="mt-6 text-muted-foreground">completed every lesson of</p>
              <h2 className="brand-heading text-3xl italic">{certificate.courseTitle}</h2>
              <p className="mt-2 text-muted-foreground">offered by {certificate.schoolName}</p>
              <div className="mt-12 grid w-full gap-4 border-t border-border pt-6 text-left text-xs text-muted-foreground sm:grid-cols-2">
                <span>Completed on <span className="font-medium text-foreground">{completed}</span></span>
                <span className="sm:text-right">Certificate <code className="font-mono text-foreground">{certificate.certificateId}</code></span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
