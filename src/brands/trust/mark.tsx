import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Trust's mark: a shield with a check. Keep ../../app/apps/trust/icon.svg in step with it. */
export function TrustMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <g>
          <path d="M16 2.5L27 6.6V15.2C27 22 22.5 27.1 16 29.5C9.5 27.1 5 22 5 15.2V6.6L16 2.5Z" fill={c[0]} />
          <path d="M10.6 15.8L14.4 19.6L21.6 12" stroke={c[1]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    />
  );
}
