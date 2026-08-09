import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function pathOnly(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}

if (token && host) {
  posthog.init(token, {
    api_host: host,
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    cookieless_mode: "always",
    person_profiles: "never",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_exceptions: false,
    disable_session_recording: true,
    before_send(event) {
      if (event?.properties) {
        event.properties.$current_url = pathOnly(event.properties.$current_url);
        event.properties.$referrer = undefined;
        event.properties.$referring_domain = undefined;
      }
      return event;
    },
  });
}
