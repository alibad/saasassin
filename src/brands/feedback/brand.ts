import type { Brand } from "@/lib/brand/types";

/** Feedback's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "feedback",
  name: "Feedback",
  descriptor: "Feedback boards, roadmap and changelog",
  description:
    "Collect ideas on public boards, let people vote once each, and close the loop with a public roadmap and changelog. Imports Canny CSV and exports Fider-compatible data. Free and open source.",
  competitor: "Canny",
  defaultMode: "light",
  colors: {
    primary: "#0A7A6E",
    primaryForeground: "#FFFFFF",
    accent: "#FDB022",
    canvas: "#FFFFFF",
    canvasDark: "#0B1716",
    ink: "#12302C",
    mark: ["#0E9384", "#FDB022", "#FFFFFF"],
    markDark: ["#3FD6C3", "#FDB022", "#04201C"],
  },
  fonts: { heading: "Plus Jakarta Sans", body: "Plus Jakarta Sans", headingWeight: 760 },
  keywords: ["feature request board", "product feedback tool", "public roadmap", "changelog", "Canny alternative"],
};
