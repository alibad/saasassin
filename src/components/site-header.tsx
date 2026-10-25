import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { getFleetApp, getFleetPublicHref } from "@/lib/fleet/apps";

export function SiteHeader() {
  const performance = getFleetApp("performance");

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="SaaSassin home">
          <span className="brand-mark">
            <Image
              src="/brand/saasassin-mark.png"
              alt=""
              width={40}
              height={40}
              priority
            />
          </span>
          <span>SaaSassin</span>
        </Link>

        <nav className="main-nav" aria-label="Primary navigation">
          <Link href="/apps">Products</Link>
          <Link href="/catalog">Targets</Link>
          <Link href="/targets/lattice/research">Lattice research</Link>
          <Link href="/roadmap">Roadmap</Link>
        </nav>

        <Link className="header-cta" href={performance ? getFleetPublicHref(performance) : "/lattice"}>
          Open Performance
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </header>
  );
}
