import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Research's mark: a closing quotation mark over a highlighter stroke. Keep ../../app/apps/research/icon.svg in step with it. */
export function ResearchMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <rect x="2.5" y="16.5" width="27" height="9" rx="2.5" transform="rotate(-7 16 21)" fill={c[1]} />
          <circle cx="10.5" cy="11.5" r="4.6" fill={c[0]} />
          <path d="M15 12C15 17.6 12.6 21.3 8.2 23.4" stroke={c[0]} strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="22" cy="11.5" r="4.6" fill={c[0]} />
          <path d="M26.5 12C26.5 17.6 24.1 21.3 19.7 23.4" stroke={c[0]} strokeWidth="3.2" strokeLinecap="round" />
        </>
      )}
    />
  );
}
