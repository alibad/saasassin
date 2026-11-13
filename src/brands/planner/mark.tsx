import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Planner's mark: three time blocks stacked into a tick. Keep ../../app/apps/planner/icon.svg in step with it. */
export function PlannerMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <path d="M5.5 16.5L9.8 20.8" stroke={c[1]} strokeWidth="5" strokeLinecap="round" />
          <path d="M14.2 21.4L19.2 16.4" stroke={c[0]} strokeWidth="5" strokeLinecap="round" />
          <path d="M22.4 13.2L27 8.6" stroke={c[0]} strokeWidth="5" strokeLinecap="round" />
        </>
      )}
    />
  );
}
