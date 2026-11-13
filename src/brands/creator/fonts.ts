import { DM_Sans, DM_Serif_Display } from "next/font/google";

// Loaded only by this product's layout, so other products never download these files.
const headingFont = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--brand-font-heading", display: "swap" });
const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--brand-font-body", display: "swap" });

/** Class names that define the --brand-font-* variables; BrandRoot applies them. */
export const fontClassName = [headingFont.variable, bodyFont.variable].join(" ");
