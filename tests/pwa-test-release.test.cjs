'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const net=require('node:net'),{once}=require('node:events');
const root=path.resolve(__dirname,'..'),php=process.env.PHP_BINARY||'php';
test('Test release isolates config, database, sessions and offline storage; FTPS validation rejects changed files and production destinations',async()=>{
  const output=path.join(root,'.taste-skill','release-check-'+Date.now());
  const built=spawnSync(process.execPath,[path.join(root,'scripts/build-pwa-test-release.cjs'),'--catalog',process.env.PWA_TEST_CATALOG_PATH||path.join(__dirname,'workbench-fixture.json'),'--output',output],{encoding:'utf8',env:{...process.env,PHP_BINARY:php}});
  assert.equal(built.status,0,built.stdout+built.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
  assert.equal(manifest.environment,'warhammer-pwa-test');assert.ok(manifest.files.length>40);
  assert.ok(manifest.files.every(f=>f.file.startsWith('warhammer-test/')||f.file.startsWith('mdb-database/warhammer-pwa-test/')));
  assert.deepEqual(manifest.files.filter(f=>f.initialOnly).map(f=>f.file).sort(),['mdb-database/warhammer-pwa-test/seed.sqlite.gz','warhammer-test/config.php']);
  assert.ok(!manifest.files.some(f=>/SETUP-CODE|LocalSettings|uploads\//.test(f.file)));
  const app=path.join(output,'files/warhammer-test'),code=fs.readFileSync(path.join(output,'SETUP-CODE.txt'),'utf8').trim();
  const probe=spawnSync(php,['-r','$c=require $argv[1];$p=new PDO("sqlite:".$argv[2]);echo json_encode([$c["setup_hash"],$c["database"]["driver"],$p->query("SELECT COUNT(*) FROM w40k_users")->fetchColumn(),$p->query("SELECT COUNT(*) FROM w40k_builder_active")->fetchColumn()]);',path.join(app,'config.php'),path.join(output,'local-seed.sqlite')],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);assert.deepEqual(JSON.parse(probe.stdout),[crypto.createHash('sha256').update(code).digest('hex'),'sqlite',0,1]);
  assert.match(fs.readFileSync(path.join(app,'api.php'),'utf8'),/session_name\('sector_pwa_test'\)/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app,'manifest.webmanifest'),'utf8')).short_name,'Cangiolone TEST');
  assert.match(fs.readFileSync(path.join(app,'offline.js'),'utf8'),/indexedDB.open\('sector-offline:'\+namespace/);
  const prefixes=['/warhammer/service-worker.php','/warhammer-test/service-worker.php'].map(scope=>{
    const r=spawnSync(php,['-r','$_SERVER["SCRIPT_NAME"]=$argv[1];require $argv[2];',scope,path.join(app,'service-worker.php')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.match(/const cachePrefix='([^']+)'/)[1];
  });
  assert.notEqual(prefixes[0],prefixes[1]);
  const protection=fs.readFileSync(path.join(output,'files/mdb-database/warhammer-pwa-test/web.config'),'utf8');
  assert.match(protection,/<hiddenSegments><add segment="warhammer-pwa-test"\/>/);assert.doesNotMatch(protection,/<authorization>/);
  assert.match(fs.readFileSync(path.join(output,'Upload-PwaTest.ps1'),'utf8'),/\$PublicOrigin = 'https:\/\/www\.cangiolone\.com'/);
  const seedPath=path.join(output,'files/mdb-database/warhammer-pwa-test/pwa.sqlite');
  assert.equal(fs.existsSync(seedPath),false);
  const router=path.join(output,'qa-router.php');
  fs.writeFileSync(router,`<?php if(str_starts_with($_SERVER['REQUEST_URI'],'/mdb-database/')){http_response_code(404);return true;}$_SERVER['REQUEST_URI']=substr($_SERVER['REQUEST_URI'],strlen('/warhammer-test'))?:'/';if(str_starts_with($_SERVER['REQUEST_URI'],'/test-status.php')){require __DIR__.'/files/warhammer-test/test-status.php';return true;}return require __DIR__.'/files/warhammer-test/router.php';`);
  fs.mkdirSync(path.join(output,'sessions'));
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const server= require('node:child_process').spawn(php,['-d','session.save_path='+path.join(output,'sessions'),'-S','127.0.0.1:'+port,'-t',path.join(output,'files'),router],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  server.stderr.on('data',()=>{});
  const base='http://127.0.0.1:'+port+'/warhammer-test/';
  try{
    let response;for(let i=0;i<100;i++){try{response=await fetch(base+'index.php');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
    assert.ok(response?.ok,'Package PHP server did not start');
    assert.match(await response.text(),/Cangiolone TEST/);
    const blocked=await fetch(base+'test-status.php');assert.equal(blocked.status,404);
    const beforeInstall=await (await fetch(base+'test-status.php',{headers:{'X-PWA-Setup':code}})).json();assert.equal(beforeInstall.database_present,false);
    const denied=await fetch(base+'test-status.php',{method:'POST'});assert.equal(denied.status,404);assert.equal(fs.existsSync(seedPath),false);
    const gzPath=path.join(output,'files/mdb-database/warhammer-pwa-test/seed.sqlite.gz'),validGz=fs.readFileSync(gzPath);
    fs.writeFileSync(gzPath,require('node:zlib').gzipSync(Buffer.from('not the trusted seed')));
    const invalidSeed=await fetch(base+'test-status.php',{method:'POST',headers:{'X-PWA-Setup':code}});assert.equal(invalidSeed.status,409);assert.equal(fs.existsSync(seedPath),false);
    assert.equal(fs.readdirSync(path.dirname(seedPath)).some(f=>f.endsWith('.tmp')),false);
    fs.writeFileSync(gzPath,validGz);
    const installed=await fetch(base+'test-status.php',{method:'POST',headers:{'X-PWA-Setup':code}});assert.equal(installed.status,200,await installed.text());
    const status=await (await fetch(base+'test-status.php',{headers:{'X-PWA-Setup':code}})).json();
    assert.equal(status.sqlite_available,true);assert.equal(status.database_readable,true);assert.equal(status.database_writable,true);assert.equal(status.catalog_ready,true);assert.equal(status.account_ready,false);
    const before=await fetch(base+'api.php?action=state'),state=await before.json();assert.equal(state.setup,true);
    const cookie=before.headers.getSetCookie().find(c=>c.startsWith('sector_pwa_test=')).split(';')[0];
    const registered=await fetch(base+'api.php?action=setup',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:JSON.stringify({username:'iphonecheck',name:'iPhone Check',password:'IsolatedPwa2026!',code})});
    assert.equal(registered.status,200,await registered.text());
    const after=await (await fetch(base+'test-status.php',{headers:{'X-PWA-Setup':code}})).json();assert.equal(after.account_ready,true);
    const repeated=await (await fetch(base+'test-status.php',{method:'POST',headers:{'X-PWA-Setup':code}})).json();assert.equal(repeated.account_ready,true);
  }finally{if(server.exitCode===null){const closed=once(server,'close');server.kill();await closed;}}

  if(process.platform==='win32'){
    const command=extra=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(output,'Upload-PwaTest.ps1'),...extra],{encoding:'utf8'});
    const checked=command(['-CheckOnly']);assert.equal(checked.status,0,checked.stdout+checked.stderr);
    assert.notEqual(command(['-RemoteRoot','/cangiolone.com/warhammer','-CheckOnly']).status,0);
    const file=path.join(app,'offline.js'),original=fs.readFileSync(file);fs.appendFileSync(file,'\n// changed\n');
    try{const invalid=command(['-CheckOnly']);assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Checksum non valido/);}finally{fs.writeFileSync(file,original);}
  }
});
