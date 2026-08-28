import { describe, expect, it } from "vitest";
import { getUiText, localeToSpeechLanguage, speechForState, speechForTurn } from "./i18n";

describe("K-Navi localization", () => {
  it("provides primary navigation labels in all required locales", () => {
    for (const locale of ["ko", "en", "ja", "zh"] as const) {
      const ui = getUiText(locale);
      expect(ui.homeTitle).not.toBe("");
      expect(ui.destination).not.toBe("");
      expect(ui.startWalking).not.toBe("");
      expect(ui.stop).not.toBe("");
      expect(ui.state("on_route")).not.toBe("");
      expect(localeToSpeechLanguage(locale)).toMatch(/-/);
    }
  });

  it("uses the server turn description only for Korean and localized speech otherwise", () => {
    expect(speechForTurn("ko", "left", "횡단보도 뒤 좌회전")).toBe("횡단보도 뒤 좌회전");
    expect(speechForTurn("en", "left", "횡단보도 뒤 좌회전")).toBe("Turn left.");
    expect(speechForTurn("ja", "right")).toContain("右");
    expect(speechForTurn("zh", "right")).toContain("右");
  });

  it("keeps deviation speech distinct from the normal on-route state", () => {
    expect(speechForState("en", "deviated")).toContain("left the route");
    expect(speechForState("ja", "passed_turn")).toContain("通り過ぎ");
    expect(speechForState("zh", "drifting")).toContain("偏离");
  });
});
