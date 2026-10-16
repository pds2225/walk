// @vitest-environment jsdom
// Cover store browsing with explicit unknown and located fixtures.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorldCupMarketUiText, type Locale } from "../lib/i18n";
import {
  getStoreNameReading,
  localizeAddress,
  localizeCategory,
  localizeCategoryGroup,
  localizeDescription,
  localizeHours,
  localizeOrderNote,
  localizeProductName,
  localizeStoreName,
} from "../lib/worldCupMarketStoreCopy";
import type { VerifiedLocation, WorldCupMarketStore } from "../lib/worldCupMarketStores";
import WorldCupMarketDemo from "./WorldCupMarketDemo";

const fixtures = vi.hoisted(() => ({ stores: [] as WorldCupMarketStore[], originals: [] as WorldCupMarketStore[] }));
vi.mock("../lib/worldCupMarketStores", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/worldCupMarketStores")>();
  fixtures.originals.push(...actual.WORLD_CUP_MARKET_STORES);
  return { ...actual, WORLD_CUP_MARKET_STORES: fixtures.stores };
});

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/track", () => ({ track: trackMock }));

vi.mock("next/dynamic", () => ({
  default: () => ({ selectedId, stores, onSelect }: { selectedId: string; stores: readonly WorldCupMarketStore[]; onSelect: (id: string) => void }) => <div data-testid="worldcup-market-map" data-store-count={stores.length}>map:{selectedId}<button onClick={() => onSelect(stores[0]!.id)}>test map selection</button></div>,
}));

vi.mock("./WorldCupMarketFloorMap", () => ({
  default: ({ stores, onSelect, selectedId, variant, highlightIds }: { stores: readonly WorldCupMarketStore[]; onSelect: (id: string) => void; selectedId?: string; variant?: string; highlightIds?: ReadonlySet<string> }) => <div data-testid="worldcup-market-floor-map" data-store-count={stores.length} data-selected={selectedId} data-variant={variant ?? "overview"} data-hl={highlightIds ? highlightIds.size : ""}><button onClick={() => onSelect(stores[0]!.id)}>test map selection</button></div>,
}));
vi.mock("./WorldCupMarketStaticMap", () => ({
  default: ({ stores, onSelect, selectedId, mode }: { stores: readonly WorldCupMarketStore[]; onSelect: (id: string) => void; selectedId?: string; mode?: string }) => <div data-testid="worldcup-market-static-map" data-store-count={stores.length} data-selected={selectedId} data-mode={mode}><button onClick={() => onSelect(stores[0]!.id)}>test map selection</button></div>,
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

function untranslatedTextNodes(container: HTMLElement): string[] {
  // Only exact, sourced shop names are exempt. A mixed sentence containing a
  // Korean name must still translate its prose, menu, hours and other UI text.
  const properNames = new Set(fixtures.originals.flatMap((store) =>
    [store.nameKo, store.nameEn, store.nameZh].filter((name): name is string => Boolean(name))));
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const untranslated: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    // Language buttons name each language in its own script (lang="ko" etc.).
    if (node.parentElement?.closest('[lang="ko"]') && node.parentElement.closest(".worldcup-market-locale-switcher")) continue;
    if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(text) && !properNames.has(text)) untranslated.push(text);
  }
  for (const element of container.querySelectorAll("[aria-label], [alt], [title]")) {
    for (const attribute of ["aria-label", "alt", "title"]) {
      let text = element.getAttribute(attribute) ?? "";
      for (const name of properNames) {
        if (text === name || text.startsWith(`${name} `)) {
          text = text.slice(name.length);
          break;
        }
      }
      if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(text)) untranslated.push(`${attribute}: ${text}`);
    }
  }
  return untranslated;
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
    expect(document.querySelector('[data-fact="price"]')).toBeNull();
    expect(document.querySelector(".worldcup-market-not-confirmed")?.textContent).toContain("가격");
    expect(screen.queryByText("미확인")).toBeNull();
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.queryByText(/37\.\d+/)).toBeNull();
  });

  it("다른 점포를 고르면 블로그에 적힌 메뉴와 시간이 바뀌고, 좌표가 없으면 도보 안내를 시작하지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getAllByRole("button", { name: /무진장전집/ })[0]!);
    expect(screen.getByRole("heading", { name: "무진장전집" })).toBeTruthy();
    expect(screen.getAllByText("야채곱창").length).toBeGreaterThan(0);
    expect(screen.getByText("11:00 ~ 23:00")).toBeTruthy();
    expect(screen.getByText("02-334-8295")).toBeTruthy();
    expect(document.querySelector('[data-fact="price"]')).toBeNull();
    expect(document.querySelector(".worldcup-market-not-confirmed")?.textContent).toContain("가격");
    expect(screen.queryByText("미확인")).toBeNull();
    expect(screen.queryByText(/\d+원/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "여기로 가기" }));
    expect(onStartWalking).not.toHaveBeenCalled();
  });

  it("슬로건의 3000원을 메뉴 가격으로 올리지 않는다", () => {
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /무진장맛집/ })[0]!);
    expect(screen.getAllByText(/3000원의 행복/).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-fact="price"]')).toBeNull();
    expect(document.querySelector(".worldcup-market-not-confirmed")?.textContent).toContain("가격");
    expect(screen.queryByText("미확인")).toBeNull();
    expect(screen.queryByText("3,000원")).toBeNull();
  });

  it("KO EN JA ZH 헤더를 전환하면 확인된 점포명과 번역된 메뉴·본문을 보여준다", () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    let locale: Locale = "ko";
    const onLocaleChange = vi.fn((nextLocale: Locale) => { locale = nextLocale; });
    const onStartWalking = vi.fn();
    const { rerender } = render(<WorldCupMarketDemo locale={locale} onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    rerender(<WorldCupMarketDemo locale="en" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "Bubu Vegetables" })).toBeTruthy();
    expect(screen.getAllByText("Vegetables").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sweet potato").length).toBeGreaterThan(0);
    expect(screen.queryByText("고구마")).toBeNull();
    expect(screen.getByText("Popular Menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Walking Guide" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "日本語" }));
    rerender(<WorldCupMarketDemo locale="ja" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: localizeStoreName(fixtures.stores[0]!, "ja") })).toBeTruthy();
    expect(screen.getByText("人気メニュー")).toBeTruthy();
    expect(screen.getAllByText(localizeProductName("고구마", "ja")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "ここへ歩いて行く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    rerender(<WorldCupMarketDemo locale="zh" onLocaleChange={onLocaleChange} onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "夫妇蔬菜" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /嘉乐农产物/ })[0]!);
    expect(screen.getByRole("heading", { name: "嘉乐农产物" })).toBeTruthy();
    expect(screen.getByText("热门菜单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始步行导航" })).toBeTruthy();
  });

  it.each((["en", "ja", "zh"] as const).flatMap((locale) =>
    Array.from({ length: 45 }, (_, index) => ({ locale, index, number: index + 1 })),
  ))("$locale 점포 $number: 상세·주변 본문을 번역하고 원본 사실을 보존한다", ({ locale, index }) => {
    const originalBefore = JSON.stringify(fixtures.originals);
    const fixtureBefore = JSON.stringify(fixtures.stores);
    const ui = getWorldCupMarketUiText(locale);
    const store = fixtures.stores[index]!;
    window.history.replaceState({}, "", `/worldcup-market?store=${store.id}`);
    const view = render(<WorldCupMarketDemo locale={locale} onStartWalking={vi.fn()} />);
    expect(fixtures.stores).toHaveLength(45);
    const showAll = view.container.querySelector<HTMLButtonElement>(".worldcup-market-popular-menu button");
    if (showAll?.textContent === ui.seeAll) fireEvent.click(showAll);
    const detail = view.container.querySelector<HTMLElement>(".worldcup-market-mobile-detail")!;
    expect(detail.querySelector("h2")?.textContent).toBe(localizeStoreName(store, locale));
    const description = localizeDescription(store.descriptionKo, locale);
    const descriptionNodes = detail.querySelectorAll(".worldcup-market-mobile-description");
    expect(descriptionNodes).toHaveLength(description ? 1 : 0);
    if (description) {
      expect(descriptionNodes[0]?.textContent).toBe(description);
      expect(detail.textContent?.split(description).length, "description shown once").toBe(2);
    }
    const fact = (key: string) => detail.querySelector(`.worldcup-market-mobile-key-facts [data-fact="${key}"] dd`)?.textContent;
    expect(fact("hours")).toBe(localizeHours(store.businessHours, locale) ?? undefined);
    if (store.representativeMenu?.priceWon === null) expect(fact("price")).toBeUndefined();
    expect(detail.querySelector(".worldcup-market-mobile-key-facts")?.textContent ?? "").not.toContain(ui.unknown);
    expect(detail.querySelector(".worldcup-market-about-shop")?.textContent).toContain(localizeAddress(store.address, locale));
    const orderNote = localizeOrderNote(store.purchaseInfo.orderNote, locale);
    if (orderNote) expect(detail.querySelector(".worldcup-market-order-note")?.textContent).toContain(orderNote);
    const names = [...detail.querySelectorAll(".worldcup-market-menu-card strong")].map((node) => node.textContent);
    for (const product of store.products) {
      expect(names, `${store.id} ${product.nameKo}`).toContain(localizeProductName(product.nameKo, locale));
    }
    expect(untranslatedTextNodes(view.container), `${locale} ${store.id} detail`).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: ui.nearbyEntry }));
    expect(view.container.querySelector(".worldcup-market-nearby-selected span")?.textContent)
      .toBe(localizeDescription(store.descriptionKo, locale) ?? ui.unknown);
    expect(view.container.querySelector(".worldcup-market-nearby-screen")?.textContent)
      .toContain(localizeAddress(store.address, locale));
    expect(untranslatedTextNodes(view.container), `${locale} ${store.id} nearby`).toEqual([]);

    // Localization changes the rendered copy, never the source facts or the
    // unknown-location fixtures used by these component tests.
    expect(JSON.stringify(fixtures.originals)).toBe(originalBefore);
    expect(JSON.stringify(fixtures.stores)).toBe(fixtureBefore);
  });

  it.each(["en", "ja", "zh"] as const)("%s: 지도 첫 화면에도 점포 고유명을 제외한 한국어 본문이 남지 않는다", (locale) => {
    window.history.replaceState({}, "", "/worldcup-market");
    const ui = getWorldCupMarketUiText(locale);
    const view = render(<WorldCupMarketDemo locale={locale} onStartWalking={vi.fn()} />);
    expect(untranslatedTextNodes(view.container)).toEqual([]);
    expect(within(screen.getByRole("list", { name: ui.storeList })).getAllByRole("button")).toHaveLength(45);
  });

  it("상세에 저장·공유 버튼이 없고 대표 사진은 잘리지 않는 전용 클래스로 표시한다", () => {
    window.history.replaceState(null, "", `/worldcup-market?store=${fixtures.stores[0]!.id}`);
    const view = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /저장|공유/ })).toBeNull();
    expect(view.container.querySelector(".worldcup-market-mobile-actions")).toBeNull();
    const photo = view.container.querySelector("img.worldcup-market-hero-photo");
    expect(photo?.getAttribute("alt")).toContain("대표 이미지");
    expect(view.container.querySelector("img.worldcup-market-hero-backdrop")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("인기 메뉴는 사진 자리 없는 텍스트 카드로 보여준다", () => {
    window.history.replaceState(null, "", `/worldcup-market?store=${fixtures.stores[0]!.id}`);
    const view = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const cards = view.container.querySelectorAll(".worldcup-market-menu-card");
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => expect(card.querySelector("img")).toBeNull());
  });

  it("주변 화면은 주소와 미확인 위치를 보여주고 키가 있어도 거리뷰를 열지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_WALKING_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-maps-key");
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(screen.getByText("서울 마포구 망원로7길 31")).toBeTruthy();
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
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_LIVE_MAP", "true");
    const first = locateStore(0);
    locateStore(1, first.storeLocation);
    const onStartWalking = vi.fn();
    render(<WorldCupMarketDemo locale="ko" onStartWalking={onStartWalking} />);
    const walk = screen.getByRole("button", { name: "여기로 가기" }) as HTMLButtonElement;
    expect(walk.disabled).toBe(false);
    fireEvent.click(walk);
    expect(onStartWalking).toHaveBeenLastCalledWith({ name: first.nameKo, coordinate: first.navigationTarget });

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 지도/ }));
    expect(screen.getAllByTestId("worldcup-market-floor-map").some((m) => m.getAttribute("data-variant") === "detail")).toBe(true);
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

  it("파라미터 없는 /worldcup-market은 전체 지도 메인이고 뒤로 버튼이 없으며 상세의 뒤로는 메인으로 돌아온다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    const back = vi.spyOn(window.history, "back");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.getByTestId("worldcup-market-floor-map")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "test map selection" }));
    expect(window.location.search).toContain("store=");
    fireEvent.click(screen.getByRole("button", { name: getWorldCupMarketUiText("ko").backToMap }));
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("worldcup-market-floor-map")).toBeTruthy();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("기본값은 NAVER 대신 고정 안내도를 쓰고 선택 점포를 강조한다", () => {
    const id = locateStore(0).id;
    window.history.replaceState(null, "", `/worldcup-market?store=${id}&view=nearby`);
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const map = screen.getAllByTestId("worldcup-market-floor-map").find((m) => m.getAttribute("data-variant") === "detail");
    expect(map?.getAttribute("data-selected")).toBe(id);
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
  });

  it("퍼널 이벤트: 메인 page_view, 목록·지도 핀·전화 클릭에 맞는 store_view source를 보낸다", () => {
    trackMock.mockClear();
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(trackMock).toHaveBeenCalledWith("page_view", expect.objectContaining({ locale: "ko" }));
    fireEvent.click(screen.getByRole("button", { name: "test map selection" }));
    expect(trackMock).toHaveBeenCalledWith("map_pin_click", expect.objectContaining({ src: "overview" }));
    expect(trackMock).toHaveBeenCalledWith("store_view", expect.objectContaining({ src: "map" }));
    fireEvent.click(screen.getByRole("button", { name: getWorldCupMarketUiText("ko").backToMap }));
    trackMock.mockClear();
    const list = screen.getByRole("list", { name: getWorldCupMarketUiText("ko").storeList });
    fireEvent.click(within(list).getAllByRole("button")[0]!);
    expect(trackMock).toHaveBeenCalledWith("store_view", expect.objectContaining({ storeId: fixtures.stores[0]!.id, src: "list" }));
  });

  it("퍼널 이벤트: ?store= 직접 진입은 deeplink, 전화 링크는 phone_click", () => {
    trackMock.mockClear();
    const store = fixtures.stores.find((item) => item.phone) ?? fixtures.stores[0]!;
    window.history.replaceState(null, "", `/worldcup-market?store=${store.id}`);
    const view = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(trackMock).toHaveBeenCalledWith("store_view", expect.objectContaining({ storeId: store.id, src: "deeplink" }));
    expect(trackMock).not.toHaveBeenCalledWith("page_view", expect.anything());
    const tel = view.container.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
    if (tel) {
      fireEvent.click(tel);
      expect(trackMock).toHaveBeenCalledWith("phone_click", expect.objectContaining({ storeId: store.id }));
    }
  });

  it("?store= deep link로 특정 점포 상세에 직접 진입하고 점포 변경 시 URL을 갱신한다", async () => {
    window.history.replaceState({}, "", "/worldcup-market?store=worldcup-market-45");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "장터국밥" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /부부야채/ }));
    expect(window.location.search).toContain("store=worldcup-market-01");
  });

  it("첫 화면의 45개 지도 핀 입력과 카드/목록을 업종별로 필터하고 상세에서 지도로 돌아온다", () => {
    window.history.replaceState({}, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
    expect(screen.getByTestId("worldcup-market-floor-map").getAttribute("data-store-count")).toBe("45");
    expect(within(screen.getByRole("list", { name: "점포 목록" })).getAllByRole("button")).toHaveLength(45);
    const filters = within(screen.getByRole("group", { name: "업종 필터" }));
    expect(filters.getAllByRole("button")).toHaveLength(new Set(fixtures.stores.map((store) => store.categoryGroup)).size + 1);
    expect(filters.queryByRole("button", { name: "야채" })).toBeNull();
    fireEvent.click(filters.getByRole("button", { name: "채소·과일" }));
    const count = fixtures.stores.filter((store) => store.categoryGroup === "produce").length;
    expect(screen.getByTestId("worldcup-market-floor-map").getAttribute("data-store-count")).toBe("45");
    expect(screen.getByTestId("worldcup-market-floor-map").getAttribute("data-hl")).toBe(String(count));
    expect(within(screen.getByRole("list", { name: "점포 목록" })).getAllByRole("button")).toHaveLength(count);
    fireEvent.click(screen.getByRole("button", { name: "test map selection" }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(window.location.search).toContain("store=worldcup-market-01");
    fireEvent.click(screen.getByRole("button", { name: "시장 지도로 돌아가기" }));
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("worldcup-market-floor-map").getAttribute("data-store-count")).toBe("45");
    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" })).getByRole("button", { name: /부부야채/ }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
  });

  it("NEXT_PUBLIC_WORLDCUP_LIVE_MAP=true 일 때만 첫 화면에 NAVER 실시간 지도를 쓴다", () => {
    window.history.replaceState({}, "", "/worldcup-market");
    vi.stubEnv("NEXT_PUBLIC_WORLDCUP_LIVE_MAP", "true");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.getByTestId("worldcup-market-map").getAttribute("data-store-count")).toBe("45");
    expect(screen.queryByTestId("worldcup-market-static-map")).toBeNull();
  });

  it("잘못된 딥링크는 지도에 머물고 JA/EN/ZH 지도 UI가 바뀐다", () => {
    window.history.replaceState({}, "", "/worldcup-market?store=missing");
    const onStartWalking = vi.fn();
    const { rerender } = render(<WorldCupMarketDemo locale="ja" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "望遠洞ワールドカップ市場" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "野菜・果物" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "野菜（ヤチェ）" })).toBeNull();
    expect(screen.getByText("45店舗")).toBeTruthy();
    rerender(<WorldCupMarketDemo locale="en" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "Mangwon World Cup Market" })).toBeTruthy();
    rerender(<WorldCupMarketDemo locale="zh" onStartWalking={onStartWalking} />);
    expect(screen.getByRole("heading", { name: "望远洞世界杯市场" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "蔬菜·水果" })).toBeTruthy();
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
      fireEvent.click(screen.getByRole("button", { name: ({ ko: "한국어", en: "English", ja: "日本語", zh: "中文" } as const)[locale] }));
      expect(screen.getByRole("heading", { name: ui.market })).toBeTruthy();
      expect(screen.getByText(ui.serviceName)).toBeTruthy();
      expect(within(screen.getByRole("group", { name: ui.categoryFilter }))
        .getByRole("button", { name: localizeCategoryGroup(store.categoryGroup!, locale) })).toBeTruthy();
    }

    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" }))
      .getByRole("button", { name: new RegExp(store.nameKo) }));
    for (const locale of locales) {
      const ui = getWorldCupMarketUiText(locale);
      fireEvent.click(screen.getByRole("button", { name: ({ ko: "한국어", en: "English", ja: "日本語", zh: "中文" } as const)[locale] }));
      expect(screen.getByRole("heading", { name: localizeStoreName(store, locale) })).toBeTruthy();
      expect(screen.getAllByText(localizeCategory(store.category, locale), { exact: true }).length).toBeGreaterThan(0);
      expect(screen.getByText(ui.representativeMenu)).toBeTruthy();
      expect(document.querySelector('[data-fact="price"]')).toBeNull();
      expect(document.querySelector(".worldcup-market-not-confirmed")?.textContent).toContain(ui.notConfirmedFields);
    }

    fireEvent.click(screen.getByRole("button", { name: getWorldCupMarketUiText("ko").nearbyEntry }));
    for (const locale of locales) {
      const ui = getWorldCupMarketUiText(locale);
      fireEvent.click(screen.getByRole("button", { name: ({ ko: "한국어", en: "English", ja: "日本語", zh: "中文" } as const)[locale] }));
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

  it("기본값은 상세·주변의 길찾기를 숨긴다", () => {
    locateStore(0);
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "여기로 가기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 지도/ }));
    expect(screen.queryByRole("button", { name: "여기로 가기" })).toBeNull();
  });

  it("상점 상세를 열면 history 항목을 push하고, 실제 뒤로가기(popstate)로 목록에 복귀한다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const lengthBeforeSelect = window.history.length;

    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" })).getByRole("button", { name: /부부야채/ }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(window.history.length).toBe(lengthBeforeSelect + 1);
    expect(window.location.search).toContain("store=worldcup-market-01");

    // 실제 브라우저/휴대폰 뒤로가기가 끝난 상태를 흉내낸다: URL이 이전 화면으로
    // 돌아간 뒤 popstate가 발생한다. 한국어 홈 '/'으로 나가지 않고 목록으로 복귀해야 한다.
    window.history.replaceState(null, "", "/worldcup-market");
    act(() => { window.dispatchEvent(new Event("popstate")); });
    expect(screen.getByRole("heading", { name: "망원동 월드컵시장" })).toBeTruthy();
  });

  it("고정 지도 핀을 눌러 상세를 열어도 history에 쌓이고, 뒤로가기로 고정 지도 첫 화면에 돌아온다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const lengthBeforeSelect = window.history.length;

    fireEvent.click(within(screen.getByTestId("worldcup-market-floor-map")).getByRole("button", { name: "test map selection" }));
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(window.history.length).toBe(lengthBeforeSelect + 1);
    expect(window.location.search).toContain("store=worldcup-market-01");

    window.history.replaceState(null, "", "/worldcup-market");
    act(() => { window.dispatchEvent(new Event("popstate")); });
    expect(screen.getByTestId("worldcup-market-floor-map").getAttribute("data-store-count")).toBe("45");
    expect(screen.queryByTestId("worldcup-market-map")).toBeNull();
  });

  it("주변 화면을 열면 history 항목을 추가로 push하고, 뒤로가기(popstate)로 상세에 복귀한다", () => {
    window.history.replaceState(null, "", "/worldcup-market?store=worldcup-market-01");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const lengthBeforeNearby = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: /주변 점포 · 지도/ }));
    expect(screen.getByRole("heading", { name: "주변 점포" })).toBeTruthy();
    expect(window.history.length).toBe(lengthBeforeNearby + 1);
    expect(window.location.search).toContain("view=nearby");
    expect(window.location.search).toContain("store=worldcup-market-01");

    window.history.replaceState(null, "", "/worldcup-market?store=worldcup-market-01");
    act(() => { window.dispatchEvent(new Event("popstate")); });
    expect(screen.getByRole("heading", { name: "부부야채" })).toBeTruthy();
    expect(window.location.search).not.toContain("view=nearby");
  });

  it("앱 안의 뒤로 버튼은 history가 없는 ?store= 딥링크에서도 빈 화면이 아니라 목록으로 이동(replace)한다", () => {
    window.history.replaceState(null, "", "/worldcup-market?store=worldcup-market-45");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const lengthBeforeBack = window.history.length;
    expect(screen.getByRole("heading", { name: "장터국밥" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "시장 지도로 돌아가기" }));

    expect(screen.getByRole("heading", { name: "망원동 월드컵시장" })).toBeTruthy();
    expect(window.location.search).toBe("");
    // replace여야 한다: 딥링크 진입 상태에서 뒤로 버튼을 눌러도 history 항목이 늘지 않는다.
    expect(window.history.length).toBe(lengthBeforeBack);
  });

  it("지도 목록을 떠나기 전 스크롤 위치를 저장했다가 복귀 시 그대로 되돌린다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });

    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" })).getByRole("button", { name: /부부야채/ }));
    fireEvent.click(screen.getByRole("button", { name: "시장 지도로 돌아가기" }));

    expect(vi.mocked(window.scrollTo)).toHaveBeenLastCalledWith({ top: 420 });
  });

  it("JA는 가타카나 상점명을 쓰고 한글 원래 이름을 함께 보이며, KO/EN/ZH에는 가타카나가 없다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    const store = fixtures.stores[0]!;
    const kana = localizeStoreName(store, "ja");
    expect(kana).not.toBe(store.nameKo);
    expect(getStoreNameReading(store, "ja")).toBe(store.nameKo);

    const { rerender } = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.queryAllByText(kana)).toHaveLength(0);

    rerender(<WorldCupMarketDemo locale="ja" onStartWalking={vi.fn()} />);
    const ui = getWorldCupMarketUiText("ja");
    expect(within(screen.getByRole("list", { name: ui.storeList })).getAllByText(kana).length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByRole("list", { name: ui.storeList })).getByRole("button", { name: new RegExp(kana) }));
    expect(screen.getByRole("heading", { name: kana })).toBeTruthy();
    expect(screen.getAllByText(store.nameKo).length).toBeGreaterThan(0);

    rerender(<WorldCupMarketDemo locale="en" onStartWalking={vi.fn()} />);
    expect(screen.queryAllByText(kana)).toHaveLength(0);
    rerender(<WorldCupMarketDemo locale="zh" onStartWalking={vi.fn()} />);
    expect(screen.queryAllByText(kana)).toHaveLength(0);
  });
  it("상세에서 다른 점포로 바꾸면 history를 replace해서 뒤로가기 한 번에 목록으로 돌아간다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" })).getByRole("button", { name: /부부야채/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const switcher = within(screen.getByRole("navigation", { name: getWorldCupMarketUiText("ko").selectShop }));
    fireEvent.click(switcher.getByRole("button", { name: /가락농산물/ }));
    fireEvent.click(switcher.getByRole("button", { name: /무진장전집/ }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalled();
    expect(window.location.search).toContain("store=worldcup-market-04");
    push.mockRestore();
    replace.mockRestore();
  });

  it("첫 화면 점포 목록은 한 번만 보이고, 전화번호는 tel: 링크로 정규화한다", () => {
    window.history.replaceState(null, "", "/worldcup-market");
    const view = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    expect(screen.getAllByRole("list", { name: "점포 목록" })).toHaveLength(1);
    expect(view.container.querySelector(".worldcup-market-overview-stores")).toBeNull();
    fireEvent.click(within(screen.getByRole("list", { name: "점포 목록" })).getByRole("button", { name: /부부야채/ }));
    const link = view.container.querySelector<HTMLAnchorElement>(".worldcup-market-phone a");
    expect(link?.getAttribute("href")).toBe("tel:0226011777");
    expect(link?.textContent).toBe("02-2601-1777");
  });
});

describe("주변 점포 레일", () => {
  it("끝에서는 해당 방향 화살표를 숨기고 다음 버튼으로 스크롤한다", () => {
    window.history.replaceState(null, "", `/worldcup-market?store=${fixtures.stores[0]!.id}&view=nearby`);
    const view = render(<WorldCupMarketDemo locale="ko" onStartWalking={vi.fn()} />);
    const rail = view.container.querySelector<HTMLUListElement>(".worldcup-market-nearby-rail")!;
    Object.defineProperty(rail, "scrollWidth", { configurable: true, value: 2000 });
    Object.defineProperty(rail, "clientWidth", { configurable: true, value: 400 });
    const scrollBy = vi.fn();
    rail.scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(screen.queryByRole("button", { name: "이전 점포 보기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다음 점포 보기" }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 320 }));
    rail.scrollLeft = 1600;
    fireEvent.scroll(rail);
    expect(screen.queryByRole("button", { name: "다음 점포 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "이전 점포 보기" })).toBeTruthy();
  });
});

