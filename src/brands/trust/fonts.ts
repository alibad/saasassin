import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// Loaded only by this product's layout, so other products never download these files.
const bodyFont = IBM_Plex_Sans({ subsets: ["latin"], variable: "--brand-font-body", display: "swap" });
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--brand-font-mono", display: "swap" });

/** Class names that define the --brand-font-* variables; BrandRoot applies them. */
export const fontClassName = [bodyFont.variable, monoFont.variable].join(" ");
