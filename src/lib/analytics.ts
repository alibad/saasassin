"use client";

import posthog from "posthog-js";

type AnalyticsProperties = Record<string, boolean | number | string | null | undefined>;

export function captureAnalytics(event: string, properties: AnalyticsProperties = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    return;
  }

  posthog.capture(event, properties);
}
