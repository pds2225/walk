import json
from pathlib import Path
base=Path(r'D:\walk\.worktrees');data=json.loads((base/'worldcup-coordinate-evidence-20261004.json').read_text(encoding='utf-8'))
groups={}
for r in data['records']:
    loc=r['location'];groups.setdefault((loc['latitude'],loc['longitude']),[]).append(r)
lines=['# 월드컵시장 위치 보완 결과 — PR #143','',
'확인일: 2026-10-04. 시작 head b8bfdfce264350a83b27248086c0c91411685d94. 일반 commit/push, draft 유지, main 병합/Ready/force push 없음.','',
'좌표45/45, NAVER 근처 파노45/45(고유 ID13). 못 넣은 점포 없음. 블로그 본문17개/정보 이미지 실제픽셀28개 확인, Naver Geocoding 건물18개, 같은 좌표12그룹39점포. 파노와 건물 거리 최대29.08m, 모든 저장 파노50m이내. 점포 이름/ID/출처뿐 아니라 기존 stall 입력45개 전 필드가 시작head와 동일.','',
'## 공유 좌표 (임의 분산 없음)','', '| 주소 | 점포 | 위도, 경도 |','|---|---|---|']
for (lat,lng),records in groups.items():
    if len(records)>1:lines.append('| '+records[0]['location']['geocodedAddress']+' | '+', '.join(r['nameKo'] for r in records)+' | '+str(lat)+', '+str(lng)+' |')
lines += ['', '## 검증','',
'실행 위치: D:\\walk\\.worktrees\\worldcup-market-clean-20261004\\web. 기존 원본 D:\\walk의 미커밋7파일은 별도 보존.','',
'| 명령/확인 | 결과 |','|---|---|',
'| npm ci --include-workspace-root --include=dev --no-audit | PASS, 280packages, lockfile 변경 없음 |',
'| npm --prefix .. run lint | PASS |',
'| npm run build | PASS |',
'| npm --prefix .. run test:run -- --maxWorkers=2 | 20files,169tests PASS; 검사/timeout 변경 없음 |',
'| npm --prefix .. run typecheck + npm run typecheck | root/web PASS |',
'| npm --prefix .. run simulate | normal/mild/strong/missed-turn 4시나리오 상태/행동 일치 PASS (출력 비교) |',
'| 실제 Chrome 390×844 | 두 점포 핀·도보·NAVER 영상·중지·홈4언어 PASS |',
'| 실제 TMAP route | 부부야채132m/7점, 장터국밥99m/5점, HTTP200 |',
'| 실제 지도 타일/파노 | 네트워크 mocking 없이 실제 응답·이미지 픽셀 확인; pageerror0 |',
'| 데이터/보호범위/Secret | 45입력 전 필드 동일; home/layout/globals/sharedroadview 유지; actuallocalkey소스 포함0 |','',
'기본 병렬 테스트는 로컬 부하에서 기존5초 제한을 넘긴 UI테스트가 있었다. 전체 worker2 제한 PASS와 기본 실행 결과를 구분해 기록한다.','',
'## 남은 확인','',
'- 건물 주소 지오코딩이며 개별 점포 입구/실내 실측은 미확인. 같은 좌표 마커 라벨은 겹칠 수 있어 점포 목록으로 선택한다.',
'- NAVER 영상은 점포 근처 사진이다. 정면/현재영업 여부를 확인했다고 주장하지 않으며 촬영일을 데이터에 기록했다.',
'- Chrome 위치는 출처 기반 좌표로 제어했다. 현장 휴대폰 GPS·실제 방문 및 배포 환경은 미검증.',
'- Google 키는 미설정. 실제 확인한 provider는 NAVER이고 Google Street View를 검증했다고 보고하지 않는다.',
'- 로컬 실행에는 TMAP_APP_KEY, NEXT_PUBLIC_NAVER_MAP_CLIENT_ID가 필요하다. 실제 키는 로컬env/프로세스에만 유지했다.','',
'## 점포별 근거/위치','', '| ID | 점포 | 본문/이미지 | 주소 근거 | 좌표 | 근처 NAVER pano ID | 출처 |','|---|---|---|---|---|---|---|']
for r in data['records']:
    loc=r['location'];p=r['panoramaMetadata'];lines.append('| '+r['id']+' | '+r['nameKo']+' | '+r['evidenceType']+' | '+r['evidenceAddress']+' | '+str(loc['latitude'])+','+str(loc['longitude'])+' | '+p['panoId']+' | [글]('+r['sourceUrl']+') |')
path=base/'worldcup-coordinates-report-20261004.md';path.write_text('\n'.join(lines)+'\n',encoding='utf-8');print(path)
