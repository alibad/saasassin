import { ArrowUpRight } from "lucide-react";

import { percentOf, type ParitySummary } from "@/lib/compare/parity";

const SHOWN_GAPS = 12;

export function ParityProgress({
  summary,
  competitorName,
  productName,
  matrixUrl,
}: {
  summary: ParitySummary;
  competitorName: string;
  productName: string;
  matrixUrl: string;
}) {
  const { total, have, partial, missing } = summary;
  const segments = [
    { key: "have", label: "Have", count: have, note: "shipped" },
    { key: "partial", label: "Partial", count: partial, note: "works, with gaps" },
    { key: "missing", label: "Missing", count: missing, note: "not built yet" },
  ] as const;
  const gaps = summary.highValueMissing.slice(0, SHOWN_GAPS);
  const hiddenGaps = summary.highValueMissing.length - gaps.length;

  return (
    <div className="compare-parity">
      <div className="compare-parity-stats">
        {segments.map((segment) => (
          <div key={segment.key} className={`compare-parity-stat compare-parity-stat-${segment.key}`}>
            <span className="eyebrow">{segment.label}</span>
            <strong>{segment.count}</strong>
            <small>
              {percentOf(segment.count, total)}% · {segment.note}
            </small>
          </div>
        ))}
      </div>

      <div
        className="compare-parity-bar"
        role="img"
        aria-label={`${have} of ${total} ${competitorName} capabilities are in ${productName}, ${partial} partly, ${missing} not yet.`}
      >
        {segments.map((segment) =>
          segment.count > 0 ? (
            <span
              key={segment.key}
              className={`compare-parity-bar-${segment.key}`}
              style={{ flexGrow: segment.count }}
            />
          ) : null,
        )}
      </div>
      <p className="compare-parity-caption">
        {have} of {total} capabilities shipped, {partial} partly. Counted from the public parity matrix when this
        page was built.
      </p>

      {gaps.length > 0 ? (
        <div className="compare-parity-gaps">
          <h3>High-value gaps, in planned build order</h3>
          <ol>
            {gaps.map((row) => (
              <li key={row.id || row.capability}>
                <span className="compare-parity-rank">{row.rank ? `#${row.rank}` : "—"}</span>
                <span>{row.capability}</span>
                {row.module ? <small>{row.module}</small> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <a className="compare-parity-link" href={matrixUrl} target="_blank" rel="noreferrer">
        {hiddenGaps > 0 ? `See all ${summary.highValueMissing.length} high-value gaps in the matrix` : "Read the full parity matrix"}
        <ArrowUpRight aria-hidden="true" size={14} />
      </a>
    </div>
  );
}
