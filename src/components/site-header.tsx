import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader() {
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
          <Link href="/catalog">Targets</Link>
          <Link href="/missions/canny-fider">Mission 01</Link>
          <Link href="/roadmap">Roadmap</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>

        <Link className="header-cta" href="/missions/canny-fider">
          Join Mission 01
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </header>
  );
}
