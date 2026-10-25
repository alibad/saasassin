import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Database, GitBranch, ShieldCheck } from "lucide-react";

import { LatticeAuthForm } from "@/components/lattice-auth-form";
import { getCurrentSessionUser } from "@/lib/lattice/auth";

export const metadata: Metadata = {
  title: "Sign in to Lattice Performance",
  description: "Create or access a secure SaaSassin performance workspace.",
  robots: { index: false, follow: false },
};

export default async function LatticeSignInPage() {
  const user = await getCurrentSessionUser();
  if (user) redirect("/lattice");

  return (
    <main className="lattice-auth-page fleet-app">
      <div className="shell lattice-auth-grid">
        <section className="lattice-auth-copy">
          <Link className="back-link" href="/targets/lattice/research">
            <ArrowLeft aria-hidden="true" size={16} />
            Read the product decision
          </Link>
          <p className="eyebrow">Mission 01 / Lattice Performance</p>
          <h1>Performance reviews without the permission guesswork.</h1>
          <p>
            A tenant-isolated performance workspace with reversible review phases,
            portable data, and an audit trail you can inspect before launch.
          </p>
          <div className="lattice-auth-proof">
            <span><ShieldCheck /> Server-verified roles</span>
            <span><Database /> Firebase persistence</span>
            <span><GitBranch /> Reversible cycles</span>
          </div>
        </section>
        <LatticeAuthForm />
      </div>
    </main>
  );
}
