import { getCatalogSnapshot, getRoadmapSnapshot } from "@/lib/data";

export async function GET() {
  const [catalog, roadmap] = await Promise.all([
    getCatalogSnapshot(),
    getRoadmapSnapshot(),
  ]);

  return Response.json({
    catalog: catalog.items,
    roadmap: roadmap.items,
    source: catalog.source === "firestore" ? "firestore" : "seed",
  });
}
