import { Fragment, isValidElement, type ReactNode } from "react";

import { MARK_TOKENS, type MarkProps } from "./types";

/**
 * The 32×32 frame every brand mark draws in. Works in the DOM (colours default to the brand's
 * --mark-* tokens) and inside next/og ImageResponse (pass hex `colors`).
 */
export function MarkSvg({
  size = 32,
  className,
  title,
  colors,
  draw,
}: MarkProps & { draw: (c: readonly [string, string, string]) => ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {shapes(draw(colors ?? MARK_TOKENS))}
    </svg>
  );
}

/** next/og cannot serialise a Fragment inside <svg>, so a fragment's children are passed through. */
function shapes(drawn: ReactNode): ReactNode {
  if (isValidElement<{ children?: ReactNode }>(drawn) && drawn.type === Fragment) return drawn.props.children;
  return drawn;
}
