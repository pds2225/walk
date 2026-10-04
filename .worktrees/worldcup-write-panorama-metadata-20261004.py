import json,math
from pathlib import Path
base=Path(r'D:\walk\.worktrees')
evidence=json.loads((base/'worldcup-coordinate-evidence-20261004.json').read_text(encoding='utf-8'))
probe=json.loads((base/'worldcup-naver-panorama-probe-20261004.json').read_text(encoding='utf-8'))
panos={}
for p in probe['panoramas']:
    if p['reason']!='OK' or not p.get('panoId'):continue
    record=next(r for r in evidence['records'] if r['id']==p['id']);s=record['location']
    a,b,c,d=map(math.radians,[s['latitude'],s['longitude'],p['latitude'],p['longitude']]);h=math.sin((c-a)/2)**2+math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2;distance=6371000*2*math.asin(math.sqrt(h))
    if distance>50 or not (37.554<=p['latitude']<=37.5625 and 126.900<=p['longitude']<=126.910):continue
    key=record['geocodeQuery'].removeprefix('서울특별시 마포구 ')
    panos[key]={'latitude':p['latitude'],'longitude':p['longitude'],'panoId':p['panoId'],'captureDate':p['captureDate'],'distanceMeters':round(distance,2)}
for r in evidence['records']:
    key=r.get('geocodeQuery','').removeprefix('서울특별시 마포구 ')
    r['panoramaMetadata']=panos.get(key)
evidence['panoramaProvider']='NAVER';evidence['panoramaCheckedAt']='2026-10-04'
(base/'worldcup-coordinate-evidence-20261004.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
path=base/'worldcup-market-clean-20261004/web/lib/worldCupMarketStores.ts'
text=path.read_text(encoding='utf-8');assert 'const BUILDING_PANORAMAS' not in text
table='''// NAVER Panorama SDK 실응답 getPanoId/getPosition/getLocation, 2026-10-04.
// 기본 검색 반경 300m의 반환값도 실제 건물과 50m 이내일 때만 기록한다. 점포 정면 확인과 구분한다.
const BUILDING_PANORAMAS: Readonly<Record<string, Coordinate & {
  readonly panoId: string;
  readonly captureDate: string;
  readonly distanceMeters: number;
}>> = {
'''+''.join('  '+json.dumps(k,ensure_ascii=False)+': '+json.dumps(v,ensure_ascii=False)+',\n' for k,v in panos.items())+'};\n\n'
text=text.replace('function verifiedBlogLocation(input: StallInput)',table+'function verifiedBlogLocation(input: StallInput)',1)
path.write_text(text,encoding='utf-8')
print(json.dumps({'panoramaCount':sum(r['panoramaMetadata'] is not None for r in evidence['records']),'checkedCoordinates':len(probe['panoramas']),'maximumDistanceMeters':max(p['distanceMeters'] for p in panos.values()),'distinctPanoIds':len({p['panoId'] for p in panos.values()})}))
