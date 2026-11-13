import type { Brand } from "@/lib/brand/types";

/** Trust's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "trust",
  name: "Trust",
  descriptor: "Compliance readiness you can export",
  description:
    "Track SOC 2 and ISO 27001 controls, evidence that expires, policies, risks and vendors in a workspace you own and can export. Readiness tracking, not certification. Free and open source.",
  competitor: "Vanta",
  defaultMode: "light",
  colors: {
    primary: "#111827",
    primaryForeground: "#FFFFFF",
    accent: "#059669",
    canvas: "#FFFFFF",
    canvasDark: "#0B0F17",
    ink: "#111827",
    mark: ["#111827", "#059669", "#FFFFFF"],
    markDark: ["#E5E7EB", "#047857", "#0B0F17"],
  },
  fonts: { heading: "IBM Plex Sans", body: "IBM Plex Sans", mono: "IBM Plex Mono", headingWeight: 600 },
  keywords: ["SOC 2 readiness", "compliance tracking", "ISO 27001", "evidence management", "Vanta alternative"],
};
