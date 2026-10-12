// NAVER Maps SDK는 지도 요소에 inline `position: relative` 를 넣는다. 지도 요소 크기를
// stylesheet 에서 !important 로 고정하지 않으면 높이 0px 로 접혀 메인 지도가 빈 회색
// 상자로 보인다(2026-10-12 k-navi.vercel.app/worldcup-market 회귀). 그 규칙을 지킨다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./worldcup-market-mobile-overrides.css", import.meta.url), "utf8");

function declarations(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} 규칙이 있어야 한다`).not.toBeNull();
  return new Map(match![1]!.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf(":");
    return [part.slice(0, index).trim(), part.slice(index + 1).trim().replace(/\s+/g, " ")] as const;
  }));
}

describe("월드컵시장 NAVER 지도 요소 크기", () => {
  it("SDK inline position:relative 가 덮어써도 지도 요소가 부모 크기를 가득 채운다", () => {
    const map = declarations(".worldcup-market-naver-map");
    expect(map.get("position")).toBe("absolute !important");
    expect(map.get("inset")).toBe("0");
    expect(map.get("width")).toBe("100% !important");
    expect(map.get("height")).toBe("100% !important");
  });

  it("점포 핀 오버레이는 지도 위에 쌓인다", () => {
    const map = declarations(".worldcup-market-naver-map");
    const overlay = declarations(".worldcup-market-map-overlay");
    expect(overlay.get("position")).toBe("absolute");
    expect(Number(overlay.get("z-index"))).toBeGreaterThan(Number(map.get("z-index")));
  });
});
