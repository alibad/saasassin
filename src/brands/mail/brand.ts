import type { Brand } from "@/lib/brand/types";

/** Mail's identity. Tokens: ./theme.css. Brief: docs/brand/products.md. */
export const brand: Brand = {
  slug: "mail",
  name: "Mail",
  descriptor: "Keyboard-first email",
  description:
    "Import your mail and triage it entirely from the keyboard: split inbox, snooze, follow-ups, filters, bulk actions with undo and fast search. Free and open source.",
  competitor: "Superhuman",
  defaultMode: "dark",
  colors: {
    primary: "#D1343A",
    primaryForeground: "#FFFFFF",
    accent: "#111113",
    canvas: "#FFFFFF",
    canvasDark: "#111113",
    ink: "#111113",
    mark: ["#E5484D", "#111113", "#FFFFFF"],
    markDark: ["#FF5C61", "#EDEDEF", "#111113"],
  },
  fonts: { heading: "Instrument Sans", body: "Instrument Sans", headingWeight: 600 },
  keywords: ["keyboard email client", "email triage", "split inbox", "open-source email", "Superhuman alternative"],
};
