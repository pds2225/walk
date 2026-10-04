import importlib.util,json
from pathlib import Path
import urllib.parse
spec=importlib.util.spec_from_file_location('wc',r'D:\walk\.worktrees\worldcup-coordinate-evidence-20261004.py'); wc=importlib.util.module_from_spec(spec);spec.loader.exec_module(wc)
path=wc.BASE/'worldcup-coordinate-evidence-20261004.json'
data=json.loads(path.read_text(encoding='utf-8'))
confirmed=json.loads((wc.BASE/'worldcup-address-images-confirmed-20261004.json').read_text(encoding='utf-8'))
headers={'x-ncp-apigw-api-key-id':wc.local_setting('NAVER_MAPS_CLIENT_ID'),'x-ncp-apigw-api-key':wc.local_setting('NAVER_MAPS_CLIENT_SECRET'),'Accept':'application/json'}
cache=data['geocodeResponses']
for record in data['records']:
    image_address=confirmed.get(record['id'][-2:])
    if image_address:
        assert wc.address_identity(image_address)==wc.address_identity(record['originalAddress'])
        assert record.get('addressImageUrl') in record['sourceImages']
        record.update(evidenceAddress=image_address,blogVerified=True,evidenceType='BLOG_IMAGE',reason=None)
    else:
        record['evidenceType']='BLOG_TEXT'
    if not record['blogVerified']:continue
    road,number=wc.address_identity(record['evidenceAddress'])
    query='서울특별시 마포구 '+road+' '+number
    record['geocodeQuery']=query
    if query not in cache:
        try:
            response=json.loads(wc.public_fetch('https://maps.apigw.ntruss.com/map-geocode/v2/geocode?'+urllib.parse.urlencode({'query':query}),headers))
            cache[query]={'status':response.get('status'),'addresses':response.get('addresses',[])}
        except Exception as exc:cache[query]={'status':type(exc).__name__,'httpStatus':getattr(exc,'code',None),'addresses':[]}
    matches=[a for a in cache[query]['addresses'] if wc.address_identity(a.get('roadAddress',''))==(road,number) and '서울특별시 마포구' in a.get('roadAddress','') and '망원동' in a.get('jibunAddress','')]
    if len(matches)!=1:
        record['reason']='지오코딩 유일 주소 일치 실패';record.pop('location',None);continue
    address=matches[0];lat,lng=float(address['y']),float(address['x'])
    if not (37.554<=lat<=37.5625 and 126.900<=lng<=126.910):
        record['reason']='시장 허용 범위 밖';record.pop('location',None);continue
    record['location']={'latitude':lat,'longitude':lng,'source':'https://maps.apigw.ntruss.com/map-geocode/v2/geocode','coordSource':'blog-address+naver-geocode','evidenceAddress':record['evidenceAddress'],'sourceUrl':record['sourceUrl'],'geocodedAddress':address['roadAddress'],'verifiedAt':record['checkedAt'],'verificationStatus':'SINGLE_SOURCE_VERIFIED','evidenceType':record['evidenceType'],'evidenceImageUrl':record.get('addressImageUrl')}
    record['jibunAddress']=address['jibunAddress'];record['reason']=None
data['uniqueQueries']=len(cache)
path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
groups={}
for record in data['records']:
    if 'location' in record:
        loc=record['location'];groups.setdefault((loc['latitude'],loc['longitude']),[]).append(record)
print(json.dumps({'verifiedBlogCount':sum(r['blogVerified'] for r in data['records']),'coordinateCount':sum('location' in r for r in data['records']),'uniqueGeocodes':len(groups),'missing':[{'id':r['id'],'nameKo':r['nameKo'],'reason':r['reason']} for r in data['records'] if 'location' not in r],'sharedGroups':[{'address':rs[0]['location']['geocodedAddress'],'names':[r['nameKo'] for r in rs],'coordinate':[rs[0]['location']['latitude'],rs[0]['location']['longitude']]} for rs in groups.values() if len(rs)>1]},ensure_ascii=False,indent=2))
