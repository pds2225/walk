import type { DeviationState, TurnDirection } from "@walk/route-engine";

export type Locale = "ko" | "en" | "ja" | "zh";

export const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

interface UiText {
  readonly language: string;
  readonly homeTitle: string;
  readonly destination: string;
  readonly destinationPlaceholder: string;
  readonly searchLoading: string;
  readonly noMatch: (query: string) => string;
  readonly recents: string;
  readonly collapse: string;
  readonly moreRecent: string;
  readonly startWalking: string;
  readonly locating: string;
  readonly findingRoute: string;
  readonly rerouting: string;
  readonly remaining: (distance: string) => string;
  readonly turnAhead: (distance: string, direction: string) => string;
  readonly northUp: string;
  readonly movementUp: string;
  readonly voiceOff: string;
  readonly voiceOn: string;
  readonly stop: string;
  readonly directionStatus: string;
  readonly viewDirection: (degrees: number) => string;
  readonly movementDirection: (degrees: number) => string;
  readonly waitingDirection: string;
  readonly arrived: string;
  readonly routeFailed: string;
  readonly rerouteFailed: string;
  readonly state: (state: DeviationState) => string;
  readonly turn: (direction: TurnDirection) => string;
  readonly roadviewButton: string;
  readonly roadviewTitle: string;
  readonly roadviewLoading: string;
  readonly roadviewNoPano: string;
  readonly roadviewUnavailable: string;
  readonly roadviewClose: string;
  readonly roadviewDestination: (name: string) => string;
}

const UI: Record<Locale, UiText> = {
  ko: {
    language: "언어",
    homeTitle: "어디로 갈까요?",
    destination: "목적지",
    destinationPlaceholder: "예) 경복궁, 강남역 10번출구",
    searchLoading: "검색 중…",
    noMatch: (query) => `‘${query}’ — 일치하는 장소가 없습니다.`,
    recents: "최근",
    collapse: "접기",
    moreRecent: "최근 목적지 더 보기",
    startWalking: "걷기",
    locating: "현재 위치 확인 중…",
    findingRoute: "경로 찾는 중…",
    rerouting: "경로를 다시 찾는 중…",
    remaining: (distance) => `남은 거리 ${distance}`,
    turnAhead: (distance, direction) => `${distance} 앞 ${direction}`,
    northUp: "북쪽 위",
    movementUp: "진행방향 위",
    voiceOff: "음성 끄기",
    voiceOn: "음성 켜기",
    stop: "안내 중지",
    directionStatus: "방향 상태",
    viewDirection: (degrees) => `내가 보는 방향 ${degrees}°`,
    movementDirection: (degrees) => `이동 방향 ${degrees}°`,
    waitingDirection: "방향 신호 대기 중",
    arrived: "목적지에 도착했습니다",
    routeFailed: "경로를 찾지 못했습니다. 연결 상태를 확인해 주세요.",
    rerouteFailed: "재탐색에 실패했습니다. 현재 경로로 계속 안내합니다.",
    state: (state) => ({
      on_route: "경로대로 가고 있어요",
      drifting: "길에서 조금 벗어났어요",
      deviated: "길을 벗어났습니다",
      passed_turn: "회전 지점을 지나쳤어요",
    })[state],
    turn: (direction) => ({ left: "좌회전", right: "우회전", straight: "직진" })[direction],
    roadviewButton: "목적지 주변 Roadview 보기",
    roadviewTitle: "목적지 주변 Roadview",
    roadviewLoading: "Roadview를 불러오는 중…",
    roadviewNoPano: "목적지 주변에 Roadview가 없습니다. 지도 안내를 계속합니다.",
    roadviewUnavailable: "Roadview를 사용할 수 없습니다. 지도 안내를 계속합니다.",
    roadviewClose: "지도 안내로 돌아가기",
    roadviewDestination: (name) => `목적지: ${name}`,
  },
  en: {
    language: "Language",
    homeTitle: "Where are you going?",
    destination: "Destination",
    destinationPlaceholder: "e.g. Gyeongbokgung, Gangnam Station Exit 10",
    searchLoading: "Searching…",
    noMatch: (query) => `No places match “${query}”.`,
    recents: "Recent",
    collapse: "Collapse",
    moreRecent: "Show more recent destinations",
    startWalking: "Start walking",
    locating: "Finding your location…",
    findingRoute: "Finding a route…",
    rerouting: "Finding a new route…",
    remaining: (distance) => `${distance} remaining`,
    turnAhead: (distance, direction) => `${direction} in ${distance}`,
    northUp: "North up",
    movementUp: "Movement up",
    voiceOff: "Turn voice off",
    voiceOn: "Turn voice on",
    stop: "Stop navigation",
    directionStatus: "Direction status",
    viewDirection: (degrees) => `Facing ${degrees}°`,
    movementDirection: (degrees) => `Moving ${degrees}°`,
    waitingDirection: "Waiting for direction",
    arrived: "You have arrived",
    routeFailed: "Could not find a route. Check your connection.",
    rerouteFailed: "Could not reroute. Continuing on the current route.",
    state: (state) => ({
      on_route: "You are on route",
      drifting: "You are drifting from the route",
      deviated: "You have left the route",
      passed_turn: "You passed the turn",
    })[state],
    turn: (direction) => ({ left: "Turn left", right: "Turn right", straight: "Go straight" })[direction],
    roadviewButton: "View Roadview near destination",
    roadviewTitle: "Roadview near destination",
    roadviewLoading: "Loading Roadview…",
    roadviewNoPano: "No Roadview is available nearby. Navigation will continue on the map.",
    roadviewUnavailable: "Roadview is unavailable. Navigation will continue on the map.",
    roadviewClose: "Return to map navigation",
    roadviewDestination: (name) => `Destination: ${name}`,
  },
  ja: {
    language: "言語",
    homeTitle: "どこへ行きますか？",
    destination: "目的地",
    destinationPlaceholder: "例）景福宮、江南駅10番出口",
    searchLoading: "検索中…",
    noMatch: (query) => `「${query}」に一致する場所がありません。`,
    recents: "最近の目的地",
    collapse: "閉じる",
    moreRecent: "最近の目的地をもっと見る",
    startWalking: "徒歩案内を開始",
    locating: "現在地を確認中…",
    findingRoute: "ルートを検索中…",
    rerouting: "ルートを再検索中…",
    remaining: (distance) => `残り ${distance}`,
    turnAhead: (distance, direction) => `${distance}先に${direction}`,
    northUp: "北を上に",
    movementUp: "進行方向を上に",
    voiceOff: "音声をオフ",
    voiceOn: "音声をオン",
    stop: "案内を停止",
    directionStatus: "方向状態",
    viewDirection: (degrees) => `見ている方向 ${degrees}°`,
    movementDirection: (degrees) => `移動方向 ${degrees}°`,
    waitingDirection: "方向信号を待っています",
    arrived: "目的地に到着しました",
    routeFailed: "ルートが見つかりません。接続を確認してください。",
    rerouteFailed: "再検索できません。現在のルートで案内を続けます。",
    state: (state) => ({
      on_route: "ルート上を進んでいます",
      drifting: "ルートから少し外れています",
      deviated: "ルートを外れました",
      passed_turn: "曲がり角を通り過ぎました",
    })[state],
    turn: (direction) => ({ left: "左折", right: "右折", straight: "直進" })[direction],
    roadviewButton: "目的地周辺のRoadviewを見る",
    roadviewTitle: "目的地周辺のRoadview",
    roadviewLoading: "Roadviewを読み込み中…",
    roadviewNoPano: "目的地周辺にRoadviewがありません。地図案内を続けます。",
    roadviewUnavailable: "Roadviewを利用できません。地図案内を続けます。",
    roadviewClose: "地図案内に戻る",
    roadviewDestination: (name) => `目的地：${name}`,
  },
  zh: {
    language: "语言",
    homeTitle: "要去哪里？",
    destination: "目的地",
    destinationPlaceholder: "例如：景福宫、江南站10号出口",
    searchLoading: "搜索中…",
    noMatch: (query) => `没有找到与“${query}”匹配的地点。`,
    recents: "最近目的地",
    collapse: "收起",
    moreRecent: "查看更多最近目的地",
    startWalking: "开始步行",
    locating: "正在确认位置…",
    findingRoute: "正在查找路线…",
    rerouting: "正在重新规划路线…",
    remaining: (distance) => `剩余 ${distance}`,
    turnAhead: (distance, direction) => `${distance}后${direction}`,
    northUp: "北方朝上",
    movementUp: "行进方向朝上",
    voiceOff: "关闭语音",
    voiceOn: "打开语音",
    stop: "停止导航",
    directionStatus: "方向状态",
    viewDirection: (degrees) => `面朝 ${degrees}°`,
    movementDirection: (degrees) => `移动方向 ${degrees}°`,
    waitingDirection: "正在等待方向信号",
    arrived: "已到达目的地",
    routeFailed: "找不到路线，请检查网络连接。",
    rerouteFailed: "重新规划失败，将继续使用当前路线。",
    state: (state) => ({
      on_route: "正在沿路线前进",
      drifting: "正在稍微偏离路线",
      deviated: "已偏离路线",
      passed_turn: "错过了转弯点",
    })[state],
    turn: (direction) => ({ left: "左转", right: "右转", straight: "直行" })[direction],
    roadviewButton: "查看目的地附近的Roadview",
    roadviewTitle: "目的地附近的Roadview",
    roadviewLoading: "正在加载Roadview…",
    roadviewNoPano: "目的地附近没有Roadview，将继续使用地图导航。",
    roadviewUnavailable: "Roadview不可用，将继续使用地图导航。",
    roadviewClose: "返回地图导航",
    roadviewDestination: (name) => `目的地：${name}`,
  },
};

export function getUiText(locale: Locale): UiText {
  return UI[locale] ?? UI.ko;
}

export interface WorldCupMarketUiText {
  readonly title: string;
  readonly subtitle: string;
  readonly back: string;
  readonly market: string;
  readonly language: string;
  readonly chooseLanguage: string;
  readonly shopPhoto: string;
  readonly nearbyEntry: string;
  readonly nearbyEyebrow: string;
  readonly nearbyTitle: string;
  readonly storefrontTitle: string;
  readonly storefrontUnavailable: string;
  readonly storefrontFallback: string;
  readonly storefrontMapOnlyFallback: string;
  readonly storefrontWalkingOnlyFallback: string;
  readonly storefrontUnknownFallback: string;
  readonly sharedLocationNotice: string;
  readonly locationTitle: string;
  readonly marketMap: string;
  readonly selectOnMap: string;
  readonly selectShop: string;
  readonly panoramaTab: string;
  readonly mapTab: string;
  readonly hotspotLabel: string;
  readonly previousPoint: string;
  readonly nextPoint: string;
  readonly selectedStore: string;
  readonly representativeMenu: string;
  readonly price: string;
  readonly hours: string;
  readonly details: string;
  readonly closeDetails: string;
  readonly goThere: string;
  readonly startWalkingGuide: string;
  readonly save: string;
  readonly saved: string;
  readonly share: string;
  readonly shared: string;
  readonly shareUnavailable: string;
  readonly popularMenu: string;
  readonly seeAll: string;
  readonly showLess: string;
  readonly signature: string;
  readonly aboutShop: string;
  readonly takeout: string;
  readonly dineIn: string;
  readonly available: string;
  readonly notAvailable: string;
  readonly unavailable: string;
  readonly orderNote: string;
  readonly storeStreetViewTitle: string;
  readonly storeStreetViewDescription: string;
  readonly locationButton: string;
  readonly locationWaiting: string;
  readonly locationDenied: string;
  readonly unknown: string;
  readonly panoramaUnavailable: string;
  readonly panoramaLoading: string;
  readonly panoramaUpdatedNotice: string;
}

const WORLD_CUP_MARKET_UI: Record<Locale, WorldCupMarketUiText> = {
  ko: {
    title: "월드컵시장 점포 안내",
    subtitle: "점포 정보를 먼저 보고, 아래에서 점포 근처 거리 뷰와 위치를 확인하세요.",
    back: "뒤로",
    market: "월드컵시장",
    language: "언어",
    chooseLanguage: "언어 선택",
    shopPhoto: "대표 이미지",
    nearbyEntry: "주변 점포 · 360 · 지도",
    nearbyEyebrow: "주변 둘러보기",
    nearbyTitle: "주변 점포",
    storefrontTitle: "점포 근처 거리 뷰",
    storefrontUnavailable: "사용 가능한 점포 근처 거리 뷰가 없습니다",
    storefrontFallback: "지도와 K-Navi 도보안내는 계속 사용할 수 있습니다.",
    storefrontMapOnlyFallback: "지도에서 위치를 볼 수 있습니다. 도보안내 목적지는 미확인입니다.",
    storefrontWalkingOnlyFallback: "K-Navi 도보안내를 시작할 수 있습니다. 지도에 표시할 점포 위치는 미확인입니다.",
    storefrontUnknownFallback: "점포 위치가 미확인이라 지도 핀과 도보안내를 사용할 수 없습니다.",
    sharedLocationNotice: "같은 주소 좌표를 공유하는 점포 수: {count}. 실제 점포 입구 위치는 미확인입니다. 점포 목록에서 선택하세요.",
    locationTitle: "위치",
    marketMap: "월드컵시장 지도",
    selectOnMap: "지도에서 선택",
    selectShop: "시장 점포 선택",
    panoramaTab: "점포 정보",
    mapTab: "일반 지도",
    hotspotLabel: "구간 핫스팟",
    previousPoint: "앞 포인트",
    nextPoint: "뒤 포인트",
    selectedStore: "선택 점포",
    representativeMenu: "대표 메뉴",
    price: "가격",
    hours: "영업시간",
    details: "상세보기",
    closeDetails: "상세 닫기",
    goThere: "여기로 가기",
    startWalkingGuide: "여기로 가기",
    save: "저장",
    saved: "저장됨",
    share: "공유",
    shared: "공유됨",
    shareUnavailable: "공유할 수 없음",
    popularMenu: "인기 메뉴",
    seeAll: "전체 보기",
    showLess: "접기",
    signature: "대표",
    aboutShop: "점포 안내",
    takeout: "포장",
    dineIn: "매장 이용",
    available: "가능",
    notAvailable: "불가",
    unavailable: "미확인",
    orderNote: "주문 참고",
    storeStreetViewTitle: "점포 근처 거리 뷰",
    storeStreetViewDescription: "선택한 점포 근처의 거리 뷰입니다. 점포 정면이 확인된 사진은 아닙니다.",
    locationButton: "내 위치 표시",
    locationWaiting: "내 위치 확인 중…",
    locationDenied: "위치 권한을 허용하면 지도에 내 위치가 표시됩니다.",
    unknown: "미확인",
    panoramaUnavailable: "Street View를 사용할 수 없어 안내 카드만 표시합니다.",
    panoramaLoading: "점포 근처 거리 뷰를 불러오는 중…",
    panoramaUpdatedNotice: "기록된 파노와 다른 근처 거리 뷰가 표시됩니다.",
  },
  en: {
    title: "World Cup Market Stores",
    subtitle: "See store details first, then check the street view near the store and the map.",
    back: "Back",
    market: "World Cup Market",
    language: "Language",
    chooseLanguage: "Choose language",
    shopPhoto: "shop photo",
    nearbyEntry: "Nearby Shops · 360 · Map",
    nearbyEyebrow: "EXPLORE AROUND YOU",
    nearbyTitle: "Nearby Shops",
    storefrontTitle: "Street View near this store",
    storefrontUnavailable: "Street View near this store is unavailable",
    storefrontFallback: "You can still check the map and start the walking guide.",
    storefrontMapOnlyFallback: "The location is shown on the map. The walking destination still needs checking.",
    storefrontWalkingOnlyFallback: "You can start the walking guide. The store location for the map still needs checking.",
    storefrontUnknownFallback: "The store location needs checking, so its map pin and walking guide are unavailable.",
    sharedLocationNotice: "Stores sharing these address coordinates: {count}. Individual store entrances need checking. Select a store from the list.",
    locationTitle: "Location",
    marketMap: "World Cup Market map",
    selectOnMap: "Select on the map",
    selectShop: "Choose a market shop",
    panoramaTab: "Store details",
    mapTab: "Standard map",
    hotspotLabel: "Corridor hotspots",
    previousPoint: "Previous point",
    nextPoint: "Next point",
    selectedStore: "Selected store",
    representativeMenu: "Featured menu",
    price: "Price",
    hours: "Hours",
    details: "Details",
    closeDetails: "Close details",
    goThere: "Go here",
    startWalkingGuide: "Start Walking Guide",
    save: "Save",
    saved: "Saved",
    share: "Share",
    shared: "Shared",
    shareUnavailable: "Sharing unavailable",
    popularMenu: "Popular Menu",
    seeAll: "See all",
    showLess: "Show less",
    signature: "Signature",
    aboutShop: "About this shop",
    takeout: "Takeout",
    dineIn: "Dine-in",
    available: "Available",
    notAvailable: "Not available",
    unavailable: "Check before visiting",
    orderNote: "Order note",
    storeStreetViewTitle: "Street View near this store",
    storeStreetViewDescription: "This is a street view near the selected store, not a confirmed storefront.",
    locationButton: "Show my location",
    locationWaiting: "Finding your location…",
    locationDenied: "Allow location access to show your position on the map.",
    unknown: "Needs checking",
    panoramaUnavailable: "Street View is unavailable; the store card remains available.",
    panoramaLoading: "Loading the street view near this store…",
    panoramaUpdatedNotice: "The nearby panorama shown differs from the recorded panorama.",
  },
  ja: {
    title: "ワールドカップ市場 店舗案内",
    subtitle: "先に店舗情報を確認し、その下で店舗付近のストリートビューと位置を見られます。",
    back: "戻る",
    market: "ワールドカップ市場",
    language: "言語",
    chooseLanguage: "言語を選択",
    shopPhoto: "代表画像",
    nearbyEntry: "周辺の店舗 · 360 · 地図",
    nearbyEyebrow: "周辺を見る",
    nearbyTitle: "周辺の店舗",
    storefrontTitle: "店舗付近のストリートビュー",
    storefrontUnavailable: "利用できる店舗付近のストリートビューがありません",
    storefrontFallback: "地図とK-Naviの徒歩案内は引き続き使えます。",
    storefrontMapOnlyFallback: "地図で位置を確認できます。徒歩案内の目的地は要確認です。",
    storefrontWalkingOnlyFallback: "K-Naviの徒歩案内を開始できます。地図に表示する店舗位置は要確認です。",
    storefrontUnknownFallback: "店舗位置が未確認のため、地図のピンと徒歩案内は利用できません。",
    sharedLocationNotice: "同じ住所座標を共有する店舗数：{count}。各店舗の入口は要確認です。店舗一覧から選択してください。",
    locationTitle: "位置",
    marketMap: "ワールドカップ市場の地図",
    selectOnMap: "地図で選択",
    selectShop: "市場の店舗を選択",
    panoramaTab: "店舗情報",
    mapTab: "通常地図",
    hotspotLabel: "区間ホットスポット",
    previousPoint: "前のポイント",
    nextPoint: "次のポイント",
    selectedStore: "選択した店舗",
    representativeMenu: "代表メニュー",
    price: "価格",
    hours: "営業時間",
    details: "詳細を見る",
    closeDetails: "詳細を閉じる",
    goThere: "ここへ行く",
    startWalkingGuide: "ここへ歩いて行く",
    save: "保存",
    saved: "保存済み",
    share: "共有",
    shared: "共有済み",
    shareUnavailable: "共有できません",
    popularMenu: "人気メニュー",
    seeAll: "すべて見る",
    showLess: "閉じる",
    signature: "おすすめ",
    aboutShop: "店舗について",
    takeout: "テイクアウト",
    dineIn: "店内利用",
    available: "可",
    notAvailable: "不可",
    unavailable: "要確認",
    orderNote: "注文メモ",
    storeStreetViewTitle: "店舗付近のストリートビュー",
    storeStreetViewDescription: "選択した店舗付近のストリートビューです。確認済みの店舗正面写真ではありません。",
    locationButton: "現在地を表示",
    locationWaiting: "現在地を確認中…",
    locationDenied: "位置情報を許可すると地図に現在地が表示されます。",
    unknown: "要確認",
    panoramaUnavailable: "Street Viewを利用できないため、店舗カードを表示します。",
    panoramaLoading: "店舗付近のストリートビューを読み込み中…",
    panoramaUpdatedNotice: "記録されたパノラマとは別の近くのストリートビューを表示しています。",
  },
  zh: {
    title: "世界杯市场店铺指南",
    subtitle: "先查看店铺信息，再在下方查看店铺附近的街景和位置。",
    back: "返回",
    market: "世界杯市场",
    language: "语言",
    chooseLanguage: "选择语言",
    shopPhoto: "代表图片",
    nearbyEntry: "附近店铺 · 360 · 地图",
    nearbyEyebrow: "看看周边",
    nearbyTitle: "附近店铺",
    storefrontTitle: "店铺附近的街景",
    storefrontUnavailable: "没有可用的店铺附近街景",
    storefrontFallback: "仍可查看地图并开始步行导航。",
    storefrontMapOnlyFallback: "可以在地图上查看位置。步行导航目的地仍需确认。",
    storefrontWalkingOnlyFallback: "可以开始K-Navi步行导航。地图上的店铺位置仍需确认。",
    storefrontUnknownFallback: "店铺位置仍需确认，因此无法显示地图标记或开始步行导航。",
    sharedLocationNotice: "共享此地址坐标的店铺数：{count}。各店铺入口仍需确认，请从店铺列表中选择。",
    locationTitle: "位置",
    marketMap: "世界杯市场地图",
    selectOnMap: "在地图上选择",
    selectShop: "选择市场店铺",
    panoramaTab: "店铺信息",
    mapTab: "普通地图",
    hotspotLabel: "路段热点",
    previousPoint: "上一个点",
    nextPoint: "下一个点",
    selectedStore: "已选店铺",
    representativeMenu: "招牌菜单",
    price: "价格",
    hours: "营业时间",
    details: "查看详情",
    closeDetails: "关闭详情",
    goThere: "去这里",
    startWalkingGuide: "开始步行导航",
    save: "收藏",
    saved: "已收藏",
    share: "分享",
    shared: "已分享",
    shareUnavailable: "无法分享",
    popularMenu: "热门菜单",
    seeAll: "查看全部",
    showLess: "收起",
    signature: "招牌",
    aboutShop: "关于这家店",
    takeout: "外带",
    dineIn: "堂食",
    available: "可用",
    notAvailable: "不可用",
    unavailable: "需要确认",
    orderNote: "点单提示",
    storeStreetViewTitle: "店铺附近的街景",
    storeStreetViewDescription: "这是所选店铺附近的街景，不是已确认的店铺正面。",
    locationButton: "显示我的位置",
    locationWaiting: "正在确认位置…",
    locationDenied: "允许位置权限后，地图会显示您的位置。",
    unknown: "需要确认",
    panoramaUnavailable: "Street View不可用，但仍可查看店铺卡片。",
    panoramaLoading: "正在加载店铺附近的街景…",
    panoramaUpdatedNotice: "显示的附近街景与已记录的全景不同。",
  },
};

export function getWorldCupMarketUiText(locale: Locale): WorldCupMarketUiText {
  return WORLD_CUP_MARKET_UI[locale] ?? WORLD_CUP_MARKET_UI.ko;
}

export function localeToSpeechLanguage(locale: Locale): string {
  return { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" }[locale];
}

export function speechForState(locale: Locale, state: Exclude<DeviationState, "on_route">): string {
  return {
    drifting: {
      ko: "경로를 벗어나기 시작했습니다. 경로를 확인하세요.",
      en: "You are starting to drift from the route. Check your direction.",
      ja: "ルートから外れ始めています。方向を確認してください。",
      zh: "您正在开始偏离路线，请确认方向。",
    },
    deviated: {
      ko: "경로를 이탈하였습니다.",
      en: "You have left the route.",
      ja: "ルートを外れました。",
      zh: "您已偏离路线。",
    },
    passed_turn: {
      ko: "회전 지점을 지나쳤습니다. 되돌아가세요.",
      en: "You passed the turn. Please turn back.",
      ja: "曲がり角を通り過ぎました。戻ってください。",
      zh: "您错过了转弯点，请返回。",
    },
  }[state][locale];
}

export function speechForTurn(locale: Locale, direction: TurnDirection, description?: string): string {
  if (locale === "ko" && description) return description;
  return {
    ko: { left: "좌회전입니다.", right: "우회전입니다.", straight: "직진입니다." },
    en: { left: "Turn left.", right: "Turn right.", straight: "Go straight." },
    ja: { left: "左に曲がってください。", right: "右に曲がってください。", straight: "直進してください。" },
    zh: { left: "请左转。", right: "请右转。", straight: "请直行。" },
  }[locale][direction];
}

export function speechForEvent(locale: Locale, event: "start" | "rerouting" | "updated" | "arrived"): string {
  return {
    start: { ko: "안내를 시작합니다.", en: "Navigation started.", ja: "案内を開始します。", zh: "开始导航。" },
    rerouting: { ko: "경로를 다시 찾습니다.", en: "Finding a new route.", ja: "ルートを再検索します。", zh: "正在重新规划路线。" },
    updated: { ko: "새 경로를 찾았습니다.", en: "The route has been updated.", ja: "新しいルートが見つかりました。", zh: "路线已更新。" },
    arrived: { ko: "목적지에 도착했습니다.", en: "You have arrived at your destination.", ja: "目的地に到着しました。", zh: "您已到达目的地。" },
  }[event][locale];
}
