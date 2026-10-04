"""Run local web commands with local credentials; redact secrets from child output."""
import json,os,re,subprocess,sys,tomllib,urllib.request,urllib.parse,winreg
from pathlib import Path
BASE=Path(r'D:\walk\.worktrees');REPO=BASE/'worldcup-market-clean-20261004';WEB=REPO/'web'
env=os.environ.copy()
for envpath in [Path(r'D:\walk\.claude\worktrees\web-vercel\web\.env.local'),WEB/'.env.local']:
    if envpath.exists():
        for line in envpath.read_text(encoding='utf-8-sig').splitlines():
            match=re.match(r'^\s*(?:export\s+)?([\w]+)\s*=\s*(.*?)\s*$',line)
            if match and match[1] in ['TMAP_APP_KEY','NEXT_PUBLIC_GOOGLE_MAPS_API_KEY','GOOGLE_MAPS_API_KEY','NEXT_PUBLIC_NAVER_MAP_CLIENT_ID']:
                env[match[1]]=match[2].strip('"\'')
if not env.get('NEXT_PUBLIC_NAVER_MAP_CLIENT_ID'):
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER,'Environment') as settings:
        env['NEXT_PUBLIC_NAVER_MAP_CLIENT_ID']=winreg.QueryValueEx(settings,'NAVER_MAPS_CLIENT_ID')[0]
secretspath=Path(r'D:\walk\.streamlit\secrets.toml')
if not env.get('TMAP_APP_KEY') and secretspath.exists():
    env['TMAP_APP_KEY']=tomllib.loads(secretspath.read_text(encoding='utf-8-sig')).get('TMAP_APP_KEY','')
secret_values=[v for k,v in env.items() if re.search(r'API_KEY|APP_KEY|CLIENT_SECRET|CLIENT_ID|PASSWORD|TOKEN',k) and len(v)>5]
def sanitize(text):
    for value in secret_values:text=text.replace(value,'[REDACTED]')
    return text
mode=sys.argv[1]
if mode=='metadata':
    key=env.get('GOOGLE_MAPS_API_KEY') or env.get('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
    if not key:
        print('Street View metadata unavailable: local Google Maps key not configured.')
        sys.exit(2)
    data=json.loads((BASE/'worldcup-coordinate-evidence-20261004.json').read_text(encoding='utf-8'));cache={}
    for record in data['records']:
        loc=record.get('location')
        if not loc:continue
        query=f"{loc['latitude']},{loc['longitude']}"
        if query not in cache:
            params=urllib.parse.urlencode({'location':query,'radius':'50','source':'outdoor','key':key})
            request=urllib.request.Request('https://maps.googleapis.com/maps/api/streetview/metadata?'+params,headers={'Referer':'http://127.0.0.1:3115/'})
            try:
                with urllib.request.urlopen(request,timeout=20) as response:cache[query]=json.loads(response.read().decode('utf-8'))
            except Exception as exc:cache[query]={'status':type(exc).__name__,'httpStatus':getattr(exc,'code',None)}
        record['streetViewMetadata']=cache[query]
    (BASE/'worldcup-coordinate-streetview-metadata-20261004.json').write_text(sanitize(json.dumps(data,ensure_ascii=False,indent=2)),encoding='utf-8')
    print(json.dumps({'uniqueCoordinates':len(cache),'availableStores':sum(r.get('streetViewMetadata',{}).get('status')=='OK' for r in data['records']),'statuses':{q:r['status'] for q,r in cache.items()}},ensure_ascii=False))
    sys.exit(0)
commands={'build':['npm.cmd','run','build'],'serve':['npm.cmd','run','start','--','--hostname','127.0.0.1','--port','3115']}
command=commands[mode]
print(json.dumps({'mode':mode,'cwd':str(WEB),'googleKeyConfigured':bool(env.get('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')),'tmapConfigured':bool(env.get('TMAP_APP_KEY'))}))
child=subprocess.Popen(command,cwd=WEB,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
for line in child.stdout:print(sanitize(line),end='',flush=True)
sys.exit(child.wait())
