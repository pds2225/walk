"use client";
import { useEffect, type RefObject } from "react";
import { DETAIL_SECTIONS, type DetailSection } from "./funnelEvents";
import { track } from "./track";

/** CSS selector of each tracked section inside the store detail. */
export const DETAIL_SECTION_SELECTORS: Record<DetailSection, string> = {
  menu: ".worldcup-market-popular-menu",
  location: ".worldcup-market-about-shop",
  nearby: ".worldcup-market-nearby-entry",
};

/**
 * Store detail funnel: section_view once per section per mount (= per store_view),
 * and store_leave with dwell seconds when the detail unmounts (store change, back,
 * nearby) or the page is hidden. A hidden→visible return starts a new segment,
 * so dwell is the sum of store_leave rows per session+store.
 */
export function useDetailFunnel(storeId: string, locale: string, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    const seen = new Set<DetailSection>();
    let observer: IntersectionObserver | null = null;
    if (container && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const section = (entry.target as HTMLElement).dataset["funnelSection"] as DetailSection | undefined;
          if (!section || seen.has(section)) continue;
          seen.add(section);
          track("section_view", { storeId, locale, src: section });
          observer?.unobserve(entry.target);
        }
      }, { threshold: 0.4 });
      for (const section of DETAIL_SECTIONS) {
        const element = container.querySelector<HTMLElement>(DETAIL_SECTION_SELECTORS[section]);
        if (!element) continue;
        element.dataset["funnelSection"] = section;
        observer.observe(element);
      }
    }

    let start: number | null = Date.now();
    const leave = () => {
      if (start === null) return;
      track("store_leave", { storeId, locale, dwellSec: Math.round((Date.now() - start) / 1000) });
      start = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
      else if (start === null) start = Date.now();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
    // locale is read at event time; a language switch must not end the visit.
  }, [storeId, containerRef]);
}
