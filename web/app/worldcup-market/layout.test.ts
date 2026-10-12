import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("/worldcup-market metadata", () => {
  it("carries the K-Trip title, description and OG tags", () => {
    expect(metadata.title).toBe("케이트립 K-Trip — 망원동 월드컵시장");
    expect(String(metadata.description)).toContain("케이트립");
    expect(metadata.openGraph?.title).toBe("케이트립 K-Trip — 망원동 월드컵시장");
    expect(metadata.openGraph?.siteName).toBe("케이트립 K-Trip");
  });
});
