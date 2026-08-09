import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <p className="footer-wordmark">SaaSassin</p>
          <p className="footer-note">
            Open replacements win through migrations, maintenance, and trust—not
            repository count.
          </p>
        </div>
        <div className="footer-links" aria-label="Footer navigation">
          <Link href="/catalog">Target catalog</Link>
          <Link href="/roadmap">Public roadmap</Link>
          <Link href="/logo-lab">Logo lab</Link>
          <Link href="/api/catalog">Catalog API</Link>
        </div>
        <p className="footer-legal">
          Clean-room product work. Incumbent names identify migration targets and
          do not imply affiliation.
        </p>
      </div>
    </footer>
  );
}
