import { useId, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A course's cover: a small painted scene picked from the course id and drawn in the brand's own
 * colours, so every course gets a distinct, stable cover without anyone uploading artwork. It
 * follows light and dark mode because it paints with the theme tokens.
 */
const VARIANTS = 5;

/** Scenes that suit a course's title, so covers say something; anything else falls back to a hash. */
const THEMES: Array<[RegExp, number]> = [
  [/\b(sky|skies|sunset|dusk|light|landscape|mountain|hill)/i, 0],
  [/\b(water|sea|ocean|river|lake|night|moon|harbou?r)/i, 1],
  [/\b(botanic|plant|leaf|leaves|garden|flower|herb|green)/i, 2],
  [/(colou?r|paint|ink|dye|mix|pigment)/i, 3],
  [/\b(air|cloud|weather|outdoor|travel|plein)/i, 4],
];

function pick(seed: string, title?: string) {
  const themed = title ? THEMES.find(([pattern]) => pattern.test(title)) : undefined;
  if (themed) return themed[1];
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % VARIANTS;
}

const fill = (token: string, opacity?: number): { style: CSSProperties } => ({ style: { fill: `var(${token})`, ...(opacity === undefined ? {} : { fillOpacity: opacity }) } });
const stop = (token: string, offset: string) => <stop offset={offset} style={{ stopColor: `var(${token})` }} />;

function Scene({ variant, id }: { variant: number; id: string }) {
  switch (variant) {
    case 0: // Sunset over hills
      return (
        <>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stop("--chart-4", "0")}{stop("--brand-accent", "1")}</linearGradient></defs>
          <rect width="400" height="250" fill={`url(#${id})`} />
          <circle cx="270" cy="128" r="54" {...fill("--brand-ink-foreground", 0.85)} />
          <path d="M0 170C70 130 140 140 210 168S330 196 400 160V250H0Z" {...fill("--chart-1", 0.9)} />
          <path d="M0 205C90 176 170 186 250 206S360 222 400 204V250H0Z" {...fill("--brand-ink")} />
        </>
      );
    case 1: // Moon on water
      return (
        <>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stop("--brand-ink", "0")}{stop("--chart-3", "1")}</linearGradient></defs>
          <rect width="400" height="250" fill={`url(#${id})`} />
          <circle cx="120" cy="86" r="38" {...fill("--brand-accent")} />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <rect key={row} x={70 + row * 6} y={150 + row * 16} width={100 - row * 12} height="4" rx="2" {...fill("--brand-accent", 0.75 - row * 0.1)} />
          ))}
          <path d="M0 140H400" style={{ stroke: "var(--chart-4)", strokeOpacity: 0.4, strokeWidth: 2 }} />
        </>
      );
    case 2: // Leaves
      return (
        <>
          <rect width="400" height="250" {...fill("--secondary")} />
          <circle cx="330" cy="40" r="90" {...fill("--brand-accent", 0.55)} />
          <path d="M60 250C70 170 120 110 210 80C190 160 140 220 60 250Z" {...fill("--chart-1", 0.85)} />
          <path d="M60 250C110 180 150 130 210 80" style={{ stroke: "var(--card)", strokeWidth: 3, fill: "none", strokeOpacity: 0.7 }} />
          <path d="M190 250C210 190 260 150 330 140C320 200 270 240 190 250Z" {...fill("--chart-3", 0.85)} />
          <path d="M150 250C140 200 110 170 60 160C70 210 100 240 150 250Z" {...fill("--chart-4", 0.8)} />
        </>
      );
    case 3: // Paint drops
      return (
        <>
          <rect width="400" height="250" {...fill("--accent")} />
          <circle cx="120" cy="110" r="80" {...fill("--chart-1", 0.75)} />
          <circle cx="230" cy="150" r="70" {...fill("--chart-2", 0.85)} />
          <circle cx="300" cy="80" r="52" {...fill("--chart-4", 0.7)} />
          <circle cx="190" cy="60" r="26" {...fill("--brand-ink", 0.85)} />
        </>
      );
    default: // Clouds
      return (
        <>
          <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1">{stop("--chart-1", "0")}{stop("--chart-5", "1")}</linearGradient></defs>
          <rect width="400" height="250" fill={`url(#${id})`} />
          <ellipse cx="110" cy="90" rx="70" ry="26" {...fill("--brand-ink-foreground", 0.8)} />
          <ellipse cx="150" cy="74" rx="44" ry="30" {...fill("--brand-ink-foreground", 0.8)} />
          <ellipse cx="290" cy="160" rx="84" ry="28" {...fill("--brand-ink-foreground", 0.55)} />
          <ellipse cx="320" cy="142" rx="46" ry="30" {...fill("--brand-ink-foreground", 0.55)} />
        </>
      );
  }
}

/** The cover art itself. Decorative: the course title is always written next to it. */
export function CourseCover({ seed, title, className, children }: { seed: string; title?: string; className?: string; children?: ReactNode }) {
  const id = `cover-${useId().replace(/:/g, "")}`;
  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
        <Scene variant={pick(seed, title)} id={id} />
      </svg>
      {children}
    </div>
  );
}
