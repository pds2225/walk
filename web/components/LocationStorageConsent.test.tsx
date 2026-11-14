// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LocationStorageConsent from "./LocationStorageConsent";
import { getNavGeoConsent, getGeoConsent, setGeoConsent, setNavGeoConsent } from "../lib/wcmGeoConsent";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.style.overflow = "";
  // Reset fail-closed session state between tests if it was triggered.
  setNavGeoConsent("no");
  window.localStorage.clear();
});

describe("K-Navi walking GPS consent modal", () => {
  it("shows a focused modal on the first attempt and continues navigation after refusal", () => {
    setGeoConsent("yes"); // Prior one-off storage consent must not authorize walking traces.
    const onResolved = vi.fn();
    render(<LocationStorageConsent locale="ko" mode="prompt" onResolved={onResolved} />);
    const dialog = screen.getByRole("dialog", { name: "보행 GPS 이동기록 저장" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("30초");
    expect(dialog.textContent).toContain("50m");
    expect(dialog.textContent).toContain("1년");
    expect(dialog.textContent).toContain("동의 안 함");
    expect(document.activeElement?.tagName).toBe("H2");
    expect(getNavGeoConsent()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이동기록 저장 거부·철회" }));
    expect(getNavGeoConsent()).toBe("no");
    expect(getGeoConsent()).toBe("yes");
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("persists agreement and reopens from the settings button for later withdrawal", () => {
    const onResolved = vi.fn();
    const gate = render(<LocationStorageConsent locale="ko" mode="prompt" onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: "이동기록 저장 동의" }));
    expect(getNavGeoConsent()).toBe("yes");
    expect(onResolved).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    gate.unmount();

    render(<LocationStorageConsent locale="ko" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: /GPS 이동기록 설정: 동의함/ });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("동의함");
    fireEvent.click(screen.getByRole("button", { name: "이동기록 저장 거부·철회" }));
    expect(getNavGeoConsent()).toBe("no");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /GPS 이동기록 설정: 동의 안 함/ })).toBeTruthy();
  });

  it("closes settings without changing saved consent", () => {
    setNavGeoConsent("yes");
    render(<LocationStorageConsent locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: /GPS 이동기록 설정: 동의함/ }));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(getNavGeoConsent()).toBe("yes");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape on initial modal declines storage, while Escape on settings keeps choice", () => {
    const onResolved = vi.fn();
    const gate = render(<LocationStorageConsent locale="ko" mode="prompt" onResolved={onResolved} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(getNavGeoConsent()).toBe("no");
    expect(onResolved).toHaveBeenCalledTimes(1);
    gate.unmount();

    render(<LocationStorageConsent locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: /GPS 이동기록 설정/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getNavGeoConsent()).toBe("no");
  });

  it("traps keyboard focus within the popup", () => {
    render(<LocationStorageConsent locale="ko" mode="prompt" />);
    const dialog = screen.getByRole("dialog");
    const actions = dialog.querySelectorAll("button");
    actions[actions.length - 1]!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(dialog.querySelector("a[href]"));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(actions[actions.length - 1]);
  });

  it("uses the existing consent copy and privacy link across all four languages", () => {
    for (const locale of ["ko", "en", "ja", "zh"] as const) {
      const view = render(<LocationStorageConsent locale={locale} mode="prompt" />);
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toMatch(/30|30秒|30초/);
      expect(dialog.querySelector('a[href="/worldcup-market/privacy"]')).not.toBeNull();
      expect(dialog.querySelectorAll("button")).toHaveLength(2);
      view.unmount();
    }
    expect(getNavGeoConsent()).toBeNull();
  });

  it("never accepts when browser consent storage is blocked", () => {
    const onResolved = vi.fn();
    render(<LocationStorageConsent locale="ko" mode="prompt" onResolved={onResolved} />);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "이동기록 저장 동의" }));
    expect(getNavGeoConsent()).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onResolved).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("fails closed on withdrawal even if localStorage refuses the write", () => {
    setNavGeoConsent("yes");
    render(<LocationStorageConsent locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: /GPS 이동기록 설정/ }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "이동기록 저장 거부·철회" }));
    expect(getNavGeoConsent()).toBe("no");
    expect(screen.getByRole("alert").textContent).toContain("철회");
    expect(screen.getByRole("dialog")).toBeTruthy();
    spy.mockRestore();
  });
});
