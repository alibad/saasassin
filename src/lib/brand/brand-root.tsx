"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { BrandMode, BrandModePreference, BrandSlug } from "./types";

type BrandModeContext = {
  slug: BrandSlug;
  /** The mode on screen right now. */
  mode: BrandMode;
  /** What the visitor chose; null until they choose, which means the brand's default. */
  preference: BrandModePreference | null;
  setPreference: (preference: BrandModePreference) => void;
};

const Context = createContext<BrandModeContext | null>(null);

/** The brand's mode and a setter. Works anywhere inside a product route. */
export function useBrandMode() {
  const value = useContext(Context);
  if (!value) throw new Error("useBrandMode must be used inside a BrandRoot");
  return value;
}

function storageKey(slug: BrandSlug) {
  return `brand-mode:${slug}`;
}

function resolveMode(preference: BrandModePreference | null, systemDark: boolean, fallback: BrandMode): BrandMode {
  if (preference === "light" || preference === "dark") return preference;
  if (preference === "system") return systemDark ? "dark" : "light";
  return fallback;
}

/**
 * Applies the visitor's saved mode before the first paint (the server renders the brand's
 * default). It runs once while the HTML is parsed; on client-side navigations it is inert and the
 * effect below does the same work. See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
function modeScript(slug: BrandSlug, fallback: BrandMode) {
  return `(function(){try{var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var p=localStorage.getItem(${JSON.stringify(storageKey(slug))});var m=p==="light"||p==="dark"?p:p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):${JSON.stringify(fallback)};r.setAttribute("data-mode",m);r.classList.toggle("dark",m==="dark");r.style.colorScheme=m}catch(e){}})()`;
}

function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * The root of every product route. It sets `data-brand` (which switches on the product's tokens
 * from `src/brands/<slug>/theme.css`), `data-mode` and the `dark` class, and the product's font
 * variables. While mounted it mirrors the same attributes and font classes onto `<html>`, so
 * dialogs, menus and popovers that portal to `<body>` are branded too.
 */
export function BrandRoot({
  slug,
  defaultMode,
  fontClassName,
  className,
  children,
}: {
  slug: BrandSlug;
  defaultMode: BrandMode;
  /** The `variable` class names of the product's `next/font` instances. */
  fontClassName: string;
  className?: string;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<BrandModePreference | null>(null);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    // Hydration rendered the default; the saved preference (already painted by the inline script)
    // only becomes React state here, so the first client render matches the server.
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey(slug));
    } catch {
      stored = null;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only state after hydration */
    setSystemDark(query.matches);
    if (stored === "light" || stored === "dark" || stored === "system") setPreferenceState(stored);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [slug]);

  const mode = resolveMode(preference, systemDark, defaultMode);

  useEffect(() => {
    const html = document.documentElement;
    const fontClasses = fontClassName.split(/\s+/).filter(Boolean);
    html.setAttribute("data-brand", slug);
    html.setAttribute("data-mode", mode);
    html.classList.toggle("dark", mode === "dark");
    html.classList.add(...fontClasses);
    html.style.colorScheme = mode;
    return () => {
      html.classList.remove(...fontClasses);
      if (html.getAttribute("data-brand") !== slug) return;
      html.removeAttribute("data-brand");
      html.removeAttribute("data-mode");
      html.classList.remove("dark");
      html.style.colorScheme = "";
    };
  }, [slug, mode, fontClassName]);

  const setPreference = useCallback(
    (next: BrandModePreference) => {
      setPreferenceState(next);
      try {
        window.localStorage.setItem(storageKey(slug), next);
      } catch {
        // Private windows can refuse storage; the choice still applies until the page closes.
      }
    },
    [slug],
  );

  const value = useMemo(() => ({ slug, mode, preference, setPreference }), [slug, mode, preference, setPreference]);

  return (
    <Context.Provider value={value}>
      <div
        data-brand={slug}
        data-mode={mode}
        className={cn("brand-root", fontClassName, mode === "dark" && "dark", className)}
        style={{ colorScheme: mode }}
        suppressHydrationWarning
      >
        <InlineScript html={modeScript(slug, defaultMode)} />
        {children}
      </div>
    </Context.Provider>
  );
}
