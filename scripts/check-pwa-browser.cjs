'use strict';
// Optional integration check: PHP + an installed Chromium browser, no npm dependencies.
// All sessions, catalogs, accounts and screenshots stay in the ignored .taste-skill folder.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto'),net=require('node:net');
const root=path.resolve(__dirname,'..'),php=process.env.PHP_BINARY||'php';
const dir=path.join(root,'.taste-skill','pwa-browser-'+Date.now()),app=path.join(dir,'warhammer'),profile=path.join(dir,'chrome');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,browser,ws,sequence=0;const pending=new Map(),logs=[];
async function run(){
  fs.mkdirSync(app,{recursive:true});fs.mkdirSync(profile);
  for(const entry of fs.readdirSync(path.join(root,'Cangiolone.com'),{withFileTypes:true})){
    if(['config.php','private','uploads','vendor'].includes(entry.name))continue;
    fs.cpSync(path.join(root,'Cangiolone.com',entry.name),path.join(app,entry.name),{recursive:true});
  }
  fs.writeFileSync(path.join(app,'config.php'),`<?php return ['setup_hash'=>'${createHash('sha256').update('pwa-test-setup').digest('hex')}','database'=>['driver'=>'sqlite','path'=>__DIR__.'/preview.sqlite']];`);
  fs.mkdirSync(path.join(dir,'sessions'));
  fs.writeFileSync(path.join(dir,'router.php'),`<?php $_SERVER['REQUEST_URI']=substr($_SERVER['REQUEST_URI'],strlen('/warhammer'))?:'/';return require __DIR__.'/warhammer/router.php';`);
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const base=`http://127.0.0.1:${port}/warhammer/`;
  server=spawn(php,['-d','memory_limit=256M','-d','post_max_size=32M','-d',`session.save_path=${path.join(dir,'sessions')}`,'-S',`127.0.0.1:${port}`,'-t',dir,path.join(dir,'router.php')],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  server.stderr.on('data',d=>fs.appendFileSync(path.join(dir,'php.log'),d));
  for(let i=0;i<100;i++){try{if((await fetch(base+'index.php')).ok)break;}catch{}await pause(50);}
  const executable=[process.env.CHROME_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&fs.existsSync(p));
  assert.ok(executable,'Set CHROME_PATH to an installed Chromium browser.');
  browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'ignore',windowsHide:true});
  let debugPort;
  for(let i=0;i<150&&!debugPort;i++){await pause(100);try{debugPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}}
  assert.ok(debugPort,'Browser did not start');
  const version=await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const cb=pending.get(m.id);if(cb){pending.delete(m.id);m.error?cb.reject(Error(m.error.message)):cb.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')logs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
  async function tab(standalone,{holdCatalog=false}={}){
    const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const S=(m,p)=>send(m,p,sessionId);
    await S('Runtime.enable');await S('Page.enable');await S('Network.enable');
    await S('Page.addScriptToEvaluateOnNewDocument',{source:'window.__pwaDocument=Math.random();'});
    await S('Page.addScriptToEvaluateOnNewDocument',{source:`window.__builderReads=0;window.__catalogDownloads=0;window.__failSync=false;window.__holdCatalog=${holdCatalog};const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const url=String(input);if(url.includes('action=builderCatalog')&&!url.includes('metadata=1'))window.__catalogDownloads++;if(url.includes('action=builderArmies')){window.__builderReads++;if(window.__failSync)return Promise.resolve(new Response(JSON.stringify({error:'Test server unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}));}if(window.__holdCatalog&&url.includes('action=builderCatalog'))return new Promise(resolve=>{window.__releaseCatalog=()=>{window.__holdCatalog=false;resolve(originalFetch(input,options));};});return originalFetch(input,options);};`});
    if(standalone)await S('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'standalone',{value:true});"});
    const ev=async expression=>{const r=await S('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const wait=async(expression,timeout=20000)=>{const start=Date.now();let value;while(Date.now()-start<timeout){try{value=await ev(expression);if(value)return value;}catch{}await pause(70);}throw Error('Timed out: '+expression+'; main='+await ev('document.querySelector("#main")?.innerText')+'; exceptions='+logs.join('; '));};
    const navigate=async(expectState=true)=>{const old=await ev('window.__pwaDocument');await S('Page.navigate',{url:base+'index.php?qa='+Date.now()+'#builder'});await wait('window.__pwaDocument!=='+JSON.stringify(old??null)+'&&document.readyState==="complete"');if(expectState)await wait('typeof state!=="undefined"&&state');};
    const offline=async value=>{await S('Network.emulateNetworkConditions',{offline:value,latency:0,downloadThroughput:-1,uploadThroughput:-1});await ev(`window.dispatchEvent(new Event('${value?'offline':'online'}'))`);};
    return {targetId,S,ev,wait,navigate,offline};
  }
  const pwa=await tab(true);await pwa.navigate();
  await pwa.ev(`api('setup',{username:'pwaadmin',name:'PWA Admin',password:'IsolatedPwa2026!',code:'pwa-test-setup'})`);
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/workbench-fixture.json'),'utf8'));
  await pwa.ev(`(async()=>{state=await networkApi('state');await networkApi('builderImport',{catalog:${JSON.stringify(fixture)}});await refresh();})()`);
  await pwa.wait('document.querySelector("#offline-activity")?.innerText.includes("App pronta offline")');
  assert.equal(await pwa.ev('sectorOffline.installed()'),true);
  const online=await tab(false);await online.navigate();await online.wait('builderUi.owner');
  assert.equal(await online.ev('sectorOffline.active()'),false);
  await pwa.offline(true);
  await pwa.wait('document.querySelector("#offline-connection-notice")?.hidden===false');
  await pwa.ev('document.querySelector("#offline-connection-notice button").click()');
  await pwa.ev('window.dispatchEvent(new CustomEvent("sector-offline-change"))');
  assert.equal(await pwa.ev('document.querySelector("#offline-connection-notice").hidden'),true);
  await pwa.ev(`builderStart('test',2000,3,'Lista offline');wbAdd('squad');`);
  await pwa.ev('wbSave()');
  const armyId=await pwa.ev('builderUi.army.id');assert.match(armyId,/^[a-f0-9]{24}$/);
  assert.equal(await pwa.ev('main.querySelector("[data-wb-mode=play]").disabled'),false);
  assert.equal(await pwa.ev('builderUi.army.entries.length'),1);
  await pwa.ev("wbSetMode('play')");assert.equal(await pwa.ev('workbench.mode'),'play');
  await pwa.ev("builderWorkbenchRender()");assert.equal(await pwa.ev('workbench.mode'),'play');
  await pwa.ev("wbSetMode('build')");
  await pwa.ev(`location.hash='campionati'`);await pwa.wait('main.innerText.includes("Serve una connessione")');
  await pwa.ev(`location.hash='builder'`);await pwa.wait('main.innerText.includes("Lista offline")');
  // Cold open: a new page, same device storage, with the network disabled before navigation.
  let cold=await tab(true);await cold.S('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cold.navigate();
  await cold.wait('main.innerText.includes("Lista offline")');
  await cold.ev(`builderOpen('${armyId}')`);assert.equal(await cold.ev('builderUi.army.entries.length'),1);
  await cold.ev("wbSetMode('play')");assert.equal(await cold.ev('workbench.mode'),'play');
  await cold.ev("wbSetMode('build')");
  await cold.ev(`builderUi.army.name='Modificata a freddo';wbChanged(false);`);await cold.ev('wbSave()');
  await cold.offline(false);await cold.ev('sectorOffline.sync(networkApi)');
  await cold.wait('document.querySelector("#offline-connection-notice")?.dataset.connection==="online"');
  await cold.wait('document.querySelector("#notice")?.textContent');
  assert.equal(await online.ev(`(async()=>{const r=await networkApi('builderArmies');return r.armies.find(a=>a.id==='${armyId}')?.name;})()`),'Modificata a freddo');
  console.log('PASS cold offline create/edit/save/reopen; online-only routes and offline Play available');
  // Each tab edits from the same base, then the PWA reconnects.
  await cold.ev('builderArchive()');await cold.ev(`builderOpen('${armyId}')`);await cold.offline(true);
  await cold.ev(`builderUi.army.name='Versione del dispositivo';wbChanged(false);`);await cold.ev('wbSave()');
  await online.ev(`(async()=>{const r=await networkApi('builderArmies');const a=r.armies.find(a=>a.id==='${armyId}');a.name='Versione online';return networkApi('builderSave',a);})()`);
  await cold.ev('builderArchive()');
  const reopening=await tab(true,{holdCatalog:true});await reopening.navigate();
  await reopening.wait('document.querySelector("#offline-conflicts-banner")?.hidden===false&&window.__releaseCatalog');
  await reopening.wait('document.querySelector("#offline-activity [data-offline-loading] .sync-icon")');
  assert.equal(await reopening.ev('(function(){const svg=document.querySelector("#offline-activity .sync-icon");window.dispatchEvent(new CustomEvent("sector-offline-change",{detail:{progressOnly:true}}));return svg===document.querySelector("#offline-activity .sync-icon");})()'),true);
  assert.equal(await reopening.ev('Boolean(document.querySelector("#offline-activity progress"))'),false);
  for(const width of [390,1440]){await reopening.S('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390});await pause(100);assert.equal(await reopening.ev('document.documentElement.scrollWidth<=innerWidth'),true);fs.writeFileSync(path.join(dir,'progress-'+width+'.png'),Buffer.from((await reopening.S('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
  console.log('PASS reopening detects conflict automatically before catalog download; progress is visible');
  await reopening.ev('window.__releaseCatalog()');
  await send('Target.closeTarget',{targetId:cold.targetId});cold=reopening;
  await cold.wait('document.querySelector("#offline-activity")?.getAttribute("aria-busy")==="false"');
  await cold.wait('document.querySelector("#offline-conflict-dialog[open]")');
  assert.equal(await cold.ev(`builderUi.armies.find(a=>a.id==='${armyId}').name`),'Versione del dispositivo');
  // Native confirmation is handled by CDP, exactly like a user choosing the online save.
  await cold.wait('document.querySelector("#offline-conflict-dialog[open]")?.innerText.includes("Versione online")');
  assert.equal(await cold.ev('document.querySelectorAll("#offline-conflict-dialog [data-conflict-pick]").length'),2);
  const click=cold.S('Runtime.evaluate',{expression:`document.querySelector('[data-conflict-pick=online]').click()`});await pause(100);await cold.S('Page.handleJavaScriptDialog',{accept:true});await click;
  await cold.wait('main.innerText.includes("Versione online")&&!document.querySelector("#offline-conflict-dialog[open]")');
  console.log('PASS conflict shown, versions compared, online choice keeps the selected save');
  await cold.wait('document.querySelector("#offline-activity")?.getAttribute("aria-busy")==="false"');
  await cold.ev(`builderStart('test',2000,3,'Auto sync save');wbAdd('squad');`);await cold.ev('wbSave()');
  const autoId=await cold.ev('builderUi.army.id');
  await cold.wait(`(async()=>{const r=await networkApi('builderArmies');return r.armies.some(a=>a.id==='${autoId}');})()`);
  await cold.ev(`api('builderDelete',{id:'${autoId}'})`);
  await cold.wait(`(async()=>{const r=await networkApi('builderArmies');return !r.armies.some(a=>a.id==='${autoId}');})()`);
  await cold.ev('builderArchive()');
  await cold.ev(`builderOpen('${armyId}')`);
  await cold.ev('document.querySelector("#nav a[href=\"#builder\"]").click()');
  await cold.wait('builderUi.view==="archive"');
  await cold.ev(`builderOpen('${armyId}')`);
  await cold.ev("location.hash='campionati'");await cold.wait('page()==="campionati"');
  await cold.ev('document.querySelector("#nav a[href=\"#builder\"]").click()');
  await cold.wait('builderUi.view==="editor"&&builderUi.army.id==="'+armyId+'"');
  await cold.ev('builderArchive()');
  for(const event of ['pageshow','focus']){
    await cold.wait('document.querySelector("#offline-activity")?.getAttribute("aria-busy")==="false"');const before=await cold.ev('window.__builderReads');
    await cold.ev(`window.dispatchEvent(new Event('${event}'))`);await cold.wait('window.__builderReads>'+before);
  }
  await cold.wait('document.querySelector("#offline-activity")?.getAttribute("aria-busy")==="false"');
  const downloadsBefore=await cold.ev('window.__catalogDownloads');
  const immediate=await cold.ev('(function(){window.dispatchEvent(new Event("focus"));return Boolean(document.querySelector("#offline-activity [data-offline-loading] .sync-icon"));})()');assert.equal(immediate,true);
  await cold.wait('document.querySelector("#offline-activity")?.getAttribute("aria-busy")==="false"');
  assert.equal(await cold.ev('Boolean(document.querySelector("#offline-sync"))'),false);
  assert.equal(await cold.ev('window.__catalogDownloads'),downloadsBefore);
  const readLastSync=()=>cold.ev('(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open("sector-offline:/warhammer/",1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});return new Promise((r,j)=>{const q=db.transaction("accounts").objectStore("accounts").get(state.user.id);q.onsuccess=()=>r(q.result.lastSync);q.onerror=()=>j(q.error);});})()');
  const lastSuccess=await readLastSync();
  await cold.ev('window.__failSync=true;window.dispatchEvent(new Event("focus"))');
  await cold.wait('document.querySelector("#offline-activity")?.innerText.includes("Sincronizzazione non completata")');
  assert.equal(await readLastSync(),lastSuccess);
  assert.equal(await cold.ev('Boolean(document.querySelector("#offline-sync"))'),false);
  await cold.ev('window.__failSync=false;window.dispatchEvent(new Event("focus"))');
  await cold.wait('document.querySelector("#offline-activity")?.innerText.includes("Sincronizzazione completata")');
  console.log('PASS automatic save/delete, re-entry, immediate progress, catalog reuse and visible recoverable errors');

  // A points-only update is automatic, with no conflict prompt.
  fixture.version='test-updated';fixture.units[0].points[0].points=123;
  await online.ev(`networkApi('builderImport',{catalog:${JSON.stringify(fixture)}})`);
  await cold.ev('sectorOffline.sync(networkApi)');await cold.ev(`builderOpen('${armyId}')`);
  await cold.wait('builderWorkbenchTotals().total===123');assert.equal(await cold.ev('Boolean(document.querySelector(".offline-conflict"))'),false);
  console.log('PASS catalog update changes points without a user-content conflict');
  // A normal browser page must not expose the installed app data offline.
  await online.offline(true);await online.navigate(false);await online.wait('main.innerText.includes("PWA")');
  assert.equal(await online.ev('Boolean(document.querySelector("[data-archive-open]"))'),false);
  const urls=await cold.ev('(async()=>{const all=[];for(const name of await caches.keys()){for(const r of await (await caches.open(name)).keys())all.push(r.url);}return all;})()');
  assert.ok(urls.length>35);assert.ok(urls.every(url=>!/(api\.php|uploads|campionato\.php)/.test(url)));
  assert.ok(urls.every(url=>url.startsWith(base)));
  console.log('PASS browser cannot open offline data; service-worker cache excludes APIs, leagues and attachments');
  await cold.S('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cold.ev('builderArchive()');await pause(200);
  assert.equal(await cold.ev('document.documentElement.scrollWidth<=innerWidth'),true);
  fs.writeFileSync(path.join(dir,'390.png'),Buffer.from((await cold.S('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await cold.S('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pause(200);
  assert.equal(await cold.ev('document.documentElement.scrollWidth<=innerWidth'),true);
  fs.writeFileSync(path.join(dir,'1440.png'),Buffer.from((await cold.S('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  // Switching accounts must never publish one account's queue as another account.
  await online.offline(false);await online.navigate();
  const firstOwner=await cold.ev('state.user.id');
  const invite=await online.ev("networkApi('invite',{})");
  await cold.offline(true);await cold.ev(`builderOpen('${armyId}')`);
  await cold.ev("builderUi.army.name='Bozza privata account A';wbChanged(false)");await cold.ev('wbSave()');
  await online.ev(`(async()=>{await networkApi('logout',{});state=await networkApi('state');await networkApi('register',{username:'pwasecond',name:'Second User',password:'IsolatedPwa2026!',code:'${invite.code}'});state=await networkApi('state');})()`);
  const secondOwner=await online.ev('state.user.id');assert.notEqual(firstOwner,secondOwner);
  await cold.offline(false);await cold.ev('sectorOffline.sync(networkApi)');
  assert.equal((await online.ev("networkApi('builderArmies')")).armies.length,0);
  await cold.ev('refresh()');await cold.wait('builderUi.owner===state.user.id&&builderUi.armies.length===0');
  await online.ev("(async()=>{await networkApi('logout',{});state=await networkApi('state');await networkApi('login',{username:'pwaadmin',password:'IsolatedPwa2026!'});state=await networkApi('state');})()");
  await cold.ev('refresh()');await cold.wait('builderUi.owner===state.user.id&&main.innerText.includes("Bozza privata account A")');
  assert.equal(await cold.ev('state.user.id'),firstOwner);
  console.log('PASS account switch isolates data and preserves the original account queue');
  const catalogPath=process.argv[2];
  if(catalogPath){
    const real=JSON.parse(fs.readFileSync(path.resolve(catalogPath),'utf8'));
    await online.ev(`networkApi('builderImport',{catalog:${JSON.stringify(real)}})`);
    await cold.ev('sectorOffline.sync(networkApi)');
    await cold.wait('builderUi.active?.units?.length>1000',45000);
    await cold.offline(true);await cold.ev(`builderStart('sm',2000,3,'Catalogo completo offline');wbAdd(builderUi.catalog.factions.find(f=>f.id==='sm').unitIds[0]);`);await cold.ev('wbSave()');
    assert.equal(await cold.ev('builderUi.army.entries.length'),1);
    await cold.offline(false);await cold.ev('sectorOffline.sync(networkApi)');
    const oldTotal=await cold.ev('builderWorkbenchTotals().total');
    const chosenId=await cold.ev('builderUi.army.entries[0].unitId');
    const chosen=real.units.find(u=>u.id===chosenId);for(const price of chosen.points)price.points+=7;real.version+=' · test points';
    await online.ev(`networkApi('builderImport',{catalog:${JSON.stringify(real)}})`);
    await cold.ev('sectorOffline.sync(networkApi)');
    await cold.wait('builderWorkbenchTotals().total==='+String(oldTotal+7),45000);
    console.log('PASS full real catalog migration and points refresh');
    const usage=await cold.ev('navigator.storage.estimate()');
    console.log('PASS full real catalog offline; storage estimate: '+JSON.stringify(usage));
  }
  assert.deepEqual(logs,[],'Unexpected browser exceptions');
  console.log('PASS 390/1440 viewport overflow and browser exceptions');
  console.log('Artifacts: '+dir);
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  ws?.close();if(server&&server.exitCode===null)server.kill();
  if(browser&&browser.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(browser.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else browser.kill();}
});
