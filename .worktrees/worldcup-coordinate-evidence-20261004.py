"""Bounded public source/API probes. Credentials are read locally and never printed."""
import html
import json
import re
import tomllib
import urllib.error
import urllib.parse
import urllib.request
import winreg
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

if __name__ == '__main__':
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
