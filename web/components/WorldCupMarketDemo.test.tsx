// @vitest-environment jsdom
// Cover store browsing with explicit unknown and located fixtures.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import { localizeCategory, localizeStoreName } from "../lib/worldCupMarketStoreCopy";
import type { VerifiedLocation, WorldCupMarketStore } from "../lib/worldCupMarketStores";
import WorldCupMarketDemo from "./WorldCupMarketDemo";

const fixtures = vi.hoisted(() => ({ stores: [] as WorldCupMarketStore[], originals: [] as WorldCupMarketStore[] }));
vi.mock("../lib/worldCupMarketStores", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/worldCupMarketStores")>();
  fixtures.originals.push(...actual.WORLD_CUP_MARKET_STORES);
  return { ...actual, WORLD_CUP_MARKET_STORES: fixtures.stores };
});

vi.mock("next/dynamic", () => ({
  default: () => ({ selectedId, stores, onSelect }: { selectedId: string; stores: readonly WorldCupMarketStore[]; onSelect: (id: string) => void }) => <div data-testid="worldcup-market-map" data-store-count={stores.length}>map:{selectedId}<button onClick={() => onSelect(stores[0]!.id)}>test map selection</button></div>,
}));

function locateStore(index: number, existing?: VerifiedLocation | null): WorldCupMarketStore {
  const store = fixtures.stores[index];
  if (!store) throw new Error("점포 fixture가 없습니다");
  const sourceUrl = store.officialSource;
  if (!sourceUrl) throw new Error("점포 fixture의 블로그 출처가 없습니다");
  const location: VerifiedLocation = existing ?? {
    latitude: 37.5579,
    longitude: 126.9054,
    source: "component test fixture",
    coordSource: "component test fixture",
    evidenceAddress: store.address,
    sourceUrl,
    geocodedAddress: store.address,
    verifiedAt: "2026-10-04",
    verificationStatus: "UNKNOWN",
  };
  const located = { ...store, storeLocation: location, navigationTarget: location };
  fixtures.stores[index] = located;
  return located;
}

describe("World Cup Market demo", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/worldcup-market?store=worldcup-market-01");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fixtures.stores.splice(0, fixtures.stores.length, ...fixtures.originals.map((store) => ({
      ...store,
      storeLocation: null,
      navigationTarget: null,
      streetViewLocation: null,
      streetView: { ...store.streetView, available: false, lastResolvedPanoId: null },
    })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("상세 딥링크에서 블로그 점포 정보를 유지한다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "망원동 월드컵시장 점포 안내" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "부부야채 대표 이미지" })).toBeTruthy();
    expect(screen.getByText("서울 마포구 망원로7길 31")).toBeTruthy();
    expect(screen.getByText("02-2601-1777")).toBeTruthy();
    expect(screen.getAllByText("고구마").length).toBeGreaterThan(0);
    expect(screen.getByText("08:00 ~ 19:00 (일요일 휴무)")).toBeTruthy();
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.queryByText(/37\.\d+/)).toBeNull();
  });

  it("다른 점포를 고르면 블로그에 적힌 메뉴와 시간이 바뀌고, 좌표가 없으면 도보 안내를 시작하지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "무진장전집" }));
    expect(screen.getByRole("heading", { name: "무진장전집" })).toBeTruthy();
    expect(screen.getAllByText("야채곱창").length).toBeGreaterThan(0);
    expect(screen.getByText("11:00 ~ 23:00")).toBeTruthy();
    expect(screen.getByText("02-334-8295")).toBeTruthy();
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByText(/\d+원/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("슬로건의 3000원을 메뉴 가격으로 올리지 않는다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "무진장맛집" }));
    expect(screen.getAllByText(/3000원의 행복/).length).toBeGreaterThan(0);
    const priceLabel = screen.getByText("가격");
    expect(priceLabel.closest("div")?.querySelector("dd")?.textContent).toBe("미확인");
    expect(screen.queryByText("3,000원")).toBeNull();
  });

  it("KO EN JA ZH 헤더를 전환하고 블로그에 있는 영어·중국어 이름만 바꾼다", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    let locale: Locale = "ko";
    const onLocaleChange = vi.fn((nextLocale: Locale) => { locale = nextLocale; });
    const onStartWalking = vi.fn();
    const { rerender } = render(<WorldCupMarketDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    rerender(<WorldCupMarketDemo locale="en" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "Bubu Vegetables" })).toBeTruthy();
    expect(screen.getByText("Vegetables")).toBeTruthy();
    expect(screen.getAllByText("고구마").length).toBeGreaterThan(0);
    expect(screen.getByText("Popular Menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Walking Guide" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "JA" }));
    rerender(<WorldCupMarketDemo locale="ja" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(screen.getByText("人気メニュー")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ここへ歩いて行く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ZH" }));
    rerender(<WorldCupMarketDemo locale="zh" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "嘉樂農產物" }));
    expect(screen.getByRole("heading", { name: "嘉樂農產物" })).toBeTruthy();
    expect(screen.getByText("热门菜单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始步行导航" })).toBeTruthy();
  });

  it("저장과 공유 버튼을 제공한다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("button", { name: "저장됨" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
  });

  it("주변 화면은 주소와 미확인 위치를 보여주고 키가 있어도 거리뷰를 열지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(screen.getByText("서울 마포구 망원로7길 31")).toBeTruthy();
    expect(screen.getByText("미확인")).toBeTruthy();
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.getByText("사용 가능한 점포 근처 거리 뷰가 없습니다")).toBeTruthy();
    expect(screen.queryByTitle(/거리 뷰/)).toBeNull();

    const garak = screen.getAllByRole("listitem", { name: "가락농산물" })[0];
    if (!garak) throw new Error("가락농산물 listitem이 없습니다");
    fireEvent.click(garak);
    expect(screen.getByText("서울 마포구 망원로7길 23")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("좌표 있는 점포만 지도 핀·도보 목적지를 사용하며 공유 좌표를 그대로 안내한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    const first = locateStore(0);
    locateStore(1, first.storeLocation);
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);
    const walk = screen.getByRole("button", { name: "여기로 가기" }) as HTMLButtonElement;
    expect(walk.disabled).toBe(false);
    fireEvent.click(walk);
    expect(onStartWalking).toHaveBeenLastCalledWith({ name: first.nameKo, coordinate: first.navigationTarget });

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(await screen.findByTestId("worldcup-market-map")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("같은 주소 좌표를 공유하는 점포 수: 2");
    expect(screen.getByText("지도와 케이트립 도보안내는 계속 사용할 수 있습니다.")).toBeTruthy();
    const second = fixtures.stores[1];
    if (!second) throw new Error("점포 fixture가 없습니다");
    fireEvent.click(screen.getByRole("listitem", { name: second.nameKo }));
    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).toHaveBeenLastCalledWith({ name: second.nameKo, coordinate: second.navigationTarget });

    const unknown = fixtures.stores[2];
    if (!unknown) throw new Error("점포 fixture가 없습니다");
    fireEvent.click(screen.getByRole("listitem", { name: unknown.nameKo }));
    expect((screen.getByRole("button", { name: "여기로 가기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("위치: 미확인")).toBeTruthy();
    expect(screen.getByText("점포 위치가 미확인이라 지도 핀과 도보안내를 사용할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("?store= deep link로 특정 점포 상세에 직접 진입하고 점포 변경 시 URL을 갱신한다", async () => {
    window.history.replaceState({}, "", "/worldcup-market?store=worldcup-market-45");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "장터국밥" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "부부야채" }));
    expect(window.location.search).toContain("store=worldcup-market-01");
  });

  it("첫 화면의 45개 지도 핀 입력과 카드/목록을 업종별로 필터하고 상세에서 지도로 돌아온다", () => {
    window.history.replaceState({}, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.getByTestId("worldcup-market-map").getAttribute("data-store-count")).toBe("45");
    expect(within(screen.getByRole("list", { name: "점포 둘러보기" })).getAllByRole("button")).toHaveLength(45);
    const filters = within(screen.getByRole("group", { name: "업종 필터" }));
    expect(filters.getAllByRole("button")).toHaveLength(new Set(fixtures.stores.map((store) => store.category)).size + 1);
    fireEvent.click(filters.getByRole("button", { name: "채소" }));
    const count = fixtures.stores.filter((store) => store.category === "채소").length;
    expect(screen.getByTestId("worldcup-market-map").getAttribute("data-store-count")).toBe(String(count));
    expect(within(screen.getByRole("list", { name: "점포 둘러보기" })).getAllByRole("button")).toHaveLength(count);
    fireEvent.click(screen.getByRole("button", { name: "test map selection" }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(window.location.search).toContain("store=worldcup-market-01");
    fireEvent.click(screen.getByRole("button", { name: "시장 지도로 돌아가기" }));
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("worldcup-market-map").getAttribute("data-store-count")).toBe("45");
    fireEvent.click(within(screen.getByRole("list", { name: "점포 둘러보기" })).getByRole("button", { name: "부부야채" }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
  });

  it("잘못된 딥링크는 지도에 머물고 JA/EN/ZH 지도 UI가 바뀐다", () => {
    window.history.replaceState({}, "", "/worldcup-market?store=missing");
    const onStartWalking = vi.fn();
    const { rerender } = render(<WorldCupMarketDemo locale="ja" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "望遠洞ワールドカップ市場" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "野菜" })).toBeTruthy();
    expect(screen.getByText("45店舗")).toBeTruthy();
    rerender(<WorldCupMarketDemo locale="en" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "Mangwon World Cup Market" })).toBeTruthy();
    rerender(<WorldCupMarketDemo locale="zh" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "望远洞世界杯市场" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "蔬菜" })).toBeTruthy();
  });

  it("언어 버튼만 눌러 지도·상세·주변 화면의 언어와 미확인 값을 갱신한다", () => {
    window.history.replaceState({}, "", "/worldcup-market");
    const onStartWalking = vi.fn();
    function LocaleHarness() {
      const [locale, setLocale] = useState<Locale>("ko");
      return <WorldCupMarketDemo locale={locale} onLocaleChange={setLocale} onStartWalking={onStartWalking} />;
    }
    const locales = ["ja", "en", "zh", "ko"] as const;
    const store = fixtures.stores[0]!;
    render(<LocaleHarness />);

    for (const locale of locales) {
      const ui = getWorldCupMarketUiText(locale);
      fireEvent.click(screen.getByRole("button", { name: locale.toUpperCase() }));
      expect(screen.getByRole("heading", { name: ui.market })).toBeTruthy();
      expect(screen.getByText(ui.serviceName)).toBeTruthy();
      expect(within(screen.getByRole("group", { name: ui.categoryFilter }))
        .getByRole("button", { name: localizeCategory(store.category, locale) })).toBeTruthy();
    }

    fireEvent.click(within(screen.getByRole("list", { name: "점포 둘러보기" }))
      .getByRole("button", { name: store.nameKo }));
    for (const locale of locales) {
      const ui = getWorldCupMarketUiText(locale);
      fireEvent.click(screen.getByRole("button", { name: locale.toUpperCase() }));
      expect(screen.getByRole("heading", { name: localizeStoreName(store, locale) })).toBeTruthy();
      expect(screen.getByText(localizeCategory(store.category, locale), { exact: true })).toBeTruthy();
      expect(screen.getByText(ui.representativeMenu)).toBeTruthy();
      expect(screen.getByText(ui.price).closest("div")?.querySelector("dd")?.textContent).toBe(ui.unknown);
    }

    fireEvent.click(screen.getByRole("button", { name: getWorldCupMarketUiText("ko").nearbyEntry }));
    for (const locale of locales) {
      const ui = getWorldCupMarketUiText(locale);
      fireEvent.click(screen.getByRole("button", { name: locale.toUpperCase() }));
      expect(screen.getByRole("heading", { name: ui.nearbyTitle })).toBeTruthy();
      expect(screen.getByRole("heading", { name: ui.storefrontTitle })).toBeTruthy();
      expect(screen.getByText(ui.storefrontLocationUnknown)).toBeTruthy();
      const firstStore = within(screen.getByRole("list", { name: ui.nearbyTitle }))
        .getByRole("listitem", { name: localizeStoreName(store, locale) });
      expect(within(firstStore).getByText(localizeCategory(store.category, locale))).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    fireEvent.click(screen.getByRole("button", { name: "시장 지도로 돌아가기" }));
    expect(screen.getByRole("heading", { name: "망원동 월드컵시장" })).toBeTruthy();
    expect(window.location.search).toBe("");
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("기본값은 상세·주변의 길찾기를 숨기고 저장/공유는 유지한다", () => {
    locateStore(0);
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "여기로 가기" })).toBeNull();
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 360 · 지도/ }));
    expect(screen.queryByRole("button", { name: "여기로 가기" })).toBeNull();
  });
});
