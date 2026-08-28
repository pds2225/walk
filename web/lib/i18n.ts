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
