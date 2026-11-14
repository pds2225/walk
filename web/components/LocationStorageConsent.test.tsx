// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import LocationStorageConsent from "./LocationStorageConsent";
import { getNavGeoConsent, getGeoConsent, setGeoConsent, setNavGeoConsent } from "../lib/wcmGeoConsent";

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("walking GPS storage consent UI", () => {
  it("requires a separate explicit action and permits withdrawal during navigation", () => {
    setGeoConsent("yes");
    const view = render(<LocationStorageConsent locale="ko" />);
    expect(getNavGeoConsent()).toBeNull();
    expect(view.container.textContent).toContain("30초");
    expect(view.container.textContent).toContain("50m");
    expect(view.container.textContent).toContain("1년");
    const buttons = view.container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    expect(getNavGeoConsent()).toBe("yes");
    fireEvent.click(buttons[1]!);
    expect(getNavGeoConsent()).toBe("no");
    expect(getGeoConsent()).toBe("yes"); // The pre-existing one-off preference is untouched.
  });

  it("offers 4 languages, a working privacy link and never opts in on mount", () => {
    for (const locale of ["ko", "en", "ja", "zh"] as const) {
      const view = render(<LocationStorageConsent locale={locale} />);
      expect(getNavGeoConsent()).toBeNull();
      const link = view.container.querySelector('a[href="/worldcup-market/privacy"]');
      expect(link).not.toBeNull();
      expect(view.container.querySelectorAll("button")).toHaveLength(2);
      view.unmount();
    }
  });
  it("reports blocked browser storage instead of falsely confirming GPS consent", () => {
    const view = render(<LocationStorageConsent locale="ko" />);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(view.container.querySelectorAll("button")[0]!);
    expect(getNavGeoConsent()).toBeNull();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("저장하지 못했습니다");
    expect(view.container.textContent).toContain("동의 안 함");
    spy.mockRestore();
  });

  it("fails closed on consent withdrawal even when browser refuses to save the revocation", () => {
    setNavGeoConsent("yes");
    const view = render(<LocationStorageConsent locale="ko" />);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(view.container.querySelectorAll("button")[1]!);
    expect(getNavGeoConsent()).toBe("no");
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("철회");
    spy.mockRestore();
    setNavGeoConsent("yes"); // reset session-only emergency opt-out for isolated tests
  });

});
