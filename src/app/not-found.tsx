import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found">
      <div>
        <p className="eyebrow">Target not found</p>
        <h1>This mission is not in the catalog.</h1>
        <p>It may still be under research—or it may already have a strong open replacement.</p>
        <Link className="primary-button" href="/catalog">
          <ArrowLeft aria-hidden="true" size={17} />
          Return to the catalog
        </Link>
      </div>
    </main>
  );
}
