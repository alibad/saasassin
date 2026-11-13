import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Studies's mark: a cursor landing on a target ring. Keep ../../app/apps/studies/icon.svg in step with it. */
export function StudiesMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <circle cx="13.5" cy="13.5" r="10.2" stroke={c[0]} strokeWidth="2.6" />
          <circle cx="13.5" cy="13.5" r="5.2" stroke={c[0]} strokeWidth="2.6" />
          <circle cx="13.5" cy="13.5" r="1.7" fill={c[0]} />
          <path d="M15.4 15.4L28.4 19.9L22.6 22.4L20 28.4L15.4 15.4Z" fill={c[1]} stroke={c[1]} strokeWidth="1.6" strokeLinejoin="round" />
        </>
      )}
    />
  );
}
