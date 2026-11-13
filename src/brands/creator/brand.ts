import type { Brand } from "@/lib/brand/types";

/** Creator's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "creator",
  name: "Creator",
  descriptor: "Online courses you own",
  description:
    "Build courses with modules, lessons, quizzes and drip, publish a landing page and a catalog, enroll learners and track their progress, then export everything. Free and open source.",
  competitor: "Kajabi",
  defaultMode: "light",
  colors: {
    primary: "#A91EBB",
    primaryForeground: "#FFFFFF",
    accent: "#FDBA74",
    canvas: "#FFF9F3",
    canvasDark: "#170C1A",
    ink: "#2A1630",
    mark: ["#C026D3", "#FDBA74", "#7C1D8C"],
    markDark: ["#EC8BF9", "#FDBA74", "#C026D3"],
  },
  fonts: { heading: "DM Serif Display", body: "DM Sans", headingWeight: 400 },
  keywords: ["online course platform", "course builder", "open-source LMS", "creator platform", "Kajabi alternative"],
};
