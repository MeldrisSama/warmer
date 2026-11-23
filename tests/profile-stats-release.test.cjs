'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('Profile/stats release includes only reviewed files and rejects wrong destinations, tampering and extra files',t=>{
  const output=path.join(root,'.taste-skill','profile-release-test-'+Date.now());
  t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
  const built=spawnSync(process.execPath,[path.join(root,'scripts/build-profile-stats-release.cjs'),'--output',output],{encoding:'utf8'});
  assert.equal(built.status,0,built.stdout+built.stderr);
  const manifestPath=path.join(output,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.files.length,12);assert.equal(manifest.files.at(-1).file,'service-worker.php');
  assert.ok(manifest.files.some(f=>f.file==='statistics.js'));assert.ok(manifest.files.some(f=>f.file==='storage.php'));
  assert.ok(!manifest.files.some(f=>/league-roster|config|uploads|sqlite/.test(f.file)));
  if(process.platform==='win32'){
    const run=extra=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(output,'Upload-Profilo-Statistiche.ps1'),'-CheckOnly',...extra],{encoding:'utf8'});
    let result=run([]);assert.equal(result.status,0,result.stdout+result.stderr);
    result=run(['-RemoteDirectory','/warhammer-test']);assert.notEqual(result.status,0);
    const app=path.join(output,'files/warhammer/app.js'),original=fs.readFileSync(app);
    fs.appendFileSync(app,'tampered');result=run([]);assert.notEqual(result.status,0);assert.match(result.stderr,/File locale diverso/);fs.writeFileSync(app,original);
    manifest.files.splice(0,0,{file:'league-roster.php',sha256:'unexpected'});fs.writeFileSync(manifestPath,JSON.stringify(manifest));
    result=run([]);assert.notEqual(result.status,0);assert.match(result.stderr,/File estraneo/);
    const checked=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(output,'Pubblica-PR.ps1'),'-CheckOnly'],{encoding:'utf8'});
    assert.equal(checked.status,0,checked.stdout+checked.stderr);
  }
});
