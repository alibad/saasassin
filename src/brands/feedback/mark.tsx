import { MarkSvg } from "@/lib/brand/mark-svg";
import type { MarkProps } from "@/lib/brand/types";

/** Feedback's mark: an upvote chevron inside a speech bubble. Keep ../../app/apps/feedback/icon.svg in step with it. */
export function FeedbackMark(props: MarkProps) {
  return (
    <MarkSvg
      {...props}
      draw={(c) => (
        <>
          <path d="M8 4.5H23.5C26.3 4.5 28.5 6.7 28.5 9.5V19.5C28.5 22.3 26.3 24.5 23.5 24.5H15.2L9.2 29.2V24.5H8C5.2 24.5 3 22.3 3 19.5V9.5C3 6.7 5.2 4.5 8 4.5Z" fill={c[0]} />
          <path d="M10.4 17.6L15.8 12.2L21.2 17.6" stroke={c[2]} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="26.5" cy="5.5" r="3.6" fill={c[1]} />
        </>
      )}
    />
  );
}
