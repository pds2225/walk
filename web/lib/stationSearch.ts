/**
 * 역명 단독 검색에서 역 본체를 주변 상점/출구보다 먼저 제시한다.
 * 주소 접두어와 노선·부역명 괄호는 허용하되, "판교역 맛집"처럼 다른 목적지는 제외한다.
 * GPS 접근권한이나 역별 하드코딩 좌표 없이 기존 제공자 결과만 재정렬한다.
 */
export function exactStationNameHit(query: string, label: string): boolean {
  const station = query.trim().replace(/\s+/g, "");
  if (!/^[가-힣A-Za-z0-9·]+역$/.test(station)) return false;
  const stem = station.slice(0, -1);
  const pattern = new RegExp(
    "(?:^|\\s)" + stem +
    "(?:\\([^()]{1,40}\\))?역" +
    "(?:\\s*\\([^()]{1,40}\\)|\\s*\\[[^\\[\\]]{1,40}\\])?$",
  );
  return pattern.test(label.trim());
}

export function compareExactStationHits(query: string, left: string, right: string): number {
  return Number(exactStationNameHit(query, right)) - Number(exactStationNameHit(query, left));
}
