import type { Brand } from "@/lib/brand/types";

/** Planner's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "planner",
  name: "Planner",
  descriptor: "Auto-scheduling you can explain",
  description:
    "Capture tasks, block your meetings and let a deterministic scheduler plan a realistic week, with a reason for every block and a lock for anything that must not move. Free and open source.",
  competitor: "Motion",
  defaultMode: "light",
  colors: {
    primary: "#C9440F",
    primaryForeground: "#FFFFFF",
    accent: "#18181B",
    canvas: "#F7F7F8",
    canvasDark: "#0E0E10",
    ink: "#18181B",
    mark: ["#F05A28", "#18181B", "#A1A1AA"],
    markDark: ["#FF7A45", "#EDEDEF", "#52525B"],
  },
  fonts: { heading: "Manrope", body: "Manrope", headingWeight: 750 },
  keywords: ["auto scheduling", "AI planner alternative", "task scheduler", "time blocking", "Motion alternative"],
};
