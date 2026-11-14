// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import LocationStorageConsent from "./LocationStorageConsent";
import { getNavGeoConsent, getGeoConsent, setGeoConsent } from "../lib/wcmGeoConsent";

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
});
