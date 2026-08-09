import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/app-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description:
      "A coordinated catalog and roadmap for open-source SaaS displacement.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#11110f",
    icons: [
      { src: "/icon.png", sizes: "1254x1254", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
