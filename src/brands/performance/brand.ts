import type { Brand } from "@/lib/brand/types";

/** Performance's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "performance",
  name: "Performance",
  descriptor: "Open-source performance reviews",
  description:
    "Run fair performance reviews — self, manager, peer and upward — with phases you can preview and undo, permissions you can inspect and one complete export. Free and open source.",
  competitor: "Lattice",
  defaultMode: "light",
  colors: {
    primary: "#1F6F4A",
    primaryForeground: "#FFFFFF",
    accent: "#F4A259",
    canvas: "#FBFAF7",
    canvasDark: "#0F1612",
    ink: "#1B2420",
    mark: ["#1F6F4A", "#F4A259", "#8CC4A6"],
    markDark: ["#5DC492", "#F4A259", "#2F6F50"],
  },
  fonts: { heading: "Fraunces", body: "Inter", headingWeight: 560 },
  keywords: ["performance reviews", "open-source performance management", "360 reviews", "review cycles", "Lattice alternative"],
};
