import { Instrument_Sans } from "next/font/google";

// Loaded only by this product's layout, so other products never download these files.
const bodyFont = Instrument_Sans({ subsets: ["latin"], variable: "--brand-font-body", display: "swap" });

/** Class names that define the --brand-font-* variables; BrandRoot applies them. */
export const fontClassName = [bodyFont.variable].join(" ");
