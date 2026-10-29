import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { searchDestinations } from "../../../lib/search";

vi.mock("../../../lib/search", () => ({ searchDestinations: vi.fn() }));
const mockSearch = vi.mocked(searchDestinations);

beforeEach(() => {
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ hits: [], hint: null });
});

describe("GET /api/places - 검색 중심 좌표 검증", () => {
  it.each([
    "/api/places?q=진도식당",
    "/api/places?q=진도식당&lat=37.5",
    "/api/places?q=진도식당&lon=127.0",
    "/api/places?q=진도식당&lat=&lon=",
    "/api/places?q=진도식당&lat=0&lon=0",
    "/api/places?q=진도식당&lat=invalid&lon=127",
  ])("GPS 누락/오류: %s → 중심 좌표 없이 검색한다", async (url) => {
    const response = await GET(new Request(`http://localhost${url}`));
    expect(response.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith("진도식당", null);
  });

  it("유효한 GPS 좌표가 모두 전달됐을 때만 실제 위치로 거리 정렬한다", async () => {
    await GET(new Request("http://localhost/api/places?q=진도식당&lat=37.5665&lon=126.978"));
    expect(mockSearch).toHaveBeenCalledWith("진도식당", { latitude: 37.5665, longitude: 126.978 });
  });
});
