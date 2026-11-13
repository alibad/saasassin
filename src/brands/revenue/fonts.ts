import { Inter, Sora } from "next/font/google";

// Loaded only by this product's layout, so other products never download these files.
const headingFont = Sora({ subsets: ["latin"], variable: "--brand-font-heading", display: "swap" });
const bodyFont = Inter({ subsets: ["latin"], variable: "--brand-font-body", display: "swap" });

/** Class names that define the --brand-font-* variables; BrandRoot applies them. */
export const fontClassName = [headingFont.variable, bodyFont.variable].join(" ");
