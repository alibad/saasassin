import { serializeJsonLd } from "@/lib/compare/structured-data";

/** Structured data as a plain <script> tag, as the Next.js JSON-LD guide recommends. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
