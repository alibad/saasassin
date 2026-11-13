import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Performance's mark: two leaves rising — growth. Keep ../../app/lattice/icon.svg in step with it. */
export function PerformanceMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <path d="M4.5 27.5C4.5 17.6 10.6 11.2 20.2 10.2C20.2 20 14.1 26.4 4.5 27.5Z" fill={c[0]} />
          <path d="M6.4 25.8L15.6 15.2" stroke={c[2]} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14.6 18.6C15.6 10.9 21 5.6 28 4.5C28 11.7 22.8 17.4 14.6 18.6Z" fill={c[1]} />
        </>
      )}
    />
  );
}
