// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Roadview from "./Roadview";

describe("Roadview", () => {
  it("좌표가 없으면 안내 문구만 보여주고 키 문자열은 그리지 않는다", async () => {
    render(
      <Roadview
        appkey="js-test-key-must-not-render"
        latitude={null}
        longitude={null}
        headingDegrees={null}
      />,
    );
    await waitFor(() => expect(screen.getByText(/위치 정보가 없어/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("js-test-key-must-not-render");
  });
});
