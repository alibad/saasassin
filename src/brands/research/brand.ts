import type { Brand } from "@/lib/brand/types";

/** Research's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "research",
  name: "Research",
  descriptor: "The customer research repository",
  description:
    "Keep interviews, consent, highlights and insights in one searchable repository where every insight links back to the exact words behind it. Free and open source.",
  competitor: "Dovetail",
  defaultMode: "light",
  colors: {
    primary: "#3346A8",
    primaryForeground: "#FFFFFF",
    accent: "#FFD84D",
    canvas: "#FAFAF7",
    canvasDark: "#0F111A",
    ink: "#1A1C2B",
    mark: ["#3346A8", "#FFD84D", "#1A1C2B"],
    markDark: ["#9AA6F2", "#FFD84D", "#E8E9F1"],
  },
  fonts: { heading: "Newsreader", body: "Source Sans 3", headingWeight: 500 },
  keywords: ["research repository", "user interview analysis", "customer insights", "open-source research tool", "Dovetail alternative"],
};
