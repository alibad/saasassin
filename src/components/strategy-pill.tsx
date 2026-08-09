import type { Strategy, TargetStatus } from "@/types/catalog";

export function StrategyPill({ strategy }: { strategy: Strategy }) {
  return (
    <span className={`strategy-pill strategy-${strategy.toLowerCase()}`}>
      {strategy}
    </span>
  );
}

export function StatusPill({ status }: { status: TargetStatus }) {
  return <span className="status-pill">{status}</span>;
}
