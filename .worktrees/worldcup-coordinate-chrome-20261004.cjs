const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/ekth3/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base='http://127.0.0.1:3115';
const artifacts='D:/walk/.worktrees/';
const evidence=JSON.parse(fs.readFileSync(artifacts+'worldcup-coordinate-evidence-20261004.json','utf8'));
const origin=evidence.records.find(s=>s.id==='worldcup-market-07').location;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={browser:'Installed Google Chrome',viewport:'390x844',geolocation:'Controlled Chrome position at source-geocoded store 07 (not physical GPS)',network:'Real map tiles and TMAP route; no API interception',results:[],routeCalls:[],pageErrors:[]};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:origin.latitude,longitude:origin.longitude,accuracy:8},permissions:['geolocation']});
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.name));
  const tileResponses=[];
  page.on('response',response=>{const url=new URL(response.url());if(/cartocdn/.test(url.hostname))tileResponses.push(response.status());});
  const response=await page.goto(base+'/',{waitUntil:'networkidle'});assert.equal(response.status(),200);
  assert.deepEqual(await page.getByRole('combobox').locator('option').evaluateAll(o=>o.map(x=>x.value)),['ko','en','ja','zh']);
  report.results.push('PASS home four languages');
  for(const id of ['worldcup-market-01','worldcup-market-45']){
   const store=evidence.records.find(s=>s.id===id);
   await page.goto(base+'/worldcup-market?store='+id,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:store.nameKo,exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'여기로 가기',exact:true}).isDisabled(),false);
   assert.equal(await page.locator('.worldcup-market-store-switcher button').count(),45);
   await page.getByRole('button',{name:'주변 점포 · 360 · 지도',exact:true}).click();
   await page.locator('.worldcup-market-market-map').waitFor();
   await page.waitForFunction(()=>document.querySelectorAll('.worldcup-market-map-marker').length===45,{},{timeout:30000});
   const selected=page.locator('.worldcup-market-map-marker.is-selected');
   assert.equal(await selected.count(),1);
   assert.ok((await selected.getAttribute('aria-label')).includes(store.nameKo));
   await selected.click();
   assert.equal(new URL(page.url()).searchParams.get('store'),id);
   assert.match(await page.getByRole('note').textContent(),id.endsWith('01')?/2/:/6/);
   const map=page.locator('.worldcup-market-market-map');
   await map.scrollIntoViewIfNeeded();
   await page.waitForTimeout(2000);
   await map.screenshot({path:artifacts+'worldcup-coordinate-map-'+id.slice(-2)+'-20261004.png'});
   await page.screenshot({path:artifacts+'worldcup-coordinate-nearby-'+id.slice(-2)+'-20261004.png',fullPage:true});
   assert.equal(await page.locator('iframe').count(),0);
   assert.match(await page.locator('.worldcup-market-storefront-unavailable').textContent(),/지도와 K-Navi 도보안내/);
   report.results.push('PASS '+store.nameKo+' map45pins, exact shared location note and real map selection');
   report.results.push('StreetView '+store.nameKo+': UNVERIFIED (no local Google API key; accurate fallback)');
   const routePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/route'&&r.request().method()==='POST',{timeout:30000});
   await page.getByRole('button',{name:'여기로 가기',exact:true}).click();
   const route=await routePromise;
   const body=await route.json();const request=route.request().postDataJSON();
   assert.equal(request.dest.latitude,store.location.latitude);assert.equal(request.dest.longitude,store.location.longitude);
   report.routeCalls.push({store:id,status:route.status(),polylinePoints:body.route?.polyline?.length??0,totalDistance:body.totalDistanceMeters??body.summary?.totalDistanceMeters??null,error:body.error??null});
   if(route.status()!==200)throw new Error('Real route API failed HTTP '+route.status());
   assert.ok(body.route?.polyline?.length>1);
   await page.getByRole('button',{name:'안내 중지',exact:true}).waitFor({timeout:15000});
   await page.waitForTimeout(1000);
   await page.screenshot({path:artifacts+'worldcup-coordinate-navigation-'+id.slice(-2)+'-20261004.png'});
   report.results.push('PASS '+store.nameKo+' walking started with live TMAP HTTP200');
   await page.getByRole('button',{name:'안내 중지',exact:true}).click();
   await page.getByRole('heading',{name:store.nameKo,exact:true}).waitFor();
  }
  assert.ok(tileResponses.some(status=>status===200));
  assert.deepEqual(report.pageErrors,[]);
  report.results.push('PASS real map tile responses and zero page errors');
  report.tileResponses=tileResponses.length;
 }catch(error){report.failure=error.message;process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(artifacts+'worldcup-coordinate-chrome-20261004.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error.name);process.exitCode=1;});
