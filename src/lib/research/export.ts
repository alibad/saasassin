import type { Highlight, Insight, Project, Source, Theme } from "./model";

export const RESEARCH_EXPORT_SCHEMA = "net.saasassin.research.project";
export const RESEARCH_EXPORT_VERSION = "1.0.0";

export type EvidenceLink = {
  insightId: string;
  highlightId: string;
  sourceId: string;
  segmentId: string;
  start: number;
  end: number;
  quote: string;
};

/**
 * The open, versioned project export: every source with its corrected transcript and consent,
 * every highlight span, every insight, and the explicit insight → highlight → source span chain.
 */
export function buildProjectExport(input: {
  project: Project;
  sources: Source[];
  highlights: Highlight[];
  insights: Insight[];
  themes: Theme[];
  exportedAt?: string;
}) {
  const highlightById = new Map(input.highlights.map((highlight) => [highlight.id, highlight]));
  const evidence: EvidenceLink[] = [];
  const brokenLinks: Array<{ insightId: string; highlightId: string }> = [];
  for (const insight of input.insights) {
    for (const highlightId of insight.highlightIds) {
      const highlight = highlightById.get(highlightId);
      if (!highlight) {
        brokenLinks.push({ insightId: insight.id, highlightId });
        continue;
      }
      evidence.push({
        insightId: insight.id,
        highlightId,
        sourceId: highlight.sourceId,
        segmentId: highlight.segmentId,
        start: highlight.start,
        end: highlight.end,
        quote: highlight.quote,
      });
    }
  }
  return {
    schema: RESEARCH_EXPORT_SCHEMA,
    version: RESEARCH_EXPORT_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    project: input.project,
    counts: {
      sources: input.sources.length,
      segments: input.sources.reduce((sum, source) => sum + source.segments.length, 0),
      highlights: input.highlights.length,
      insights: input.insights.length,
      themes: input.themes.length,
    },
    sources: input.sources,
    highlights: input.highlights,
    insights: input.insights,
    themes: input.themes,
    relationships: { evidence, brokenLinks },
  };
}

export type ProjectExport = ReturnType<typeof buildProjectExport>;
