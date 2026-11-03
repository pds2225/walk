// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AnalyticsAdmin from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("recovers from an initial network failure to the server's unauthenticated login flow without reloading", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  render(<AnalyticsAdmin />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await screen.findByRole("heading", { name: "관리자 로그인" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![0]).toBe("/api/admin/analytics?");
});
