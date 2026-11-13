import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Revenue's mark: waveform bars rising like a chart. Keep ../../app/apps/revenue/icon.svg in step with it. */
export function RevenueMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <rect x="2.6" y="20" width="3.8" height="8" rx="1.9" fill={c[0]} />
          <rect x="8.6" y="14" width="3.8" height="14" rx="1.9" fill={c[0]} />
          <rect x="14.6" y="17" width="3.8" height="11" rx="1.9" fill={c[0]} />
          <rect x="20.6" y="10" width="3.8" height="18" rx="1.9" fill={c[0]} />
          <rect x="26.6" y="3.5" width="3.8" height="24.5" rx="1.9" fill={c[1]} />
        </>
      )}
    />
  );
}
