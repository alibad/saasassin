"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { TargetCard } from "@/components/target-card";
import type { Strategy, Target } from "@/types/catalog";

const strategies: Array<"All" | Strategy> = ["All", "Build", "Assemble", "Back"];

export function CatalogExplorer({ targets }: { targets: Target[] }) {
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<(typeof strategies)[number]>("All");

  const filteredTargets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return targets.filter((target) => {
      const matchesStrategy = strategy === "All" || target.strategy === strategy;
      const matchesQuery =
        !normalizedQuery ||
        [target.name, target.category, target.summary, target.challengerName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStrategy && matchesQuery;
    });
  }, [query, strategy, targets]);

  return (
    <div>
      <div className="catalog-controls">
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search targets</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a product, category, or challenger"
          />
        </label>

        <div className="filter-group" aria-label="Filter by attack strategy">
          <SlidersHorizontal aria-hidden="true" size={17} />
          {strategies.map((option) => (
            <button
              key={option}
              type="button"
              className={strategy === option ? "active" : ""}
              onClick={() => setStrategy(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-result-line" aria-live="polite">
        <span>{filteredTargets.length} missions</span>
        <span>Ranked by displacement attractiveness</span>
      </div>

      {filteredTargets.length ? (
        <div className="catalog-grid">
          {filteredTargets.map((target) => (
            <TargetCard key={target.slug} target={target} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="eyebrow">No matching mission</p>
          <h2>Try a broader search.</h2>
          <p>The catalog is intentionally small while the operating model is proven.</p>
        </div>
      )}
    </div>
  );
}
