import {
  AlignLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  DoorOpen,
  LayoutGrid,
  ListChecks,
  ListTree,
  MousePointerClick,
  Plus,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Sample data for the preview: a fictional study, shown inside the product UI only. */
const blocks = [
  { icon: DoorOpen, label: "Welcome & consent", type: "Intro" },
  { icon: ListChecks, label: "How often do you order?", type: "Multiple choice" },
  { icon: SlidersHorizontal, label: "Rate checkout today", type: "Opinion scale 1–5" },
  { icon: ListTree, label: "Find the delivery address", type: "Tree test · 3 tasks", active: true },
  { icon: LayoutGrid, label: "Group the help topics", type: "Card sort" },
  { icon: AlignLeft, label: "Anything confusing?", type: "Open text" },
];

const tree = [
  { depth: 0, label: "Home", open: true },
  { depth: 1, label: "Account", open: true, firstClick: "61%" },
  { depth: 2, label: "Orders", open: true },
  { depth: 3, label: "Order details", correct: true },
  { depth: 3, label: "Returns" },
  { depth: 2, label: "Addresses", decoy: true },
  { depth: 1, label: "Help", firstClick: "22%" },
  { depth: 1, label: "Shop", firstClick: "17%" },
];

const outcomes = [
  { label: "Direct success", value: 58, className: "bg-primary" },
  { label: "Indirect success", value: 14, className: "bg-primary/45" },
  { label: "Failure", value: 21, className: "bg-brand-accent" },
  { label: "Skipped", value: 7, className: "bg-muted-foreground/30" },
];

/** The study builder: blocks on the left, a tree-test task in the middle, its results on the right. */
export function StudiesPreview() {
  return (
    <div className="bg-background text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3">
        <h3 className="brand-heading text-[15px]">Checkout navigation</h3>
        <Badge className="text-[10px]">Live · v3</Badge>
        <span className="text-[12px] text-muted-foreground tabular-nums">38 / 100 responses</span>
        <div className="ml-auto flex gap-1 rounded-md bg-muted p-0.5 text-[12px]">
          {["Build", "Results", "Findings", "Share"].map((tab, index) => (
            <span key={tab} className={cn("rounded px-2.5 py-1", index === 0 ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}>
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_256px]">
        <aside className="hidden border-r border-border bg-brand-subtle p-3 md:block">
          <ol className="grid gap-1">
            {blocks.map((block, index) => {
              const Icon = block.icon;
              return (
                <li
                  key={block.label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2",
                    block.active ? "bg-card shadow-xs ring-2 ring-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                      block.active ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[12.5px]", block.active && "font-semibold text-foreground")}>{block.label}</span>
                    <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <Icon className="size-3" aria-hidden="true" />
                      {block.type}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12px] text-muted-foreground">
            <Plus className="size-3.5" aria-hidden="true" />
            Add block
          </div>
        </aside>

        <section className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <ListTree className="size-3.5 text-primary" aria-hidden="true" />
            <span className="font-semibold text-foreground">Tree test</span>
            <span>· Task 2 of 3</span>
          </div>
          <p className="brand-heading mt-2 text-[18px] leading-snug">Where would you change the delivery address for an order you&rsquo;ve placed?</p>
          <div className="mt-5 rounded-lg border border-border bg-card p-3">
            <ul className="grid gap-0.5">
              {tree.map((item) => (
                <li
                  key={item.label}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md py-1 pr-2",
                    item.correct && "bg-primary/10 font-semibold text-primary",
                  )}
                  style={{ paddingLeft: `${8 + item.depth * 18}px` }}
                >
                  {item.open ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : item.correct || item.depth === 3 ? (
                    <span className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.correct ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10.5px]">
                      <CircleCheck className="size-3.5" aria-hidden="true" />
                      Correct
                    </span>
                  ) : item.firstClick ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <MousePointerClick className="size-3" aria-hidden="true" />
                      {item.firstClick} first click
                    </span>
                  ) : item.decoy ? (
                    <span className="ml-auto rounded-sm bg-accent px-1.5 text-[10.5px] text-accent-foreground">Top wrong pick</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10.5px]">If failed → skip to block 6</Badge>
            <Badge variant="outline" className="text-[10.5px]">Minimum time 4 s</Badge>
          </div>
        </section>

        <aside className="hidden border-l border-border bg-card p-5 lg:block">
          <p className="text-[11px] font-semibold text-muted-foreground">Task 2 results · 38 sessions</p>
          <div className="mt-4 grid gap-4">
            {[
              ["Success rate", 72],
              ["Directness", 58],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-muted-foreground">{label}</span>
                  <span className="brand-heading text-[22px] tabular-nums">{value}%</span>
                </div>
                <Progress value={Number(value)} className="mt-1.5 h-2" />
              </div>
            ))}
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-muted-foreground">Median time</span>
              <span className="brand-heading text-[22px] tabular-nums">24 s</span>
            </div>
          </div>
          <p className="mt-5 text-[11px] font-semibold text-muted-foreground">Outcomes</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
            {outcomes.map((outcome) => (
              <span key={outcome.label} className={outcome.className} style={{ width: `${outcome.value}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-1.5">
            {outcomes.map((outcome) => (
              <li key={outcome.label} className="flex items-center gap-2 text-[12px]">
                <span className={cn("size-2 rounded-full", outcome.className)} />
                <span className="text-muted-foreground">{outcome.label}</span>
                <span className="ml-auto tabular-nums">{outcome.value}%</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
