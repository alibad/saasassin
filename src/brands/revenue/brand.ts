import type { Brand } from "@/lib/brand/types";

/** Revenue's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "revenue",
  name: "Revenue",
  descriptor: "Conversation intelligence for sales teams",
  description:
    "Log consented call transcripts against deals and get deterministic, evidence-linked analysis — talk ratio, trackers, next steps, deal risks — and a forecast built only from real deals. Free and open source.",
  competitor: "Gong",
  defaultMode: "light",
  colors: {
    primary: "#0B2545",
    primaryForeground: "#FFFFFF",
    accent: "#E3A008",
    canvas: "#F5F7FA",
    canvasDark: "#08111F",
    ink: "#0B1B33",
    mark: ["#0B2545", "#E3A008", "#3E6FB0"],
    markDark: ["#9DBBEA", "#E8B032", "#3E6FB0"],
  },
  fonts: { heading: "Sora", body: "Inter", headingWeight: 650 },
  keywords: ["conversation intelligence", "sales call analysis", "revenue intelligence", "deal risk", "Gong alternative"],
};
