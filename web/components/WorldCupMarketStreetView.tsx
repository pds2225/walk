"use client";

import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import { documentedStreetViewEmbedUrl } from "../lib/worldCupMarketStreetView";
import type { WorldCupMarketStore } from "../lib/worldCupMarketStores";

/** Prefer a researched heading. North (0) is the fallback when none is stored. */
function streetViewHeading(store: WorldCupMarketStore): number {
  return store.streetView.headingOverride ?? store.streetView.headingAuto ?? 0;
}

export default function WorldCupMarketStreetView({ store, locale }: {
  readonly store: WorldCupMarketStore;
  readonly locale: Locale;
}) {
  const ui = getWorldCupMarketUiText(locale);
  const coordinate = store.storeLocation;
  const embedUrl = store.streetView.available && coordinate
    ? documentedStreetViewEmbedUrl({
      panoId: store.streetView.lastResolvedPanoId,
      coordinate,
      heading: streetViewHeading(store),
      pitch: store.streetView.pitch,
    })
    : null;

  if (!embedUrl) {
    return (
      <div className="worldcup-market-storefront-unavailable" role="status">
        <strong>{ui.storefrontUnavailable}</strong>
        <span>{ui.storefrontFallback}</span>
      </div>
    );
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
