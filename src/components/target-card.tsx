import Link from "next/link";
import { ArrowRight, GitFork } from "lucide-react";

import { ScoreRing } from "@/components/score-ring";
import { StatusPill, StrategyPill } from "@/components/strategy-pill";
import type { Target } from "@/types/catalog";

export function TargetCard({ target }: { target: Target }) {
  return (
    <article className="target-card">
      <div className="target-card-topline">
        <span className="rank-label">#{String(target.rank).padStart(2, "0")}</span>
        <div className="pill-row">
          <StatusPill status={target.status} />
          <StrategyPill strategy={target.strategy} />
        </div>
      </div>

      <div className="target-card-heading">
        <div>
          <p className="eyebrow">{target.category}</p>
          <h3>{target.name}</h3>
        </div>
        <ScoreRing score={target.score} />
      </div>

      <p className="target-summary">{target.summary}</p>

      <div className="signal-row">
        <span>Spend signal</span>
        <strong>{target.priceSignal}</strong>
      </div>

      {target.challengerName ? (
        <div className="challenger-row">
          <GitFork aria-hidden="true" size={16} />
          <span>Build from: {target.challengerName}</span>
        </div>
      ) : (
        <div className="challenger-row challenger-open">
          <GitFork aria-hidden="true" size={16} />
          <span>Open-source whitespace</span>
        </div>
      )}

      <Link className="card-link" href={`/targets/${target.slug}`}>
        Open mission brief
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </article>
  );
}
