"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "../lib/types";
import { getUiText, type Locale } from "../lib/i18n";
import { RoadviewError } from "../lib/roadview";
import type { RoadviewProvider, RoadviewSession } from "../lib/roadview";
import { selectRoadviewProvider } from "../lib/roadviewProviders";

interface RoadviewViewerProps {
  readonly destination: Coordinate;
  readonly destinationName: string;
  readonly approachOrigin: Coordinate | null;
  readonly locale: Locale;
  /**
   * navigation 세션 시작 때 고정된 provider. 뷰어를 닫았다 다시 열어도 같은
   * provider 를 써야 하므로 세션을 소유한 화면이 넘겨준다. 없으면(단독 사용)
   * 이 뷰어가 mount 시점에 한 번 고른다.
   */
  readonly provider?: RoadviewProvider | null;
  readonly onClose: () => void;
}

type ViewerStatus = "loading" | "ready" | "unavailable";

export default function RoadviewViewer({
  destination,
  destinationName,
  approachOrigin,
  locale,
  provider,
  onClose,
}: RoadviewViewerProps) {
  const ui = getUiText(locale);
  const container = useRef<HTMLDivElement | null>(null);
  const initialApproachOrigin = useRef(approachOrigin);
  // mount 이후에는 provider 를 다시 고르지 않는다 — 한 세션 = 한 provider.
  const pinnedProvider = useRef<RoadviewProvider | null>(provider ?? null);
  pinnedProvider.current ??= selectRoadviewProvider();
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [failure, setFailure] = useState<"no_pano" | "unavailable" | null>(null);

  useEffect(() => {
    let cancelled = false;
    let session: RoadviewSession | null = null;
    setStatus("loading");
    setFailure(null);
    const active = pinnedProvider.current;
    if (!container.current || !active) return () => { cancelled = true; };

    void active.open(container.current, destination, initialApproachOrigin.current)
      .then((opened) => {
        session = opened;
        if (cancelled) {
          opened.close();
          return;
        }
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("unavailable");
        setFailure(error instanceof RoadviewError && error.reason === "no_pano" ? "no_pano" : "unavailable");
      });

    return () => {
      cancelled = true;
      // 세션이 열렸으면 provider 가 스스로 정리하게 한다. 아직 안 열렸으면
      // SDK 가 남긴 DOM 만 걷어낸다.
      if (session) session.close();
      else container.current?.replaceChildren();
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
