import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("/worldcup-market metadata", () => {
  it("carries the K-Trip title, description and OG tags", () => {
    expect(metadata.title).toBe("K-TRIP — 망원동 월드컵시장");
    expect(String(metadata.description)).toContain("K-TRIP");
    expect(metadata.openGraph?.title).toBe("K-TRIP — 망원동 월드컵시장");
    expect(metadata.openGraph?.siteName).toBe("K-TRIP");
  });
});
