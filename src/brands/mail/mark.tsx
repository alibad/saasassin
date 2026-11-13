import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Mail's mark: an envelope fold drawn as a fast chevron. Keep ../../app/apps/mail/icon.svg in step with it. */
export function MailMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <path d="M2.5 12.5H6" stroke={c[0]} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M3.8 18.5H6" stroke={c[0]} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="8.5" y="6.5" width="21" height="19" rx="3.6" fill={c[0]} />
          <path d="M11.2 10.8L19 17L26.8 10.8" stroke={c[2]} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    />
  );
}
