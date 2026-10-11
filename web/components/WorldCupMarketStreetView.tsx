"use client";

// Show recorded nearby panoramas or an availability-aware fallback.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { NaverPanoramaAdapter, type RoadviewSession } from "../lib/roadview";
import type { Coordinate } from "../lib/types";
import { localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { worldCupMarketWalkingEnabled } from "../lib/worldCupMarketFeatures";
import { documentedStreetViewEmbedUrl } from "../lib/worldCupMarketStreetView";
import type { WorldCupMarketStore } from "../lib/worldCupMarketStores";

/** Prefer a researched heading. North (0) is the fallback when none is stored. */
function streetViewHeading(store: WorldCupMarketStore): number {
  return store.streetView.headingOverride ?? store.streetView.headingAuto ?? 0;
}

function NaverMarketPanorama({ coordinate, recordedPanoId, title, locale, fallback }: {
  readonly coordinate: Coordinate;
  readonly recordedPanoId: string | null;
  readonly title: string;
  readonly locale: Locale;
  readonly fallback: ReactNode;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [panoChanged, setPanoChanged] = useState(false);
  const ui = getWorldCupMarketUiText(locale);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const adapter = new NaverPanoramaAdapter();
    let cancelled = false;
    let session: RoadviewSession | null = null;
    setStatus("loading");
    setPanoChanged(false);
    if (!adapter.isConfigured()) {
      setStatus("failed");
      return;
    }
    void adapter.open(host, { latitude: coordinate.latitude, longitude: coordinate.longitude }).then((opened) => {
      if (cancelled) {
        opened.close();
        return;
      }
      session = opened;
      setPanoChanged(Boolean(recordedPanoId && opened.panoId !== recordedPanoId));
      setStatus("ready");
    }).catch(() => {
      if (!cancelled) {
        host.replaceChildren();
        setStatus("failed");
      }
    });
    return () => {
      cancelled = true;
      session?.close();
      host.replaceChildren();
    };
  }, [coordinate.latitude, coordinate.longitude, recordedPanoId]);

  if (status === "failed") return fallback;
  return (
    <div className="worldcup-market-storefront-embed-wrap" aria-busy={status === "loading"}>
      <div
        ref={container}
        role="img"
        aria-label={`${title} NAVER Panorama`}
        data-panorama-provider="naver"
        style={{ width: "100%", height: "min(46dvh, 420px)", minHeight: 300, borderRadius: 16, overflow: "hidden" }}
      />
      {status === "loading" ? <span className="worldcup-market-storefront-provider" role="status">{ui.panoramaLoading}</span> : null}
      {status === "ready" ? (
        <span className="worldcup-market-storefront-provider">
          NAVER Panorama · {ui.storeStreetViewDescription}
          {panoChanged ? <span> {ui.panoramaUpdatedNotice}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

export default function WorldCupMarketStreetView({ store, locale }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const coordinate = store.streetViewLocation ?? store.storeLocation;
  const walkingEnabled = worldCupMarketWalkingEnabled();
  const fallback = (
    <div className="worldcup-market-storefront-unavailable" role="status">
      <strong>{ui.storefrontUnavailable}</strong>
      <span>{!walkingEnabled
        ? store.storeLocation ? ui.storefrontMapFallback : ui.storefrontLocationUnknown
        : store.storeLocation
        ? store.navigationTarget ? ui.storefrontFallback : ui.storefrontMapOnlyFallback
        : store.navigationTarget ? ui.storefrontWalkingOnlyFallback : ui.storefrontUnknownFallback}</span>
    </div>
  );
  if (store.streetView.provider === "NAVER") {
    return store.streetView.available && store.streetViewLocation ? (
      <NaverMarketPanorama
        key={`${store.id}:${store.streetViewLocation.latitude},${store.streetViewLocation.longitude}:${store.streetView.lastResolvedPanoId ?? ""}`}
        coordinate={store.streetViewLocation}
        recordedPanoId={store.streetView.lastResolvedPanoId}
        title={`${localizeStoreName(store, locale)} ${ui.storefrontTitle}`}
        locale={locale}
        fallback={fallback}
      />
    ) : fallback;
  }
  const embedUrl = store.streetView.available && coordinate
    ? documentedStreetViewEmbedUrl({
      panoId: store.streetView.lastResolvedPanoId,
      coordinate,
      heading: streetViewHeading(store),
      pitch: store.streetView.pitch,
    })
    : null;

  if (!embedUrl) {
    return fallback;
  }

  return (
    <div className="worldcup-market-storefront-embed-wrap">
      <iframe
        className="worldcup-market-storefront-embed"
        title={`${localizeStoreName(store, locale)} ${ui.storefrontTitle}`}
        src={embedUrl}
        allow="fullscreen"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <span className="worldcup-market-storefront-provider">{ui.storeStreetViewDescription}</span>
    </div>
  );
}
