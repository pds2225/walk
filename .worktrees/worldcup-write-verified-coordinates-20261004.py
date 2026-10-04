import json
from pathlib import Path
base=Path(r'D:\walk\.worktrees')
data=json.loads((base/'worldcup-coordinate-evidence-20261004.json').read_text(encoding='utf-8'))
path=base/'worldcup-market-clean-20261004/web/lib/worldCupMarketStores.ts'
buildings={}; evidence={}
for record in data['records']:
    if 'location' not in record:continue
    location=record['location'];key=record['geocodeQuery'].removeprefix('서울특별시 마포구 ')
    buildings[key]={'latitude':location['latitude'],'longitude':location['longitude'],'address':location['geocodedAddress']}
    evidence[record['id']]={'address':record['evidenceAddress'],'building':key}
    if record.get('addressImageUrl'):evidence[record['id']]['imageUrl']=record['addressImageUrl']
def row_table(name,typ,entries):
    return 'const '+name+': Readonly<Record<string, '+typ+'>> = {\n'+''.join('  '+json.dumps(k,ensure_ascii=False)+': '+json.dumps(v,ensure_ascii=False)+',\n' for k,v in entries.items())+'};\n'
section='''/** マ포구 망원동 시장 인근만 허용한다. 좌표 생성이 아니라 지오코딩 결과의 안전 범위다. */
export const WORLD_CUP_MARKET_BOUNDS = {
  minLatitude: 37.554,
  maxLatitude: 37.5625,
  minLongitude: 126.900,
  maxLongitude: 126.910,
} as const;

export function isWorldCupMarketCoordinate(coordinate: Coordinate): boolean {
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= WORLD_CUP_MARKET_BOUNDS.minLatitude
    && coordinate.latitude <= WORLD_CUP_MARKET_BOUNDS.maxLatitude
    && coordinate.longitude >= WORLD_CUP_MARKET_BOUNDS.minLongitude
    && coordinate.longitude <= WORLD_CUP_MARKET_BOUNDS.maxLongitude;
}

// 2026-10-04 Naver Geocoding 실응답. 도로명·건물번호·마포구 망원동 일치를 확인했다.
// 층/호수는 주소 근거에 보존하며 같은 건물의 좌표를 임의로 흩뜨리지 않는다.
'''.replace('マ포구','마포구')
section+=row_table('GEOCODED_BUILDINGS','Coordinate & { readonly address: string }',buildings)+'\n'
section+='// 출처 글 본문 17개, 첨부 정보 이미지 28개에서 주소를 확인했다. 이미지 주소는 실제 픽셀을 읽었다.\n'
section+=row_table('BLOG_LOCATION_EVIDENCE','{ readonly address: string; readonly building: string; readonly imageUrl?: string }',evidence)+'\n'
section+='''function verifiedBlogLocation(input: StallInput): VerifiedLocation | null {
  const evidence = BLOG_LOCATION_EVIDENCE[input.id];
  if (!evidence) return null;
  const building = GEOCODED_BUILDINGS[evidence.building];
  if (!building || !isWorldCupMarketCoordinate(building)) return null;
  return {
    latitude: building.latitude,
    longitude: building.longitude,
    source: "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
    coordSource: "blog-address+naver-geocode",
    evidenceAddress: evidence.address,
    sourceUrl: input.postUrl,
    geocodedAddress: building.address,
    evidenceType: evidence.imageUrl ? "BLOG_IMAGE" : "BLOG_TEXT",
    evidenceImageUrl: evidence.imageUrl ?? null,
    verifiedAt: "2026-10-04",
    verificationStatus: "SINGLE_SOURCE_VERIFIED",
  };
}

'''
text=path.read_text(encoding='utf-8')
assert 'const GEOCODED_BUILDINGS' not in text
text=text.replace('function stall(input: StallInput)',section+'function stall(input: StallInput)',1)
path.write_text(text,encoding='utf-8')
print('Added verified locations:',len(evidence),'distinct buildings:',len(buildings))
