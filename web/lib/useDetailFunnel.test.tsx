// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDetailFunnel } from "./useDetailFunnel";

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("./track", () => ({ track: trackMock }));

let ioCallback: ((entries: Array<{ isIntersecting: boolean; target: Element }>) => void) | null = null;
class FakeIO {
  constructor(cb: typeof ioCallback) { ioCallback = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function Detail({ storeId }: { storeId: string }) {
  const ref = useRef<HTMLElement | null>(null);
  useDetailFunnel(storeId, "ko", ref);
  return (
    <article ref={ref}>
      <section className="worldcup-market-popular-menu">menu</section>
      <section className="worldcup-market-about-shop">about</section>
      <div className="worldcup-market-nearby-entry">nearby</div>
    </article>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  vi.stubGlobal("IntersectionObserver", FakeIO);
  trackMock.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useDetailFunnel", () => {
  it("logs each section once per store view", () => {
    const view = render(<Detail storeId="worldcup-market-23" />);
    const menu = view.container.querySelector(".worldcup-market-popular-menu")!;
    const about = view.container.querySelector(".worldcup-market-about-shop")!;
    ioCallback!([{ isIntersecting: true, target: menu }, { isIntersecting: false, target: about }]);
    ioCallback!([{ isIntersecting: true, target: menu }, { isIntersecting: true, target: about }]);
    const sections = trackMock.mock.calls.filter(([event]) => event === "section_view").map(([, input]) => input.src);
    expect(sections).toEqual(["menu", "location"]);
  });

  it("sends store_leave with dwell seconds on store change and on page hide, restarting on return", () => {
    const view = render(<Detail storeId="worldcup-market-23" />);
    vi.advanceTimersByTime(12_400);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(trackMock).toHaveBeenLastCalledWith("store_leave", expect.objectContaining({ storeId: "worldcup-market-23", dwellSec: 12 }));
    window.dispatchEvent(new Event("pagehide"));
    expect(trackMock.mock.calls.filter(([event]) => event === "store_leave")).toHaveLength(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5_000);
    view.rerender(<Detail storeId="worldcup-market-05" />);
    expect(trackMock).toHaveBeenLastCalledWith("store_leave", expect.objectContaining({ storeId: "worldcup-market-23", dwellSec: 5 }));
    view.unmount();
    expect(trackMock).toHaveBeenLastCalledWith("store_leave", expect.objectContaining({ storeId: "worldcup-market-05", dwellSec: 0 }));
  });
});
