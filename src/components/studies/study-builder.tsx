"use client";

import { ArrowDown, ArrowUp, Ban, GitBranch, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  answerKeysFor,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  blockTitle,
  defaultBlock,
  newId,
  type Block,
  type BlockType,
  type QuestionBlock,
  type StudyDraft,
} from "@/lib/studies/model";

import { panel } from "./results-view";

type Option = { id: string; label: string };

function answerLabel(block: Block, key: string) {
  if (block.type === "multiple_choice") return block.options.find((option) => option.id === key)?.label ?? key;
  if (block.type === "yes_no") return key === "yes" ? "Yes" : "No";
  if (block.type === "website_task") return key === "success" ? "Task succeeded" : "Task failed";
  return key;
}

function OptionList({
  label,
  items,
  prefix,
  onChange,
  disabled,
}: {
  label: string;
  items: Option[];
  prefix: string;
  onChange: (items: Option[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-2">
          <Input
            aria-label={`${label} ${index + 1}`}
            value={item.label}
            disabled={disabled}
            onChange={(event) => onChange(items.map((candidate) => (candidate.id === item.id ? { ...candidate, label: event.target.value } : candidate)))}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove ${item.label || "item"}`}
            disabled={disabled || items.length <= 2}
            onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={disabled}
        onClick={() => onChange([...items, { id: newId(prefix), label: `${label.replace(/s$/, "")} ${items.length + 1}` }])}
      >
        <Plus className="size-4" aria-hidden="true" /> Add
      </Button>
    </div>
  );
}

function LogicEditor({
  block,
  blocks,
  index,
  onChange,
  disabled,
}: {
  block: QuestionBlock;
  blocks: Block[];
  index: number;
  onChange: (block: Block) => void;
  disabled: boolean;
}) {
  const keys = answerKeysFor(block);
  if (!keys.length) return null;
  const later = blocks.slice(index + 1);
  return (
    <div className="grid gap-3 border border-dashed border-[#111] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="size-4" aria-hidden="true" /> Logic & screening
      </div>
      {block.logic.map((rule, ruleIndex) => (
        <div key={ruleIndex} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_auto_1fr_auto]">
          <span className="text-sm">If answer is</span>
          <Select
            value={rule.equals}
            disabled={disabled}
            onValueChange={(equals) => onChange({ ...block, logic: block.logic.map((item, i) => (i === ruleIndex ? { ...item, equals } : item)) })}
          >
            <SelectTrigger aria-label="Answer" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keys.map((key) => (
                <SelectItem key={key} value={key}>
                  {answerLabel(block, key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">skip to</span>
          <Select
            value={rule.goTo}
            disabled={disabled}
            onValueChange={(goTo) => onChange({ ...block, logic: block.logic.map((item, i) => (i === ruleIndex ? { ...item, goTo } : item)) })}
          >
            <SelectTrigger aria-label="Destination" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {later.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {blocks.indexOf(target) + 1}. {blockTitle(target).slice(0, 40)}
                </SelectItem>
              ))}
              <SelectItem value="end">End of study</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Remove rule"
            disabled={disabled}
            onClick={() => onChange({ ...block, logic: block.logic.filter((_, i) => i !== ruleIndex) })}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={disabled}
        onClick={() => onChange({ ...block, logic: [...block.logic, { equals: keys[0], goTo: later[0]?.id ?? "end" }] })}
      >
        <Plus className="size-4" aria-hidden="true" /> Add skip rule
      </Button>
      {block.type === "multiple_choice" || block.type === "yes_no" ? (
        <div className="grid gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Ban className="size-4" aria-hidden="true" /> Screener: end the study for participants who answer
          </span>
          <div className="flex flex-wrap gap-3">
            {keys.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={block.screenOut.includes(key)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...block,
                      screenOut: checked ? [...block.screenOut, key] : block.screenOut.filter((value) => value !== key),
                    })
                  }
                />
                {answerLabel(block, key)}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BlockFields({ block, onChange, disabled }: { block: Block; onChange: (block: Block) => void; disabled: boolean }) {
  const field = (id: string, text: string, input: React.ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{text}</Label>
      {input}
    </div>
  );
  if (block.type === "welcome") {
    return (
      <div className="grid gap-3">
        {field(`${block.id}-title`, "Title", <Input id={`${block.id}-title`} disabled={disabled} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />)}
        {field(`${block.id}-body`, "Introduction", <Textarea id={`${block.id}-body`} disabled={disabled} value={block.body} onChange={(e) => onChange({ ...block, body: e.target.value })} />)}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={block.consentRequired} disabled={disabled} onCheckedChange={(consentRequired) => onChange({ ...block, consentRequired })} />
          Require consent before starting
        </label>
        {block.consentRequired
          ? field(`${block.id}-consent`, "Consent statement", <Textarea id={`${block.id}-consent`} disabled={disabled} value={block.consentText} onChange={(e) => onChange({ ...block, consentText: e.target.value })} />)
          : null}
      </div>
    );
  }
  const common = (
    <>
      {field(
        `${block.id}-prompt`,
        block.type === "website_task" ? "Task instructions" : "Question",
        <Textarea id={`${block.id}-prompt`} rows={2} disabled={disabled} value={block.prompt} onChange={(e) => onChange({ ...block, prompt: e.target.value })} />,
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={block.required} disabled={disabled} onCheckedChange={(required) => onChange({ ...block, required })} />
        Required
      </label>
    </>
  );
  switch (block.type) {
    case "multiple_choice":
      return (
        <div className="grid gap-3">
          {common}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={block.allowMultiple} disabled={disabled} onCheckedChange={(allowMultiple) => onChange({ ...block, allowMultiple })} />
            Allow multiple answers
          </label>
          <OptionList label="Options" prefix="opt" items={block.options} disabled={disabled} onChange={(options) => onChange({ ...block, options })} />
        </div>
      );
    case "opinion_scale":
      return (
        <div className="grid gap-3">
          {common}
          <div className="grid gap-3 sm:grid-cols-3">
            {field(
              `${block.id}-scale`,
              "Scale",
              <Select value={String(block.scale)} disabled={disabled} onValueChange={(value) => onChange({ ...block, scale: value === "10" ? 10 : 5, logic: [] })}>
                <SelectTrigger id={`${block.id}-scale`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">1 – 5</SelectItem>
                  <SelectItem value="10">1 – 10</SelectItem>
                </SelectContent>
              </Select>,
            )}
            {field(`${block.id}-min`, "Low label", <Input id={`${block.id}-min`} disabled={disabled} value={block.minLabel} onChange={(e) => onChange({ ...block, minLabel: e.target.value })} />)}
            {field(`${block.id}-max`, "High label", <Input id={`${block.id}-max`} disabled={disabled} value={block.maxLabel} onChange={(e) => onChange({ ...block, maxLabel: e.target.value })} />)}
          </div>
        </div>
      );
    case "open_text":
    case "yes_no":
      return <div className="grid gap-3">{common}</div>;
    case "website_task":
      return (
        <div className="grid gap-3">
          {common}
          {field(`${block.id}-url`, "Website URL", <Input id={`${block.id}-url`} type="url" disabled={disabled} value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />)}
          {field(`${block.id}-success`, "Success question", <Input id={`${block.id}-success`} disabled={disabled} value={block.successQuestion} onChange={(e) => onChange({ ...block, successQuestion: e.target.value })} />)}
          <p className="text-xs text-[#555]">Time on task is measured from when the participant opens the site until they answer.</p>
        </div>
      );
    case "card_sort":
      return (
        <div className="grid gap-3">
          {common}
          <div className="grid gap-4 sm:grid-cols-2">
            <OptionList label="Cards" prefix="card" items={block.cards} disabled={disabled} onChange={(cards) => onChange({ ...block, cards })} />
            <OptionList label="Categories" prefix="cat" items={block.categories} disabled={disabled} onChange={(categories) => onChange({ ...block, categories })} />
          </div>
        </div>
      );
  }
}

export function StudyBuilder({
  draft,
  onChange,
  locked,
}: {
  draft: StudyDraft;
  onChange: (draft: StudyDraft) => void;
  locked: boolean;
}) {
  const { blocks } = draft;
  const setBlocks = (next: Block[]) => onChange({ ...draft, blocks: next });
  const replace = (index: number, block: Block) => setBlocks(blocks.map((candidate, i) => (i === index ? block : candidate)));
  const move = (index: number, delta: number) => {
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setBlocks(next);
  };
  const addable = BLOCK_TYPES.filter((type) => type !== "welcome" || !blocks.some((block) => block.type === "welcome"));
  const add = (type: BlockType) => {
    const block = defaultBlock(type);
    setBlocks(type === "welcome" ? [block, ...blocks] : [...blocks, block]);
  };

  return (
    <div className="grid gap-4">
      <div className={`${panel} grid gap-3 p-4`}>
        <div className="grid gap-1.5">
          <Label htmlFor="study-title">Study title</Label>
          <Input id="study-title" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="study-description">Internal description</Label>
          <Textarea id="study-description" rows={2} value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="study-cap">Participant cap</Label>
            <Input
              id="study-cap"
              type="number"
              min={1}
              placeholder="No cap"
              value={draft.settings.participantCap ?? ""}
              onChange={(e) =>
                onChange({ ...draft, settings: { ...draft.settings, participantCap: e.target.value ? Math.max(1, Number(e.target.value)) : null } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="study-close">Close automatically at</Label>
            <Input
              id="study-close"
              type="datetime-local"
              value={draft.settings.closeAt ? toLocalInput(draft.settings.closeAt) : ""}
              onChange={(e) =>
                onChange({ ...draft, settings: { ...draft.settings, closeAt: e.target.value ? new Date(e.target.value).toISOString() : null } })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="study-end">Thank-you message</Label>
            <Input
              id="study-end"
              value={draft.settings.endMessage}
              onChange={(e) => onChange({ ...draft, settings: { ...draft.settings, endMessage: e.target.value } })}
            />
          </div>
        </div>
      </div>

      {locked ? (
        <p className="border-2 border-[#111] bg-[#ffbd2e] p-3 text-sm font-medium">
          Blocks are frozen because this study was published. Duplicate it to change the questions; title, cap and close date can still change.
        </p>
      ) : null}

      {blocks.length === 0 ? (
        <div className={`${panel} p-6 text-center text-sm`}>
          Start with a welcome & consent screen, then add questions, a website task or a card sort.
        </div>
      ) : null}

      <ol className="grid gap-4">
        {blocks.map((block, index) => (
          <li key={block.id} className={`${panel} grid gap-3 p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">
                {index + 1} · {BLOCK_TYPE_LABELS[block.type]}
              </Badge>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="icon" aria-label="Move up" disabled={locked || index === 0 || block.type === "welcome" || blocks[index - 1]?.type === "welcome"} onClick={() => move(index, -1)}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Move down" disabled={locked || index === blocks.length - 1 || block.type === "welcome"} onClick={() => move(index, 1)}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Remove block" disabled={locked} onClick={() => setBlocks(blocks.filter((_, i) => i !== index))}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <BlockFields block={block} disabled={locked} onChange={(next) => replace(index, next)} />
            {block.type !== "welcome" ? (
              <LogicEditor block={block} blocks={blocks} index={index} disabled={locked} onChange={(next) => replace(index, next)} />
            ) : null}
          </li>
        ))}
      </ol>

      {!locked ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="justify-self-start">
              <Plus className="size-4" aria-hidden="true" /> Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addable.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => add(type)}>
                {BLOCK_TYPE_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
