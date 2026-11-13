"use client";

import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { calculateAnnualListCost, formatUsd, seatsWhereMinimumStopsApplying } from "@/lib/compare/cost";
import type { ComparisonPricing } from "@/lib/compare/types";

export function CostCalculator({
  competitorName,
  productName,
  pricing,
}: {
  competitorName: string;
  productName: string;
  pricing: ComparisonPricing;
}) {
  const id = useId();
  const [seats, setSeats] = useState(pricing.seats.default);
  const [selected, setSelected] = useState<string[]>(() =>
    pricing.modules.filter((module) => module.required || module.defaultSelected).map((module) => module.id),
  );

  const result = calculateAnnualListCost({
    seats,
    modules: pricing.modules,
    selectedModuleIds: selected,
    annualMinimum: pricing.annualMinimum,
    seatRange: pricing.seats,
  });
  const breakEven = seatsWhereMinimumStopsApplying(result.perSeatMonthly, pricing.annualMinimum);

  function toggle(moduleId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, moduleId])] : current.filter((entry) => entry !== moduleId),
    );
  }

  return (
    <div className="compare-calculator">
      <div className="compare-calculator-controls">
        <div className="compare-seat-row">
          <p className="eyebrow">Team size</p>
          <output aria-live="polite">
            <strong>{result.seats}</strong> people
          </output>
        </div>
        <Slider
          className="compare-slider"
          min={pricing.seats.min}
          max={pricing.seats.max}
          step={pricing.seats.step}
          value={[result.seats]}
          onValueChange={([next]) => setSeats(next)}
          thumbLabels={["Team size in seats"]}
        />
        <div className="compare-slider-scale" aria-hidden="true">
          <span>{pricing.seats.min}</span>
          <span>{pricing.seats.max}</span>
        </div>

        <fieldset className="compare-module-list">
          <legend className="eyebrow">{competitorName} modules to price</legend>
          {pricing.modules.map((module) => {
            const checkboxId = `${id}-${module.id}`;
            const checked = module.required || selected.includes(module.id);
            return (
              <div key={module.id} className="compare-module-option">
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={module.required}
                  onCheckedChange={(value) => toggle(module.id, value === true)}
                />
                <label htmlFor={checkboxId}>
                  <span>
                    {module.name}
                    {module.required ? <small> (always included)</small> : null}
                  </span>
                  <small>{module.covers}</small>
                </label>
                <strong>${module.pricePerSeatMonth}/seat/mo</strong>
              </div>
            );
          })}
        </fieldset>
        <p className="compare-calculator-fineprint">
          1:1s, updates and feedback come with any {competitorName} base product, so they add nothing here.
        </p>
      </div>

      <div className="compare-calculator-results">
        <div className="compare-price-card compare-price-card-competitor">
          <span className="eyebrow">{competitorName}, annual list price</span>
          <strong aria-live="polite">{formatUsd(result.annual)}</strong>
          <p>
            {result.seats} seats × {formatUsd(result.perSeatMonthly)} per seat per month × 12
            {result.minimumApplies ? ` = ${formatUsd(result.subtotal)}, raised to the minimum` : ""}
          </p>
          {result.minimumApplies ? (
            <Badge className="compare-minimum-badge">
              {formatUsd(pricing.annualMinimum)} annual minimum applies:{" "}
              {formatUsd(result.effectivePerSeatMonthly, { cents: true })} per seat per month
            </Badge>
          ) : breakEven ? (
            <p className="compare-calculator-fineprint">
              Below {breakEven} seats the {formatUsd(pricing.annualMinimum)} annual minimum applies.
            </p>
          ) : null}
        </div>

        <div className="compare-price-card compare-price-card-saasassin">
          <span className="eyebrow">{productName}, hosted</span>
          <strong>{formatUsd(0)}</strong>
          <p>No per-seat price and no minimum contract.</p>
        </div>

        <p className="compare-calculator-source">
          List price as of {pricing.asOf}, source{" "}
          <a href={pricing.sourceUrl} target="_blank" rel="noreferrer">
            {pricing.sourceLabel}
            <ArrowUpRight aria-hidden="true" size={13} />
          </a>
          . {pricing.billing} Discounts, multi-year terms and renewal increases aren&apos;t included.
        </p>
        <p className="compare-calculator-fineprint">
          Self-hosting: once the self-host guide ships, running {productName} yourself costs only your own
          Firebase and Vercel usage.
        </p>
      </div>
    </div>
  );
}
