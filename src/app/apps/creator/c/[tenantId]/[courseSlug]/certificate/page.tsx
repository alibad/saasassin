import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Award } from "lucide-react";

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
    <main className="fleet-app grid min-h-screen place-items-center bg-[#f6f1e7] px-4 py-10 text-neutral-900 print:bg-white">
      <div className="w-full max-w-3xl space-y-4">
        <article className="border-4 border-neutral-900 bg-white p-8 text-center shadow-[8px_8px_0_0_#ff3d93] sm:p-14 print:shadow-none">
          <Award className="mx-auto size-12 text-[#ff3d93]" aria-hidden="true" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Certificate of completion</p>
          <p className="mt-6 text-sm text-neutral-600">This certifies that</p>
          <h1 className="mt-2 text-4xl font-bold">{certificate.learnerName}</h1>
          <p className="mt-6 text-sm text-neutral-600">completed every lesson of</p>
          <h2 className="mt-2 text-2xl font-semibold">{certificate.courseTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">offered by {certificate.schoolName}</p>
          <div className="mt-10 flex flex-wrap justify-between gap-4 border-t-2 border-neutral-900 pt-4 text-left text-xs text-neutral-600">
            <span>Completed {completed}</span>
            <span>Certificate ID <code className="font-mono">{certificate.certificateId}</code></span>
          </div>
        </article>
        <p className="text-center text-sm print:hidden">
          <Link className="underline" href={`${landing}/learn`}>Back to the course</Link> · Use your browser’s print dialog to save as PDF.
        </p>
      </div>
    </main>
  );
}
