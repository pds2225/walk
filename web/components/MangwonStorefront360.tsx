"use client";

import type { Locale } from "../lib/i18n";
import type { MangwonStore } from "../lib/mangwonStores";
import { createRoadviewProvider } from "../lib/roadviewProviders";
import RoadviewViewer from "./RoadviewViewer";

const GOOGLE_PROVIDER = createRoadviewProvider("google");

function storefrontEmbedUrl(store: MangwonStore): string | null {
  const panoId = store.streetView.lastResolvedPanoId;
  if (!panoId) return null;
  const target = store.streetViewLocation ?? store.navigationTarget;
  const heading = store.streetView.headingOverride ?? store.streetView.headingAuto ?? 0;
  const pitch = store.streetView.pitch ?? 0;
  const pb = [
    "!4v0",
    "!6m8",
    "!1m7",
    `!1s${panoId}`,
    "!2m2",
    `!1d${target.longitude}`,
    `!2d${target.latitude}`,
    `!3f${Math.round(heading)}`,
    `!4f${Math.round(pitch)}`,
    "!5f0",
  ].join("");
  return `https://www.google.com/maps/embed?pb=${pb}`;
}

function isUsable(store: MangwonStore): boolean {
  return store.streetView.available
    && store.streetView.quality !== "NOT_AVAILABLE"
    && store.streetView.quality !== "AVAILABLE_BUT_NOT_USEFUL";
}

export default function MangwonStorefront360({ store, locale }: {
  readonly store: MangwonStore;
  readonly locale: Locale;
}) {
  if (!isUsable(store)) {
    return (
      <div className="mangwon-storefront-unavailable" role="status">
        <strong>{locale === "en" ? "Storefront view unavailable" : "사용 가능한 점포 정면뷰가 없습니다"}</strong>
        <span>{locale === "en" ? "You can still check the map and start the walking guide." : "지도와 K-Navi 도보안내는 계속 사용할 수 있습니다."}</span>
      </div>
    );
  }

  const embedUrl = storefrontEmbedUrl(store);
  if (embedUrl) {
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

  const target = store.streetViewLocation ?? store.navigationTarget;
  return (
    <RoadviewViewer
      key={`streetview-${store.id}`}
      destination={target}
      destinationName={store.nameKo}
      approachOrigin={null}
      embedPanoId={null}
      locale={locale}
      provider={GOOGLE_PROVIDER}
      onClose={() => undefined}
      title={locale === "en" ? "Storefront 360" : "점포 앞 360"}
      showCloseButton={false}
    />
  );
}
