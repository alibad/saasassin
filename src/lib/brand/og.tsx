import type { ReactNode } from "react";
import { ImageResponse } from "next/og";

import { brandOrigin } from "./metadata";
import type { Brand } from "./types";

export const OG_SIZE = { width: 1200, height: 630 };
export const APPLE_ICON_SIZE = { width: 180, height: 180 };

type MarkRenderer = (size: number, colors: readonly [string, string, string]) => ReactNode;

/**
 * Fetches one weight of a Google font as TrueType for next/og, subset to `text`. Returns null
 * when Google Fonts is unreachable, in which case the image falls back to next/og's own font.
 */
async function loadGoogleFont(family: string, weight: number, text: string) {
  try {
    const query = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}`).then((r) => r.text());
    const source = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!source) return null;
    const response = await fetch(source);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function surface(brand: Brand) {
  const dark = brand.defaultMode === "dark";
  return {
    dark,
    background: dark ? brand.colors.canvasDark : brand.colors.canvas,
    ink: dark ? "#EDEDEF" : brand.colors.ink,
    mark: dark ? brand.colors.markDark : brand.colors.mark,
  };
}

/** The product's 1200×630 social card: mark, name in the display face, what it does. */
export async function brandOgImage(brand: Brand, renderMark: MarkRenderer) {
  const { dark, background, ink, mark } = surface(brand);
  const host = brandOrigin(brand).replace(/^https?:\/\//, "");
  const footer = `Free and open source · AGPL-3.0`;
  const headingText = `${brand.name}${brand.descriptor}`;
  const bodyText = `${brand.descriptor}${footer}${host}`;
  const [heading, body] = await Promise.all([
    loadGoogleFont(brand.fonts.heading, brand.fonts.headingWeight, headingText),
    loadGoogleFont(brand.fonts.body, 500, bodyText),
  ]);
  const fonts = [
    heading && { name: "Heading", data: heading, weight: 600 as const, style: "normal" as const },
    body && { name: "Body", data: body, weight: 500 as const, style: "normal" as const },
  ].filter((font): font is NonNullable<typeof font> => Boolean(font));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background,
          color: ink,
          fontFamily: body ? "Body" : undefined,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", right: -120, top: -60, display: "flex", opacity: dark ? 0.9 : 1 }}>
          {renderMark(620, mark)}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: `linear-gradient(90deg, ${background} 0%, ${background} 46%, ${background}00 78%)`,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {renderMark(76, mark)}
            <div style={{ display: "flex", fontSize: 64, fontFamily: heading ? "Heading" : undefined, letterSpacing: "-0.02em" }}>
              {brand.name}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 680 }}>
            <div
              style={{
                display: "flex",
                fontSize: 66,
                lineHeight: 1.05,
                fontFamily: heading ? "Heading" : undefined,
                letterSpacing: "-0.03em",
              }}
            >
              {brand.descriptor}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 26, opacity: 0.78 }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, background: mark[0] }} />
            <div style={{ display: "flex" }}>{footer}</div>
            <div style={{ display: "flex", opacity: 0.6 }}>·</div>
            <div style={{ display: "flex" }}>{host}</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

/** A 180×180 home-screen icon: the mark on the product's canvas. */
export function brandAppleIcon(brand: Brand, renderMark: MarkRenderer) {
  const { background, mark } = surface(brand);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background }}>
        {renderMark(128, mark)}
      </div>
    ),
    APPLE_ICON_SIZE,
  );
}
