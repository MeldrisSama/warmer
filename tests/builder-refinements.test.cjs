'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
let fixture;
function context(){
  if(!fixture){const r=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'refinements-model.php')],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);fixture=JSON.parse(r.stdout);}
  const c=vm.createContext({fixture:structuredClone(fixture),crypto:require('node:crypto').webcrypto,notify(){},esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))});
  for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',f),'utf8'),c);
  vm.runInContext(`builderUi.catalog=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};wbAdd('signal');`,c);return c;
}
test('PHP enforces shared model limits, fixed enhancement weapons, Warlord eligibility and snapshot ownership',()=>{context();});
test('Unified sheet puts controls after defence and before weapons, omits unavailable upgrades and deduplicates prices',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal');u.points.push({...u.points[0]});u.enhancements=[{id:'hidden',name:'Unavailable',detachment_id:'unselected'}];workbench.selected=e.entryId;`,c);
  const html=vm.runInContext('wbDetail()',c);assert.ok(html.indexOf('wb-defence-table')<html.indexOf('wb-unit-controls'));assert.ok(html.indexOf('wb-unit-controls')<html.indexOf('wb-weapon-table'));assert.doesNotMatch(html,/wb-detail-tabs|Potenziamenti|class="wb-upgrades"|Unavailable/);assert.equal((vm.runInContext('wbCosts(u)',c).match(/<th scope="row">3 models/g)||[]).length,1);
});
test('Build and Play transitions reset all panel scroll positions',()=>{
  const c=context(),panels=[{scrollTop:25},{scrollTop:600},{scrollTop:1800}];c.main={querySelectorAll:()=>panels};vm.runInContext(`wbSetMode('play')`,c);assert.ok(panels.every(p=>p.scrollTop===0));panels.forEach(p=>p.scrollTop=700);vm.runInContext(`wbSetMode('build')`,c);assert.ok(panels.every(p=>p.scrollTop===0));
});
test('Minimal exports contain only requested fields, full exports omit IDs and validation metadata',()=>{
  const c=context();c.state={user:{name:'Test'}};vm.runInContext(`wbAdd('guard');const child=builderUi.army.entries[0],parent=builderUi.army.entries[1];wbUnits().get(child.unitId).leads=['guard'];child.attachedTo=parent.entryId;`,c);
  assert.equal(vm.runInContext(`beExportText('names')`,c),'Signal Squad\nGuard');const short=vm.runInContext(`beExportText('units')`,c);assert.equal(short.split('\n').length,2);assert.match(short,/3x Signal Squad/);assert.doesNotMatch(short,/Rifle|Attached|Catalog/);
  for(const format of ['gw','wtc']){c.format=format;const text=vm.runInContext('beExportText(format)',c);assert.match(text,/Attached to: Guard/);assert.ok(!text.includes(vm.runInContext('parent.entryId',c)));assert.doesNotMatch(text,/VALIDATION|MANUAL REVIEW|Catalog:/);}
});
test('Launcher replacement selects one model and disables the other models at the shared limit',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal'),g=u.loadoutRecipe.groups;beChangeChoice(e,g[0].id,'choice1',1);`,c);
  assert.equal(vm.runInContext(`beChangeChoice(e,g[1].id,'choice1',1)`,c),false);assert.equal(vm.runInContext(`e.weaponCounts['2']`,c),1);
  assert.equal(vm.runInContext(`beWeaponOwners(u,e,u.weapons[1])[0].name`,c),'Keeper');assert.equal(vm.runInContext(`beWeaponLimit(u,e,'2')`,c),1);
  assert.equal(vm.runInContext(`beChoiceAllowed(u,e,g[1],'choice1',1)`,c),false);
});
test('Shield changes only equipped models, keeps the source and marks the new W value',()=>{
  const c=context();vm.runInContext(`wbAdd('guard');const e=builderUi.army.entries[1],u=wbUnits().get('guard'),g=u.loadoutRecipe.groups[0];beChangeChoice(e,g.id,'choice1',1);const derived=beEffects(u,e).unit;`,c);
  assert.equal(vm.runInContext(`derived.models.find(m=>m._gear?.includes('Shield')).W`,c),'4');assert.equal(vm.runInContext(`derived.models.find(m=>!m._gear).W`,c),'3');assert.equal(vm.runInContext(`u.models[0].W`,c),'3');assert.equal(vm.runInContext(`derived.models[0]._changed.includes('W')`,c),true);
});
test('Enhancement has exactly one immutable weapon and a named model bearer',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal');e.enhancementIds=['gift'];e.enhancementModels={gift:'3'};beSyncEnhancements(u,e);`,c);assert.equal(vm.runInContext(`e.weaponCounts['4']`,c),1);assert.equal(vm.runInContext(`beWeaponOwners(u,e,u.weapons[3])[0].name`,c),'Champion');
  vm.runInContext(`workbench.selected=e.entryId;wbChangeWeapon('4',1);`,c);assert.equal(vm.runInContext(`e.weaponCounts['4']`,c),1);
  vm.runInContext(`u.weapons[0].S='5';u.enhancements[0].effectsJson=JSON.stringify([{id:'bearer',source:'Gift',scope:'bearer',weaponType:'ranged',field:'S',operation:'add',value:1}]);const derived=beEffects(u,e).unit;`,c);
  assert.equal(vm.runInContext(`derived.weapons[0]._variants.find(w=>w._forModel==='Champion').S`,c),'6');assert.equal(vm.runInContext(`derived.weapons[0]._variants.find(w=>w._forModel==='Keeper').S`,c),'5');assert.equal(vm.runInContext(`u.weapons[0].S`,c),'5');
});
test('Fixed configurations omit size/default controls; keywords inside rule prose stay safe and clickable',()=>{
  const c=context();vm.runInContext(`const u=wbUnits().get('signal'),e=builderUi.army.entries[0];workbench.selected=e.entryId;workbench.detailTab='config';`,c);c.main={querySelector:()=>null};
  const html=vm.runInContext(`wbDetail()`,c);assert.doesNotMatch(html,/type="number"|Punti base manuali|data-wb-adjust="models"/);assert.match(html,/Opzioni avanzate/);
  vm.runInContext(`u.options=[]`,c);assert.equal(vm.runInContext(`beLoadoutHtml(u,e)`,c),'');
  const rich=vm.runInContext(`beRich('Attacks have [SUSTAINED HITS 1]. <script>bad</script>')`,c);assert.match(rich,/data-wb-rule="sustained"/);assert.doesNotMatch(rich,/<script>/);
});
test('Stratagems start collapsed, exclude Boarding Actions and include global core and chosen detachments',()=>{
  const c=context();vm.runInContext(`builderUi.catalog.stratagems=[{id:'core',name:'Core',type:'Core Stratagem',cp_cost:'1',turn:'Your turn',description:'EFFECT: Test.'},{id:'boarding',name:'Boarding',type:'Boarding Actions Stratagem'},{id:'chosen',name:'Chosen',detachment_id:'a'},{id:'other',name:'Other',detachment_id:'b'}];builderUi.army.detachmentIds=['a'];`,c);
  assert.equal(vm.runInContext(`wbAllStratagems().map(s=>s.id).join(',')`,c),'core,chosen');const html=vm.runInContext(`wbStratagems(builderUi.catalog.stratagems)`,c);assert.match(html,/<details class="wb-stratagem wb-turn-your">/);assert.doesNotMatch(html,/<details[^>]+\bopen\b|Boarding|Other/);
});
