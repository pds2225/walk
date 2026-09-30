"use client";

import type { Locale } from "../lib/i18n";
import { documentedStorefrontEmbedUrl } from "../lib/mangwonStorefrontEmbed";
import type { MangwonStore } from "../lib/mangwonStores";

/**
 * Screen 02 calls this a storefront view, so a merely available corridor pano
 * is not enough. Until research confirms the frontage (or supplies a manual
 * heading), showing the generic nearest panorama would misrepresent another
 * storefront as the selected shop.
 */
function storefrontFramingVerified(store: MangwonStore): boolean {
  if (!store.streetView.available || !store.streetView.lastResolvedPanoId) return false;
  if (store.streetView.quality === "EXACT_FRONTAGE" || store.streetView.quality === "NEARBY_VISIBLE") return true;
  return store.streetView.headingOverride !== null;
}

export default function MangwonStorefront360({ store, locale }: {
  readonly store: MangwonStore;
  readonly locale: Locale;
}) {
  const target = store.streetViewLocation ?? store.navigationTarget;
  const heading = store.streetView.headingOverride ?? store.streetView.headingAuto ?? 0;
  const embedUrl = storefrontFramingVerified(store)
    ? documentedStorefrontEmbedUrl({
      panoId: store.streetView.lastResolvedPanoId ?? "",
      coordinate: target,
      heading,
      pitch: store.streetView.pitch ?? 0,
    })
    : null;

  if (!embedUrl) {
    return (
      <div className="mangwon-storefront-unavailable" role="status">
        <strong>{locale === "en" ? "Storefront view unavailable" : "사용 가능한 점포 정면뷰가 없습니다"}</strong>
        <span>{locale === "en" ? "You can still check the map and start the walking guide." : "지도와 K-Navi 도보안내는 계속 사용할 수 있습니다."}</span>
      </div>
    );
  }

  return (
    <div className="mangwon-storefront-embed-wrap">
      <iframe
        className="mangwon-storefront-embed"
        title={`${store.nameKo} Google Street View`}
        src={embedUrl}
        allow="fullscreen"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <span className="mangwon-storefront-provider">360° · Google Street View</span>
    </div>
  );
}
