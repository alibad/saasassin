import type { Brand } from "@/lib/brand/types";

/** Community's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "community",
  name: "Community",
  descriptor: "Spaces, events and courses for your members",
  description:
    "Give your members spaces, threads, events and courses, with real moderation, member privacy and a full export. Free and open source.",
  competitor: "Circle",
  defaultMode: "light",
  colors: {
    primary: "#7C3AED",
    primaryForeground: "#FFFFFF",
    accent: "#F472B6",
    canvas: "#FAF8FF",
    canvasDark: "#120C1F",
    ink: "#1E1433",
    mark: ["#7C3AED", "#F472B6", "#C4B5FD"],
    markDark: ["#B69CFB", "#F472B6", "#7C3AED"],
  },
  fonts: { heading: "Bricolage Grotesque", body: "Inter", headingWeight: 700 },
  keywords: ["community platform", "online community software", "member community", "community events", "Circle alternative"],
};
