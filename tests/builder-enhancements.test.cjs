'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let compiled,fixture;
function php(file,args=[]){const r=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit=256M',path.join(__dirname,file),...args],{encoding:'utf8',maxBuffer:40e6});assert.equal(r.status,0,r.stderr+r.stdout.slice(0,500));return JSON.parse(r.stdout);}
function context(){compiled??=php('effects-model.php');fixture??=php('automation-model.php');const c=vm.createContext({fixture:structuredClone(fixture),crypto:require('node:crypto').webcrypto,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),notify(){}});for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com',f),'utf8'),c);vm.runInContext("builderUi.catalog=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};wbAdd('term');",c);c.compiled=compiled;return c;}
test('Compiler handles qualified upgrades, compound enhancements and old stored catalogs while rejecting conditional clauses',()=>{context();assert.equal(compiled.furious[0].weaponType,'melee');assert.equal(compiled.damage.length,2);assert.equal(compiled.multi.length,2);assert.equal(compiled.charge.length,0);});
test('Furious Assault adds a blue qualified keyword to melee profiles in Build and Play without modifying the source',()=>{
 const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get(e.unitId);const before=JSON.stringify(u.weapons);u.enhancements=[{id:'furious',name:'Furious Assault',upgrade:'true',effectsJson:JSON.stringify(compiled.furious)}];e.enhancementIds=['furious'];const derived=beEffects(u,e).unit;`,c);
 assert.match(vm.runInContext('wbDescription(derived.weapons[0])',c),/SUSTAINED HITS 1: NON-MONSTER\/VEHICLE/);
 assert.doesNotMatch(vm.runInContext('wbDescription(derived.weapons[3])',c),/SUSTAINED/);
 assert.equal(vm.runInContext('JSON.stringify(u.weapons)===before',c),true);
 for(const expr of ['wbProfiles(u,e,false)','wbAttachedProfiles([e])']){const html=vm.runInContext(expr,c);assert.match(html,/wb-weapon-keyword wb-bonus[^>]*[^]*?\[SUSTAINED HITS 1: NON-MONSTER\/VEHICLE\]/);}
 vm.runInContext('e.enhancementIds=[];',c);assert.doesNotMatch(vm.runInContext('wbProfiles(u,e,false)',c),/SUSTAINED HITS 1: NON-MONSTER/);
});
test('Native stronger keywords retain their original color; situational enhancements remain text only',()=>{
 const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get(e.unitId);u.effects=[];u.weapons[0].description='SUSTAINED HITS 1';u.enhancements=[{id:'f',upgrade:'true',effectsJson:JSON.stringify(compiled.furious)}];e.enhancementIds=['f'];const derived=beEffects(u,e).unit;`,c);
 assert.equal(vm.runInContext('derived.weapons[0].description',c),'SUSTAINED HITS 1');assert.equal(vm.runInContext('derived.weapons[0]._addedKeywords?.length||0',c),0);
 vm.runInContext(`u.enhancements[0].effectsJson=JSON.stringify([...compiled.charge,...compiled.situational]);`,c);assert.equal(vm.runInContext('beEffects(u,e).unit.weapons[0].A===u.weapons[0].A',c),true);
});
test('Bearer stats and new unit abilities are highlighted and do not propagate to attached bodyguards',()=>{
 const c=context();vm.runInContext(`wbAdd('leader');const body=builderUi.army.entries[0],e=builderUi.army.entries[1],u=wbUnits().get(e.unitId);e.attachedTo=body.entryId;u.models=[{line:'1',name:'Bearer',OC:'1'}];u.loadoutRecipe=null;e.models=1;u.enhancements=[{id:'e',effectsJson:JSON.stringify([...compiled.oc,...compiled.ap,...compiled.stealth])}];e.enhancementIds=['e'];const derived=beEffects(u,e).unit;`,c);
 assert.equal(vm.runInContext('derived.models[0].OC',c),'5');assert.equal(vm.runInContext(`derived.models[0]._changed.includes('OC')`,c),true);
 assert.equal(vm.runInContext('beEffects(wbUnits().get(body.unitId),body).unit.models[0].OC===wbUnits().get(body.unitId).models[0].OC',c),true);
 assert.match(vm.runInContext('wbSheetRules(derived)',c),/wb-bonus[^>]*>Stealth/);
 assert.equal(vm.runInContext('u.abilities.some(r=>r.name===\'Stealth\')',c),false);
});
test('Real Deathwing Knights gain Furious Assault on equipped melee weapons from an existing catalog', {skip:!process.env.BUILDER_CATALOG_PATH},()=>{
 const c=context();c.real=php('effects-model.php',[process.env.BUILDER_CATALOG_PATH]);vm.runInContext(`builderUi.catalog=real;builderUi.army=builderWorkbenchNewArmy();builderUi.army.factionId='sm_dark_angels';builderUi.army.entries=[];const u=real.units.find(u=>u.name==='Deathwing Knights');wbAdd(u.id);const e=builderUi.army.entries[0],upgrade=u.enhancements.find(x=>x.name==='Furious Assault');e.enhancementIds=[upgrade.id];const derived=beEffects(u,e).unit;`,c);
 assert.ok(vm.runInContext(`derived.weapons.filter(w=>w.type==='Melee'&&e.weaponCounts[w.line]>0).every(w=>/SUSTAINED HITS 1/i.test(wbDescription(w)))`,c));
 assert.match(vm.runInContext('wbAttachedProfiles([e])',c),/wb-weapon-keyword wb-bonus/);assert.match(vm.runInContext("wbDescription(derived.weapons.find(w=>w.name==='Mace of Absolution'))",c),/SUSTAINED HITS 1: NON-MONSTER/);assert.equal(vm.runInContext("derived.weapons.find(w=>w.name==='Great Weapon of the Unforgiven')._addedKeywords?.length||0",c),0);
});
