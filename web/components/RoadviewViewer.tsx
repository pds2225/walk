"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../lib/types";
import { getUiText, type Locale } from "../lib/i18n";
import { KakaoRoadviewAdapter, RoadviewError } from "../lib/roadview";

interface RoadviewViewerProps {
  readonly destination: Coordinate;
  readonly destinationName: string;
  readonly approachOrigin: Coordinate | null;
  readonly locale: Locale;
  readonly onClose: () => void;
}

type ViewerStatus = "loading" | "ready" | "unavailable";

export default function RoadviewViewer({
  destination,
  destinationName,
  approachOrigin,
  locale,
  onClose,
}: RoadviewViewerProps) {
  const ui = getUiText(locale);
  const container = useRef<HTMLDivElement | null>(null);
  const initialApproachOrigin = useRef(approachOrigin);
  const provider = useRef(new KakaoRoadviewAdapter());
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [failure, setFailure] = useState<"no_pano" | "unavailable" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setFailure(null);
    if (!container.current) return () => { cancelled = true; };

    void provider.current.open(container.current, destination, initialApproachOrigin.current)
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("unavailable");
        setFailure(error instanceof RoadviewError && error.reason === "no_pano" ? "no_pano" : "unavailable");
      });

    return () => {
      cancelled = true;
      container.current?.replaceChildren();
    };
  }, [destination.latitude, destination.longitude]);

  return (
    <section className="roadview-panel" aria-label={ui.roadviewTitle}>
      <div className="roadview-heading">
        <h2>{ui.roadviewTitle}</h2>
        <button type="button" onClick={onClose}>{ui.roadviewClose}</button>
      </div>
      <div className="roadview-frame">
        <div ref={container} className="roadview-container" aria-hidden={status !== "ready"} />
        {status === "loading" ? <p className="roadview-message" role="status">{ui.roadviewLoading}</p> : null}
        {status === "unavailable" ? (
          <div className="roadview-message" role="status">
            <p>{failure === "no_pano" ? ui.roadviewNoPano : ui.roadviewUnavailable}</p>
            <button type="button" onClick={onClose}>{ui.roadviewClose}</button>
          </div>
        ) : null}
        {status === "ready" ? <div className="roadview-destination" aria-label={ui.roadviewDestination(destinationName)}>
          <span aria-hidden="true">◆</span> {ui.roadviewDestination(destinationName)}
        </div> : null}
      </div>
    </section>
  );
}
