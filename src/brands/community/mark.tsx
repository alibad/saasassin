import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Community's mark: three people around a table. Keep ../../app/apps/community/icon.svg in step with it. */
export function CommunityMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <g>
          <circle cx="16" cy="17.5" r="6" fill={c[2]} />
          <circle cx="16" cy="5.8" r="4.3" fill={c[0]} />
          <circle cx="26" cy="23.4" r="4.3" fill={c[1]} />
          <circle cx="6" cy="23.4" r="4.3" fill={c[0]} />
        </g>
      )}
    />
  );
}
