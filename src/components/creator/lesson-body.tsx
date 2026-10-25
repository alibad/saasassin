import { Fragment, type ReactNode } from "react";

/**
 * A deliberately small markdown-ish renderer: headings (#, ##, ###), bullet and numbered
 * lists, paragraphs, **bold**, *italic*, `code` and [links](https://...). It builds React
 * elements only — no raw HTML is ever injected.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-neutral-100 px-1 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{label}</a>);
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function LessonBody({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      const key = `p-${blocks.length}`;
      blocks.push(<p key={key} className="leading-7">{renderInline(paragraph.join(" "), key)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const key = `l-${blocks.length}`;
      const items = list.items.map((item, i) => <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>);
      blocks.push(list.ordered
        ? <ol key={key} className="list-decimal space-y-1 pl-6">{items}</ol>
        : <ul key={key} className="list-disc space-y-1 pl-6">{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const key = `h-${blocks.length}`;
      const level = heading[1].length;
      const content = renderInline(heading[2], key);
      blocks.push(level === 1
        ? <h2 key={key} className="text-2xl font-bold">{content}</h2>
        : level === 2
          ? <h3 key={key} className="text-xl font-bold">{content}</h3>
          : <h4 key={key} className="text-lg font-semibold">{content}</h4>);
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();

  if (!blocks.length) return <p className="text-neutral-500">This lesson has no written content.</p>;
  return <div className="space-y-4 text-[15px] text-neutral-800">{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>;
}
