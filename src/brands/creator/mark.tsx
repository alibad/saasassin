import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Creator's mark: a play triangle opening like a book. Keep ../../app/apps/creator/icon.svg in step with it. */
export function CreatorMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <path d="M4 8.6L14.2 11.2V27L4 24.4V8.6Z" fill={c[1]} stroke={c[1]} strokeWidth="2" strokeLinejoin="round" />
          <path d="M17.2 7.6L28.6 17.3L17.2 27V7.6Z" fill={c[0]} stroke={c[0]} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
    />
  );
}
