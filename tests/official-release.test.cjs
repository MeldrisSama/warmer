'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('Official package preserves production identity, excludes private data and rejects tampering and test destinations',t=>{
  const output=path.join(root,'.taste-skill','official-release-check-'+Date.now());
  t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
  const built=spawnSync(process.execPath,[path.join(root,'scripts/build-official-release.cjs'),'--output',output],{encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
  assert.equal(manifest.environment,'warhammer-production');assert.ok(manifest.files.length>70);assert.equal(manifest.files.at(-1).file,'service-worker.php');
  assert.ok(!manifest.files.some(f=>/config\.php|seed|sqlite|uploads\/|private\/|test-status/.test(f.file)));
  const app=path.join(output,'files/warhammer');
  assert.equal(JSON.parse(fs.readFileSync(path.join(app,'manifest.webmanifest'),'utf8')).name,'Cronache del settore');
  const index=fs.readFileSync(path.join(app,'index.php'),'utf8');assert.match(index,/apple-mobile-web-app-title" content="Cronache del settore"/);assert.match(index,/class="brand-logo"/);assert.doesNotMatch(index,/Cangiolone TEST/);
  assert.match(fs.readFileSync(path.join(app,'api.php'),'utf8'),/session_name\('sector_session'\)/);
  assert.ok(fs.existsSync(path.join(app,'league-roster.php')));
  if(process.platform==='win32'){
    const run=extra=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(output,'Upload-Cronache.ps1'),'-CheckOnly',...extra],{encoding:'utf8'});
    let result=run([]);assert.equal(result.status,0,result.stdout+result.stderr);
    result=run(['-RemoteDirectory','/cangiolone.com/warhammer-test']);assert.notEqual(result.status,0);assert.match(result.stderr,/Destinazione non consentita/);
    fs.appendFileSync(path.join(app,'index.php'),'tampered');result=run([]);assert.notEqual(result.status,0);assert.match(result.stderr,/File locale diverso/);
  }
});
