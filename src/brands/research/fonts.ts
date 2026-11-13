import { Newsreader, Source_Sans_3 } from "next/font/google";

// Loaded only by this product's layout, so other products never download these files.
const headingFont = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--brand-font-heading", display: "swap" });
const bodyFont = Source_Sans_3({ subsets: ["latin"], variable: "--brand-font-body", display: "swap" });

/** Class names that define the --brand-font-* variables; BrandRoot applies them. */
export const fontClassName = [headingFont.variable, bodyFont.variable].join(" ");
