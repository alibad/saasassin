"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  nextStep,
  validateAnswer,
  type Answer,
  type Block,
  type CardSortAnswer,
  type ChoiceAnswer,
  type ScaleAnswer,
  type TextAnswer,
  type WebsiteTaskAnswer,
  type YesNoAnswer,
} from "@/lib/studies/model";

import { panel } from "./results-view";

export type PublicStudy = {
  studyId: string;
  tenantId: string;
  version: number;
  title: string;
  blocks: Block[];
  endMessage: string;
  open: boolean;
  closedReason: string | null;
};

type Session = { sessionId: string; token: string };
type Phase = "running" | "completed" | "screened_out";

function storageKey(study: PublicStudy) {
  return `studies:${study.tenantId}:${study.studyId}:v${study.version}`;
}

export function ParticipantRunner({ study }: { study: PublicStudy }) {
  const [currentId, setCurrentId] = useState(study.blocks[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [timings, setTimings] = useState<Record<string, number>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>("running");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const blockStartedAt = useRef<number>(0);
  const taskOpenedAt = useRef<number | null>(null);

  useEffect(() => {
    blockStartedAt.current = Date.now();
  }, [currentId]);

  // Resume an unfinished session in this browser tab (no PII stored, only the session token).
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey(study));
      if (!saved) return;
      const parsed = JSON.parse(saved) as { session: Session; answers: Record<string, unknown>; currentId: string; history: string[] };
      if (parsed.session && study.blocks.some((block) => block.id === parsed.currentId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from tab storage
        setSession(parsed.session);
        setAnswers(parsed.answers ?? {});
        setCurrentId(parsed.currentId);
        setHistory(parsed.history ?? []);
      }
    } catch {
      /* storage unavailable: start fresh */
    }
  }, [study]);

  function persist(next: { session: Session | null; answers: Record<string, unknown>; currentId: string; history: string[] } | null) {
    try {
      if (!next || !next.session) window.sessionStorage.removeItem(storageKey(study));
      else window.sessionStorage.setItem(storageKey(study), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  if (!study.open) {
    return (
      <div className={`${panel} grid gap-2 p-6`}>
        <h1 className="text-2xl font-semibold">{study.title}</h1>
        <p>{study.closedReason ?? "This study is not accepting responses."}</p>
      </div>
    );
  }

  if (phase !== "running") {
    return (
      <div className={`${panel} grid gap-3 p-6`} role="status">
        <CheckCircle2 className="size-8" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">
          {phase === "completed" ? "All done" : "Thanks for your interest"}
        </h1>
        <p>
          {phase === "completed"
            ? study.endMessage
            : "This study is looking for a different group of participants, so it ends here. Thank you for your time."}
        </p>
      </div>
    );
  }

  const index = study.blocks.findIndex((block) => block.id === currentId);
  const block = study.blocks[index];
  if (!block) return null;
  const progress = Math.round((index / study.blocks.length) * 100);

  function setAnswer(value: unknown) {
    setAnswers((previous) => ({ ...previous, [block.id]: value }));
    setError("");
  }

  async function call(path: string, body: unknown) {
    const response = await fetch(`/api/studies/public/${study.tenantId}/${study.studyId}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Something went wrong. Please try again.");
    return payload;
  }

  async function advance() {
    let raw = answers[block.id];
    if (block.type === "website_task" && raw) {
      const draft = raw as Partial<WebsiteTaskAnswer>;
      const started = taskOpenedAt.current ?? blockStartedAt.current;
      raw = { success: Boolean(draft.success), opened: taskOpenedAt.current !== null, durationMs: Math.max(0, Date.now() - started) };
    }
    if (block.type === "welcome" && raw === undefined) raw = { consented: false };
    const check = validateAnswer(block, raw);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let active = session;
      if (!active) {
        const started = await call("/sessions", {});
        active = { sessionId: started.sessionId, token: started.token };
        setSession(active);
      }
      // A skipped optional block is sent as null so the server walks past it; it recomputes the path itself.
      const nextAnswers: Record<string, unknown> = { ...answers, [block.id]: check.answer ?? null };
      const nextTimings = { ...timings, [block.id]: Date.now() - blockStartedAt.current };
      const step = nextStep(study.blocks, block.id, check.answer as Answer | null);
      const final = step.kind !== "block";
      const result = await call(`/sessions/${active.sessionId}`, {
        token: active.token,
        answers: nextAnswers,
        blockTimings: nextTimings,
        final,
      });
      setAnswers(nextAnswers);
      setTimings(nextTimings);
      taskOpenedAt.current = null;
      if (final) {
        setPhase(result.status === "screened_out" ? "screened_out" : "completed");
        persist(null);
      } else {
        const nextHistory = [...history, block.id];
        setHistory(nextHistory);
        setCurrentId(step.blockId);
        persist({ session: active, answers: nextAnswers, currentId: step.blockId, history: nextHistory });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{study.title}</span>
          <span className="tabular-nums text-[#555]">
            {index + 1} / {study.blocks.length}
          </span>
        </div>
        <Progress value={progress} aria-label="Study progress" />
      </div>

      <form
        className={`${panel} grid gap-5 p-5 sm:p-6`}
        onSubmit={(event) => {
          event.preventDefault();
          void advance();
        }}
      >
        <BlockInput block={block} value={answers[block.id]} onChange={setAnswer} onOpenTask={() => (taskOpenedAt.current = Date.now())} />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="min-w-32">
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {block.type === "welcome" ? "Start" : "Next"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
      <p className="flex items-center gap-2 text-xs text-[#555]">
        <ShieldCheck className="size-4" aria-hidden="true" /> Anonymous: no name, email or account is collected.
      </p>
    </div>
  );
}

function BlockInput({
  block,
  value,
  onChange,
  onOpenTask,
}: {
  block: Block;
  value: unknown;
  onChange: (value: unknown) => void;
  onOpenTask: () => void;
}) {
  const heading = (text: string, hint?: string) => (
    <div className="grid gap-1">
      <h1 className="break-words text-xl font-semibold sm:text-2xl">{text}</h1>
      {hint ? <p className="text-sm text-[#555]">{hint}</p> : null}
    </div>
  );
  const optional = "required" in block && !block.required ? "Optional" : undefined;

  switch (block.type) {
    case "welcome":
      return (
        <div className="grid gap-4">
          {heading(block.title)}
          {block.body ? <p className="whitespace-pre-wrap">{block.body}</p> : null}
          {block.consentRequired ? (
            <div className="flex items-start gap-3 border border-[#111] bg-white p-3">
              <Checkbox
                id="consent"
                checked={Boolean((value as { consented?: boolean } | undefined)?.consented)}
                onCheckedChange={(checked) => onChange({ consented: checked === true })}
              />
              <Label htmlFor="consent" className="leading-snug">
                {block.consentText}
              </Label>
            </div>
          ) : null}
        </div>
      );
    case "multiple_choice": {
      const selected = (value as ChoiceAnswer | undefined)?.selected ?? [];
      return (
        <fieldset className="grid gap-3">
          <legend className="mb-3">{heading(block.prompt, block.allowMultiple ? "Choose all that apply" : optional)}</legend>
          {block.allowMultiple ? (
            block.options.map((option) => (
              <div key={option.id} className="flex items-center gap-3 border border-[#111] bg-white p-3">
                <Checkbox
                  id={option.id}
                  checked={selected.includes(option.id)}
                  onCheckedChange={(checked) =>
                    onChange({
                      selected: checked ? [...selected, option.id] : selected.filter((item) => item !== option.id),
                    })
                  }
                />
                <Label htmlFor={option.id}>{option.label}</Label>
              </div>
            ))
          ) : (
            <RadioGroup value={selected[0] ?? ""} onValueChange={(next) => onChange({ selected: [next] })}>
              {block.options.map((option) => (
                <div key={option.id} className="flex items-center gap-3 border border-[#111] bg-white p-3">
                  <RadioGroupItem id={option.id} value={option.id} />
                  <Label htmlFor={option.id}>{option.label}</Label>
                </div>
              ))}
            </RadioGroup>
          )}
        </fieldset>
      );
    }
    case "opinion_scale": {
      const current = (value as ScaleAnswer | undefined)?.value;
      return (
        <fieldset className="grid gap-3">
          <legend className="mb-3">{heading(block.prompt, optional)}</legend>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${block.scale}, minmax(0, 1fr))` }}>
            {Array.from({ length: block.scale }, (_, step) => step + 1).map((step) => (
              <Button
                key={step}
                type="button"
                variant={current === step ? "default" : "outline"}
                aria-pressed={current === step}
                className="px-0"
                onClick={() => onChange({ value: step })}
              >
                {step}
              </Button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-[#555]">
            <span>{block.minLabel}</span>
            <span>{block.maxLabel}</span>
          </div>
        </fieldset>
      );
    }
    case "open_text":
      return (
        <div className="grid gap-3">
          {heading(block.prompt, optional)}
          <Textarea
            id={block.id}
            aria-label={block.prompt}
            rows={5}
            maxLength={block.maxLength}
            value={(value as TextAnswer | undefined)?.text ?? ""}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </div>
      );
    case "yes_no": {
      const current = (value as YesNoAnswer | undefined)?.value;
      return (
        <fieldset className="grid gap-3">
          <legend className="mb-3">{heading(block.prompt, optional)}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={current === option ? "default" : "outline"}
                aria-pressed={current === option}
                onClick={() => onChange({ value: option })}
              >
                {option === "yes" ? "Yes" : "No"}
              </Button>
            ))}
          </div>
        </fieldset>
      );
    }
    case "website_task": {
      const current = value as Partial<WebsiteTaskAnswer> | undefined;
      return (
        <div className="grid gap-4">
          {heading(block.prompt, "Open the website, try the task, then come back to this tab.")}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenTask();
              window.open(block.url, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="size-4" aria-hidden="true" /> Open {new URL(block.url).hostname}
          </Button>
          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium">{block.successQuestion}</legend>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((option) => (
                <Button
                  key={String(option)}
                  type="button"
                  variant={current?.success === option ? "default" : "outline"}
                  aria-pressed={current?.success === option}
                  onClick={() => onChange({ success: option, durationMs: 0, opened: false })}
                >
                  {option ? "Yes, I did it" : "No, I couldn't"}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
      );
    }
    case "card_sort": {
      const placements = (value as CardSortAnswer | undefined)?.placements ?? {};
      return (
        <div className="grid gap-4">
          {heading(block.prompt, `Choose a group for each of the ${block.cards.length} cards.`)}
          <ul className="grid gap-2">
            {block.cards.map((card) => (
              <li key={card.id} className="grid items-center gap-2 border border-[#111] bg-white p-3 sm:grid-cols-[1fr_14rem]">
                <span className="font-medium" id={`card-${card.id}`}>
                  {card.label}
                </span>
                <Select
                  value={placements[card.id] ?? ""}
                  onValueChange={(category) => onChange({ placements: { ...placements, [card.id]: category } })}
                >
                  <SelectTrigger aria-label={`Group for ${card.label}`} className="w-full">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {block.categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}
