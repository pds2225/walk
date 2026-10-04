const fs=require('node:fs');
const {chromium}=require('C:/Users/ekth3/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const key=process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
 if(!key){console.log('Naver client ID missing');process.exitCode=2;return;}
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={authenticated:false,panoramaAvailable:false,network:[],messages:[]};
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('console',message=>{if(message.type()==='error')report.messages.push(message.text().replaceAll(key,'[REDACTED]').replace(/https?:\/\/[^\s]+/g,'[URL]'));});
  page.on('response',r=>{if(new URL(r.url()).hostname.includes('naver'))report.network.push({host:new URL(r.url()).hostname,status:r.status()});});
  await page.goto('http://127.0.0.1:3115/worldcup-market',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId='+encodeURIComponent(key)+'&submodules=panorama'});
  await page.waitForFunction(()=>window.naver?.maps?.Panorama,{},{timeout:20000});
  report.authenticated=true;
  report.sdk=await page.evaluate(()=>({panorama:typeof window.naver.maps.Panorama,serviceMethods:Object.keys(window.naver.maps.Service||{})}));
  const records=JSON.parse(fs.readFileSync('D:/walk/.worktrees/worldcup-coordinate-evidence-20261004.json','utf8')).records;
  let unique=[...new Map(records.map(r=>[r.location.latitude+','+r.location.longitude,r])).values()];
  if(process.argv.includes('--first'))unique=unique.slice(0,1);
  report.panoramas=[];
  for(const record of unique){
  const result=await page.evaluate(input=>new Promise(resolve=>{
   document.getElementById('probe-panorama')?.remove();
   const box=document.createElement('div');box.id='probe-panorama';box.style.cssText='position:fixed;top:0;left:0;width:390px;height:844px;background:white;z-index:99999';document.body.appendChild(box);
   const panorama=new window.naver.maps.Panorama(box,{position:new window.naver.maps.LatLng(input.latitude,input.longitude),size:new window.naver.maps.Size(390,844),pov:{pan:0,tilt:0,fov:100}});
   box.style.position='fixed';box.style.top='0';box.style.left='0';box.style.zIndex='99999';
   let complete=false;const done=reason=>{if(complete)return;complete=true;const loc=panorama.getLocation?.();const position=panorama.getPosition?.();resolve({reason,panoId:panorama.getPanoId?.(),latitude:position?.lat(),longitude:position?.lng(),captureDate:loc?.photodate??null,address:loc?.address??null,title:loc?.title??null});};
   window.naver.maps.Event.addListener(panorama,'pano_status',status=>{if(status==='OK')done('OK');else done(String(status));});
   setTimeout(()=>done('timeout'),15000);
  }),{latitude:record.location.latitude,longitude:record.location.longitude});
  report.panoramas.push({id:record.id,storeCoordinate:{latitude:record.location.latitude,longitude:record.location.longitude},...result});
  if(record===unique[0]){
   await page.waitForTimeout(2000);
   await page.screenshot({path:'D:/walk/.worktrees/worldcup-naver-panorama-probe-20261004.png'});
  }
  }
  report.panoramaAvailable=report.panoramas.every(p=>!!p.panoId);
 }catch(error){report.failure=error.name;}
 finally{await browser.close();fs.writeFileSync('D:/walk/.worktrees/worldcup-naver-panorama-'+(process.argv.includes('--first')?'render':'probe')+'-20261004.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})();
