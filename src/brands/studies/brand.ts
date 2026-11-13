import type { Brand } from "@/lib/brand/types";

/** Studies's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "studies",
  name: "Studies",
  descriptor: "Unmoderated user research",
  description:
    "Build unmoderated studies — surveys, card sorts, tree tests and website tasks — share one link, and analyse every response with quality flags and evidence-backed findings. Free and open source.",
  competitor: "Maze",
  defaultMode: "light",
  colors: {
    primary: "#0270AD",
    primaryForeground: "#FFFFFF",
    accent: "#FB7185",
    canvas: "#FFFFFF",
    canvasDark: "#0A1520",
    ink: "#0F1E2E",
    mark: ["#0284C7", "#FB7185", "#7DD3FC"],
    markDark: ["#4CC3F7", "#FB7185", "#0284C7"],
  },
  fonts: { heading: "Space Grotesk", body: "Inter", headingWeight: 620 },
  keywords: ["unmoderated usability testing", "tree testing", "card sorting", "user research platform", "Maze alternative"],
};
