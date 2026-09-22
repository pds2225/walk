import { afterEach, describe, expect, it, vi } from "vitest";
import { kakaoJavascriptKey } from "./kakaoJsKey";

describe("kakaoJavascriptKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("키가 없으면 null", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "");
    expect(kakaoJavascriptKey()).toBeNull();
  });

  it("공백만 있으면 null", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "   ");
    expect(kakaoJavascriptKey()).toBeNull();
  });

  it("JavaScript 키가 있으면 그 값을 돌려준다", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "js-test-key");
    expect(kakaoJavascriptKey()).toBe("js-test-key");
  });
});
