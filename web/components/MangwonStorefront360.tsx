"use client";

import { getMangwonUiText, type Locale } from "../lib/i18n";
import { documentedStreetViewEmbedUrl } from "../lib/mangwonStorefrontEmbed";
import { localizeStoreName } from "../lib/mangwonStoreCopy";
import type { MangwonStore } from "../lib/mangwonStores";

/** Prefer a researched heading. North (0) is the fallback when none is stored. */
function streetViewHeading(store: MangwonStore): number {
  return store.streetView.headingOverride ?? store.streetView.headingAuto ?? 0;
}

export default function MangwonStorefront360({ store, locale }: {
  readonly store: MangwonStore;
  readonly locale: Locale;
}) {
  const ui = getMangwonUiText(locale);
  const embedUrl = store.streetView.available
    ? documentedStreetViewEmbedUrl({
      panoId: store.streetView.lastResolvedPanoId,
      coordinate: store.storeLocation,
      heading: streetViewHeading(store),
      pitch: store.streetView.pitch,
    })
    : null;

  if (!embedUrl) {
    return (
      <div className="mangwon-storefront-unavailable" role="status">
        <strong>{ui.storefrontUnavailable}</strong>
        <span>{ui.storefrontFallback}</span>
      </div>
    );
  }

  return (
    <div className="mangwon-storefront-embed-wrap">
      <iframe
        className="mangwon-storefront-embed"
        title={`${localizeStoreName(store, locale)} ${ui.storefrontTitle}`}
        src={embedUrl}
        allow="fullscreen"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <span className="mangwon-storefront-provider">{ui.storeStreetViewDescription}</span>
    </div>
  );
}
