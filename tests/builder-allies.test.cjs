'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let fixture;
function catalog(file){if(!file&&fixture)return structuredClone(fixture);const r=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit=256M',path.join(__dirname,'allies-model.php'),...(file?[file]:[])],{encoding:'utf8',maxBuffer:40e6});assert.equal(r.status,0,r.stderr+r.stdout.slice(0,200));const c=JSON.parse(r.stdout);if(!file)fixture=c;return c;}
function context(catalog){const c=vm.createContext({esc:String,crypto:require('node:crypto').webcrypto});for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com',f),'utf8'),c);c.fixture=catalog;vm.runInContext('builderUi.catalog=fixture;',c);return c;}
function visible(c,fid,dets=[]){c.choice={factionId:fid,detachmentIds:dets,entries:[],limit:2000};vm.runInContext('builderUi.army=choice;',c);return Array.from(vm.runInContext('beCatalogIds()',c));}
test('Server gates borrowed aliases, enforces points and repairs old catalogs without rewriting them',()=>{catalog();});
test('Catalog hides locked allies, reveals the correct contingent and removes it again without duplicate sheets',()=>{
  const c=context(catalog());for(const [fid,name,det] of [['gc','Cadian Squad','brood'],['gc','Lictor','final'],['qi','Skitarii Rangers','forge'],['qt','Cultists','fief'],['cd','Chaos Lord','shadow'],['sm_dark_angels','DW Squad','support']]){
    const names=ids=>ids.map(id=>c.fixture.units.find(u=>u.id===id).name);
    assert.ok(!names(visible(c,fid)).includes(name),`${fid}: leaked ${name}`);
    assert.equal(names(visible(c,fid,[det])).filter(n=>n===name).length,1,`${fid}: duplicate or missing ${name}`);
    assert.ok(!names(visible(c,fid)).includes(name));
  }
  assert.ok(!visible(c,'gc',['brood']).includes('forbidden'));
  assert.ok(visible(c,'dru').includes('troupe'));assert.ok(visible(c,'dru').includes('corsair'));
  assert.ok(visible(c,'dru',['reapers']).includes('troupe'));assert.ok(!visible(c,'dru',['reapers']).includes('corsair'));
  assert.ok(visible(c,'sm_deathwatch').includes('deathwatch'));
  assert.ok(!visible(c,'sm_dark_angels').includes('rangers_alias'),'Freeblades leaked Mechanicus');
  assert.ok(!visible(c,'qt').includes('lord_alias'),'Daemonic Pact leaked CSM');
});
test('Real catalog keeps conditional imported datasheets out of the native catalog', {skip:!process.env.BUILDER_CATALOG_PATH},()=>{
  const data=catalog(process.env.BUILDER_CATALOG_PATH),c=context(data),units=new Map(data.units.map(u=>[u.id,u]));
  const has=(u,k)=>u.keywords.split(',').some(s=>s.trim().toLowerCase()===k.toLowerCase());
  for(const [fid,key,det] of [['gc','Astra Militarum','Brood Brother Auxilia'],['gc','Tyranids','Final Day'],['qi','Adeptus Mechanicus','Questor Forgepact'],['qt','Damned','Iconoclast Fiefdom'],['cd','Heretic Astartes','Shadow Legion'],['sm_dark_angels','Deathwatch','Deathwatch Support']]){
    const faction=data.factions.find(f=>f.id===fid),did=faction.detachments.find(d=>d.name===det)?.id;assert.ok(did,det);
    // Agents of the Imperium have separate, unconditional permission for their
    // own Deathwatch datasheets; only Astartes versions require Support.
    const matches=id=>has(units.get(id),key)&&(key!=='Deathwatch'||units.get(id).factionId==='sm');
    assert.equal(visible(c,fid).filter(matches).length,0,fid+' leaked '+key);
    assert.ok(visible(c,fid,[did]).some(matches),fid+' failed to unlock '+key);
  }
  const dru=data.factions.find(f=>f.id==='dru'),reapers=dru.detachments.find(d=>/Reaper/.test(d.name)).id;
  assert.ok(!visible(c,'dru',[reapers]).some(id=>has(units.get(id),'Anhrathe')));
  for(const faction of data.factions)for(const rule of faction.allies||[]){
    if(rule.id==='freeblades')assert.ok(!rule.unitIds.some(id=>has(units.get(id),'Adeptus Mechanicus')));
    if(rule.id==='dreadblades')assert.ok(!rule.unitIds.some(id=>has(units.get(id),'Damned')||has(units.get(id),'Heretic Astartes')));
    if(rule.id==='daemonic_pact')assert.ok(!rule.unitIds.some(id=>has(units.get(id),'Heretic Astartes')));
  }
});
