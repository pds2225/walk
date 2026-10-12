"""월드컵시장 첫 화면 고정 지도(web/public/worldcup-market/market-map.webp) 재생성 스크립트.

OpenStreetMap 데이터(© OpenStreetMap contributors, ODbL)를 Overpass API로 1회 받아 도로·건물만
단순한 밝은 스타일로 그린다. 외부 지도 서비스 화면을 캡처하지 않는다.
실행: python scripts/worldcup-market/render_static_map.py  (Pillow, 한글 폰트 경로 필요)
출력된 north/south/east/west 값을 web/lib/worldCupMarketStaticMap.ts 의 bounds 에 넣는다.
"""
import os, urllib.request, urllib.parse
import json, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
Z=18.4; W,H=728,790; SS=4
lat0=(37.5574056+37.55887564967531)/2; lon0=(126.90516280373033+126.9058836)/2
N=256*2**Z
def wp(lat,lon):
    s=math.sin(math.radians(lat)); return (lon+180)/360*N, (0.5-math.log((1+s)/(1-s))/(4*math.pi))*N
def ll(x,y): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/N)))), x/N*360-180
cx,cy=wp(lat0,lon0); X0=cx-W/2; Y0=cy-H/2
def P(lat,lon):
    x,y=wp(lat,lon); return ((x-X0)*SS,(y-Y0)*SS)
OSM_JSON=os.environ.get("OSM_JSON","osm.json")
FONT=os.environ.get("MAP_FONT","/usr/share/fonts/truetype/sand-box/google/Nanum Gothic/NanumGothic-Bold.ttf")
if not os.path.exists(OSM_JSON):
    bbox="37.5555,126.9026,37.5608,126.9086"
    q="[out:json][timeout:60];("+"".join(f'way["{k}"]({bbox});' for k in ("highway","building","leisure","landuse"))+");out geom;"
    req=urllib.request.Request("https://overpass.private.coffee/api/interpreter",data=urllib.parse.urlencode({"data":q}).encode(),
        headers={"User-Agent":"walk-ktrip-static-map/1.0 (github.com/pds2225/walk)"})
    open(OSM_JSON,"wb").write(urllib.request.urlopen(req,timeout=120).read())
els=json.load(open(OSM_JSON))["elements"]
img=Image.new("RGB",(W*SS,H*SS),(243,246,250)); d=ImageDraw.Draw(img)
def pts(e): return [P(g["lat"],g["lon"]) for g in e.get("geometry",[]) if g]
t=lambda e:e.get("tags",{})
for e in els:
    tg=t(e)
    if e["type"]!="way": continue
    if tg.get("leisure") in ("park","playground","garden","pitch") or tg.get("landuse") in ("grass","forest","recreation_ground"):
        p=pts(e); len(p)>2 and d.polygon(p,fill=(225,238,222))
for e in els:
    tg=t(e)
    if e["type"]=="way" and "building" in tg:
        p=pts(e); len(p)>2 and d.polygon(p,fill=(226,231,238),outline=(208,215,226),width=SS)
W_=dict(trunk=10,primary=10,secondary=9,tertiary=7,residential=5,unclassified=5,living_street=5,pedestrian=5,service=3,footway=2.5,path=2,steps=2)
order=["footway","path","steps","service","living_street","residential","unclassified","pedestrian","tertiary","secondary","primary","trunk"]
ways=[e for e in els if e["type"]=="way" and t(e).get("highway") in W_ and t(e).get("tunnel")!="yes" and t(e).get("area")!="yes"]
ways.sort(key=lambda e:order.index(t(e)["highway"]))
def line(p,w,c):
    d.line(p,fill=c,width=int(w*SS),joint="curve")
    r=w*SS/2
    for x,y in (p[0],p[-1]): d.ellipse((x-r,y-r,x+r,y+r),fill=c)
for e in ways:
    hw=t(e)["highway"]; w=W_[hw]
    if hw not in ("footway","path","steps"): line(pts(e),w+1.6,(214,220,229))
for e in ways:
    hw=t(e)["highway"]; w=W_[hw]
    c=(255,255,255) if hw not in ("footway","path","steps") else (232,236,242)
    if hw=="pedestrian": c=(251,247,236)
    line(pts(e),w,c)
img=img.resize((W,H),Image.LANCZOS)
# labels (one per street name, longest straight segment)
font=ImageFont.truetype(FONT,20)
best={}
for e in ways:
    tg=t(e); name=tg.get("name")
    if not name or tg["highway"] in ("footway","path","steps","service"): continue
    p=[(x/SS,y/SS) for x,y in pts(e)]
    for a,b in zip(p,p[1:]):
        L=math.dist(a,b); mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        if not(40<mid[0]<W-40 and 30<mid[1]<H-30): continue
        if L>best.get(name,(0,))[0]: best[name]=(L,a,b)
placed=[]
for name,(L,a,b) in sorted(best.items(),key=lambda kv:-kv[1][0]):
    tw=font.getlength(name)
    if tw+16>L: continue
    mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
    if any(math.dist(mid,q)<70 for q in placed): continue
    ang=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    if ang>90: ang-=180
    if ang<-90: ang+=180
    tile=Image.new("RGBA",(int(tw)+12,32),(0,0,0,0)); td=ImageDraw.Draw(tile)
    td.text((6,5),name,font=font,fill=(107,114,128,255),stroke_width=3,stroke_fill=(255,255,255,235))
    rot=tile.rotate(-ang,expand=True,resample=Image.BICUBIC)
    img.paste(rot,(int(mid[0]-rot.width/2),int(mid[1]-rot.height/2)),rot); placed.append(mid)
img.save("market-map.webp","WEBP",quality=82,method=6)
n,w=ll(X0,Y0); s,e=ll(X0+W,Y0+H)
print(json.dumps(dict(north=n,south=s,west=w,east=e,labels=len(placed))))
