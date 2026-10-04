"""Bounded public source/API probes. Credentials are read locally and never printed."""
import html
import json
import re
import tomllib
import urllib.error
import urllib.parse
import urllib.request
import winreg
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

BASE = Path(r'D:\walk\.worktrees')
REPO = BASE / 'worldcup-market-clean-20261004'

def local_setting(name):
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as env:
            return winreg.QueryValueEx(env, name)[0]
    except FileNotFoundError:
        secrets = Path(r'D:\walk\.streamlit\secrets.toml')
        return tomllib.loads(secrets.read_text(encoding='utf-8-sig')).get(name, '')

def public_fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read().decode('utf-8')

def stores():
    text = (REPO/'web/lib/worldCupMarketStores.ts').read_text(encoding='utf-8')
    return [json.loads(row) for row in re.findall(r'stall\((\{[^\n]+\})\)', text)]

class BlogParagraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts=[]
        self.current=None
    def handle_starttag(self,tag,attrs):
        if tag=='p' and 'se-text-paragraph' in dict(attrs).get('class',''):
            self.current=[]
        if tag=='br' and self.current is not None:
            self.current.append(' ')
    def handle_data(self,data):
        if self.current is not None:
            self.current.append(data)
    def handle_endtag(self,tag):
        if tag=='p' and self.current is not None:
            self.parts.append(re.sub(r'\s+',' ',''.join(self.current).replace('\u200b','')).strip())
            self.current=None

ROAD_PATTERN=r'(망원로7길|망원로|월드컵로25길)\s*(\d+(?:-\d+)?)'
def address_identity(address):
    match=re.search(ROAD_PATTERN,address)
    return match.groups() if match else None

def collect_blog(store):
    record={'id':store['id'],'nameKo':store['nameKo'],'sourceUrl':store['postUrl'],'originalAddress':store['address'],'checkedAt':datetime.now().date().isoformat()}
    try:
        page=public_fetch(store['postUrl'])
        parser=BlogParagraphs();parser.feed(page)
        lines=[line for line in parser.parts if re.search(ROAD_PATTERN,line)]
        record['locationClues']=lines
        evidence=next((re.sub(r'^.*?(?:위치|주소)\s*[:：]\s*','',line).strip() for line in lines if address_identity(line)==address_identity(store['address'])),None)
        record['evidenceAddress']=evidence
        record['blogVerified']=evidence is not None and ('마포구' in evidence)
        record['reason']=None if record['blogVerified'] else '출처 글에서 기존 도로명·건물번호와 일치하는 주소를 확인하지 못함'
    except Exception as exc:
        record.update(blogVerified=False,evidenceAddress=None,reason='블로그 조회 실패: '+type(exc).__name__)
    return record

def collect_all():
    with ThreadPoolExecutor(max_workers=4) as executor:
        records=list(executor.map(collect_blog,stores()))
    headers={'x-ncp-apigw-api-key-id':local_setting('NAVER_MAPS_CLIENT_ID'),'x-ncp-apigw-api-key':local_setting('NAVER_MAPS_CLIENT_SECRET'),'Accept':'application/json'}
    cache={}
    for record in records:
        if not record['blogVerified']: continue
        road,number=address_identity(record['evidenceAddress'])
        query='서울특별시 마포구 '+road+' '+number
        record['geocodeQuery']=query
        if query not in cache:
            try:
                url='https://maps.apigw.ntruss.com/map-geocode/v2/geocode?'+urllib.parse.urlencode({'query':query})
                response=json.loads(public_fetch(url,headers))
                cache[query]={'status':response.get('status'),'addresses':response.get('addresses',[])}
            except Exception as exc:
                cache[query]={'status':type(exc).__name__,'httpStatus':getattr(exc,'code',None),'addresses':[]}
        result=cache[query]
        matches=[a for a in result['addresses'] if address_identity(a.get('roadAddress',''))==(road,number) and '서울특별시 마포구' in a.get('roadAddress','') and '망원동' in a.get('jibunAddress','')]
        if len(matches)!=1:
            record['reason']='지오코딩 주소가 유일하게 일치하지 않음 ('+str(result['status'])+')'
            continue
        address=matches[0]
        lat,lng=float(address['y']),float(address['x'])
        if not (37.554<=lat<=37.5625 and 126.900<=lng<=126.910):
            record['reason']='시장 근처 허용 범위 밖 결과'
            continue
        record['location']={'latitude':lat,'longitude':lng,'source':'https://maps.apigw.ntruss.com/map-geocode/v2/geocode','coordSource':'blog-address+naver-geocode','evidenceAddress':record['evidenceAddress'],'sourceUrl':record['sourceUrl'],'geocodedAddress':address['roadAddress'],'verifiedAt':record['checkedAt'],'verificationStatus':'SINGLE_SOURCE_VERIFIED'}
        record['jibunAddress']=address['jibunAddress']
        record['reason']=None
    output={'checkedAt':datetime.now().date().isoformat(),'bounds':{'minLatitude':37.554,'maxLatitude':37.5625,'minLongitude':126.900,'maxLongitude':126.910},'uniqueQueries':len(cache),'records':records,'geocodeResponses':cache}
    path=BASE/'worldcup-coordinate-evidence-20261004.json'
    path.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    for r in records:
        print(json.dumps({k:r.get(k) for k in ['id','nameKo','evidenceAddress','location','reason']},ensure_ascii=False))
    print(json.dumps({'verifiedBlogCount':sum(r['blogVerified'] for r in records),'coordinateCount':sum('location' in r for r in records),'uniqueQueries':len(cache),'artifact':str(path)},ensure_ascii=False))

def collect_images():
    evidence_path=BASE/'worldcup-coordinate-evidence-20261004.json'
    data=json.loads(evidence_path.read_text(encoding='utf-8'))
    folder=BASE/'worldcup-blog-location-images-20261004';folder.mkdir(exist_ok=True)
    def download(record):
        if record['blogVerified']: return record
        try:
            urls=record.get('sourceImages',[])
            if not urls:
                page=public_fetch(record['sourceUrl'])
                urls=re.findall(r'<img[^>]+(?:src|data-lazy-src)="([^"]+)"[^>]*class="[^"]*se-image-resource[^>]+>',page)
            record['sourceImages']=urls
            # The third card is visually checked; second card contains products only.
            if len(urls)>2:
                url=html.unescape(urls[2]);req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
                with urllib.request.urlopen(req,timeout=25) as response: image_bytes=response.read()
                image_path=folder/(record['id']+'-3.png');image_path.write_bytes(image_bytes)
                record['addressImageUrl']=url;record['addressImagePath']=str(image_path)
        except Exception as exc: record['imageError']=type(exc).__name__
        return record
    with ThreadPoolExecutor(max_workers=4) as executor: data['records']=list(executor.map(download,data['records']))
    evidence_path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    from PIL import Image,ImageDraw
    images=[r for r in data['records'] if 'addressImagePath' in r]
    for offset in range(0,len(images),4):
        group=images[offset:offset+4]
        sheet=Image.new('RGB',(1600,1740),'white');draw=ImageDraw.Draw(sheet)
        for index,record in enumerate(group):
            pic=Image.open(record['addressImagePath']).convert('RGB');pic.thumbnail((800,820))
            x=(index%2)*800;y=(index//2)*870
            draw.text((x+10,y+4),record['id'],fill='black');sheet.paste(pic,(x,y+28))
        dest=folder/('sheet-'+str(offset//4+1)+'.jpg');sheet.save(dest,quality=95)
        print(str(dest))
    print(json.dumps({'downloaded':len(images),'missing':[r['id'] for r in data['records'] if not r['blogVerified'] and 'addressImagePath' not in r]}))

if __name__ == '__main__':
    if len(sys.argv)>1 and sys.argv[1]=='collect':
        collect_all()
        sys.exit(0)
    if len(sys.argv)>1 and sys.argv[1]=='images':
        collect_images()
        sys.exit(0)
    store = stores()[0]
    for variant, url in [('mobile',store['postUrl']),('desktop', 'https://blog.naver.com/PostView.naver?blogId=mwwdc&logNo='+store['postUrl'].split('/')[-1]+'&redirect=Dlog&widgetTypeCall=true&directAccess=false')]:
        try:
            page = public_fetch(url)
            (BASE/f'worldcup-blog-sample-{variant}-20261004.html').write_text(page,encoding='utf-8')
            plain = html.unescape(re.sub(r'<[^>]*>',' ',page))
            matches = [plain[max(0,m.start()-80):m.end()+180] for m in re.finditer('망원로',plain)]
            print(json.dumps({'blogVariant':variant,'bytes':len(page),'addressExcerpts':matches[:4]},ensure_ascii=False))
        except Exception as exc:
            print(json.dumps({'blogVariant':variant,'errorType':type(exc).__name__,'httpStatus':getattr(exc,'code',None)}))
    headers = {'x-ncp-apigw-api-key-id':local_setting('NAVER_MAPS_CLIENT_ID'),'x-ncp-apigw-api-key':local_setting('NAVER_MAPS_CLIENT_SECRET'),'Accept':'application/json'}
    for endpoint in ['naveropenapi.apigw.ntruss.com','maps.apigw.ntruss.com']:
        try:
            url='https://'+endpoint+'/map-geocode/v2/geocode?'+urllib.parse.urlencode({'query':store['address']})
            result=json.loads(public_fetch(url,headers))
            (BASE/f'worldcup-geocode-probe-{endpoint}-20261004.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'endpoint':endpoint,'status':result.get('status'),'count':len(result.get('addresses',[])),'addresses':result.get('addresses',[])},ensure_ascii=False))
        except Exception as exc:
            print(json.dumps({'endpoint':endpoint,'errorType':type(exc).__name__,'httpStatus':getattr(exc,'code',None)}))
