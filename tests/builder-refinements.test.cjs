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

test('Phone additions keep the army visible, while desktop additions open the existing detail column',()=>{
  const c=context();assert.equal(vm.runInContext('workbench.pane',c),'detail');
  c.matchMedia=()=>({matches:true});vm.runInContext(`wbAdd('signal')`,c);assert.equal(vm.runInContext('workbench.pane',c),'roster');
  vm.runInContext('wbSelect(builderUi.army.entries[0].entryId)',c);assert.equal(vm.runInContext('workbench.pane',c),'detail');
  assert.equal(vm.runInContext(`wbMobileCategory({keywords:'Character, Mounted',category:'Other'})`,c),'Character');
  assert.equal(vm.runInContext(`wbMobileCategory({keywords:'Infantry',category:'Battleline'})`,c),'Battleline');
});

test('Identical named-model weapons combine quantities; different stats and alternative modes stay distinct',()=>{
  const c=context();c.rows=['Ancient','Apothecary','Champion'].map(model=>({unitId:'signal',model,count:1,weapon:{name:'Plasma Talon',range:'18',A:'2',BS_WS:'3',S:'7',AP:'-2',D:'1',description:''}}));
  let html=vm.runInContext('wbWeaponTable(rows)',c);assert.equal((html.match(/class="wb-weapon-name"/g)||[]).length,1);assert.match(html,/Plasma Talon <strong class="wb-weapon-count">\(×3\)<\/strong>/);assert.doesNotMatch(html,/>N\.</);assert.match(html,/Ancient, Apothecary, Champion/);
  c.rows[2].weapon={...c.rows[2].weapon,S:'8',_changed:['S']};html=vm.runInContext('wbWeaponTable(rows)',c);assert.equal((html.match(/class="wb-weapon-name"/g)||[]).length,2);
  c.rows=[{unitId:'signal',count:1,weapon:{name:'Cyclone Missile Launcher - Frag',A:'D6',description:''}},{unitId:'signal',count:1,weapon:{name:'Cyclone Missile Launcher - Krak',A:'2',description:''}}];
  html=vm.runInContext('wbWeaponTable(rows)',c);assert.doesNotMatch(html,/wb-weapon-family|profili alternativi/);assert.equal((html.match(/wb-mode-marker/g)||[]).length,2);assert.match(html,/Cyclone Missile Launcher - Frag/);assert.match(html,/Cyclone Missile Launcher - Krak/);
});

test('Ravenwing enhancement bearer is only the Champion; unit Upgrades have no bearer selection',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal');u.name='Ravenwing Command Squad';u.models.forEach((m,i)=>{m.name=['Ravenwing Ancient','Ravenwing Apothecary','Ravenwing Champion'][i];m.keywords='Mounted, Character';});e.enhancementIds=['gift'];beSyncEnhancements(u,e);`,c);
  assert.equal(vm.runInContext(`e.enhancementModels.gift`,c),'3');let html=vm.runInContext('beEnhancementsHtml(u,e)',c);assert.match(html,/>Ravenwing Champion<\/option>/);assert.doesNotMatch(html,/>Ravenwing Ancient<\/option>|>Ravenwing Apothecary<\/option>/);
  vm.runInContext(`u.enhancements[0].upgrade='true';beSyncEnhancements(u,e);`,c);html=vm.runInContext('beEnhancementsHtml(u,e)',c);assert.doesNotMatch(html,/Modello portatore/);assert.equal(vm.runInContext('Object.keys(e.enhancementModels).length',c),0);assert.equal(vm.runInContext(`beGearErrors(e).some(s=>s.includes('portatore'))`,c),false);
});

test('Paid wargear is labelled per bearer, including choices in the compact picker',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal'),g=u.loadoutRecipe.groups.find(g=>g.choices.length>1);u.loadoutRecipe.weapons.find(w=>g.choices[1].weapons[w.id]).cost=5;`,c);
  assert.match(vm.runInContext('beLoadoutGroupHtml(u,e,g)',c),/\+5 pt per modello/);
});

test('Combined loadouts show the retained melee weapon and chosen gun instead of duplicate option labels',()=>{
  const c=context();c.recipe={weapons:[{id:'choppa',name:'Kustom Choppa'},{id:'klaw',name:'Power Klaw'},{id:'rokkit',name:'Kombi-rokkit'}]};
  assert.equal(vm.runInContext(`beChoiceLabel(recipe,{name:'1 Kombi-rokkit',weapons:{klaw:1,rokkit:1}})`,c),'1 Power Klaw + 1 Kombi-rokkit');
  assert.equal(vm.runInContext(`beChoiceLabel(recipe,{name:'1 Kombi-rokkit',weapons:{choppa:1,rokkit:1}})`,c),'1 Kustom Choppa + 1 Kombi-rokkit');
});

test('Army groups keep Battleline and selected detachments open only through their reference popup',()=>{
  const c=context();assert.equal(vm.runInContext(`JSON.stringify(wbMobileCategories)`,c),JSON.stringify(['Character','Battleline','Infantry','Mounted','Vehicle','Other','Alleati']));
  vm.runInContext(`builderUi.catalog.factions[0].detachments=[{id:'alpha',name:'Alpha',dp:'1',force_disposition:'Take and Hold',description:'Rule'}];builderUi.army.detachmentIds=['alpha'];`,c);
  const html=vm.runInContext('wbArmySettings(true)',c);assert.match(html,/data-wb-detachment-rule="alpha"/);assert.doesNotMatch(html,/wb-detachment-resources|wb-detachment-rule-card/);
});

test('Datasheet rules are prominent cards, generic rules are in Other rules, long prose starts folded',()=>{
  const c=context();vm.runInContext(`const u=wbUnits().get('signal');u.abilities=[{name:'Own rule',type:'Datasheet',description:'Local rule'},{name:'Deep Strike',type:'Core',description:'Generic rule'},{name:'Long wargear',type:'Wargear',description:'Long rule '.repeat(70)}];`,c);
  const html=vm.runInContext('wbSheetRules(u)',c);assert.ok(html.indexOf('Own rule')<html.indexOf('Altre regole'));assert.ok(html.indexOf('Deep Strike')>html.indexOf('Altre regole'));assert.match(html,/<details class="wb-rule wb-rule-card wb-rule-long">/);assert.doesNotMatch(html,/<details class="wb-rule wb-rule-card wb-rule-long" open/);
  assert.match(html,/<details class="wb-rule wb-rule-card" open><summary><strong>Own rule/);assert.match(html,/<details class="wb-rule wb-rule-card" open><summary><strong>Deep Strike/);assert.doesNotMatch(html,/<article class="wb-rule wb-rule-card/);
  vm.runInContext(`u.leaderText='Compatible bodyguards.';`,c);assert.match(vm.runInContext('wbProfiles(u,builderUi.army.entries[0],false)',c),/<details class="wb-rule wb-rule-card" open><summary><strong>Leader \/ Support/);
});
test('Unified sheet puts controls after defence and before weapons, omits unavailable upgrades and deduplicates prices',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal');u.points.push({...u.points[0]});u.enhancements=[{id:'hidden',name:'Unavailable',detachment_id:'unselected'}];workbench.selected=e.entryId;`,c);
  const html=vm.runInContext('wbDetail()',c);assert.ok(html.indexOf('wb-defence-table')<html.indexOf('wb-unit-controls'));assert.ok(html.indexOf('wb-unit-controls')<html.indexOf('wb-weapon-table'));assert.doesNotMatch(html,/wb-detail-tabs|Potenziamenti|class="wb-upgrades"|Unavailable/);assert.equal((vm.runInContext('wbCosts(u)',c).match(/<th scope="row">3 models/g)||[]).length,1);
});
test('Build and Play transitions reset all panel scroll positions',()=>{
  const c=context(),panels=[{scrollTop:25},{scrollTop:600},{scrollTop:1800}];c.main={querySelectorAll:()=>panels};vm.runInContext(`wbSetMode('play')`,c);assert.ok(panels.every(p=>p.scrollTop===0));panels.forEach(p=>p.scrollTop=700);vm.runInContext(`wbSetMode('build')`,c);assert.ok(panels.every(p=>p.scrollTop===0));
});
test('Minimal exports contain only requested fields, full exports omit IDs and validation metadata',()=>{
  const c=context();c.state={user:{name:'Test'}};vm.runInContext(`wbAdd('guard');const child=builderUi.army.entries[0],parent=builderUi.army.entries[1];wbUnits().get(child.unitId).leads=['guard'];child.attachedTo=parent.entryId;`,c);
  vm.runInContext(`builderUi.army.name='Test list';builderUi.catalog.factions[0].detachments=[{id:'alpha',name:'Alpha detachment',dp:'1'}];builderUi.army.detachmentIds=['alpha'];child.enhancementIds=['gift'];child.enhancementModels={gift:'3'};beSyncEnhancements(wbUnits().get(child.unitId),child)`,c);
  assert.equal(vm.runInContext(`beExportText('names')`,c),'Signal Squad\nGuard');const short=vm.runInContext(`beExportText('units')`,c);assert.match(short,/^Test list\n/);assert.match(short,/210 \/ 2000 pt/);assert.match(short,/Alpha detachment/);assert.match(short,/Enhancement: Gift Sword/);assert.match(short,/3x Signal Squad/);assert.doesNotMatch(short,/Rifle|Attached|Catalog/);
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
  const html=vm.runInContext(`wbDetail()`,c);assert.doesNotMatch(html,/type="number"|Punti base manuali|data-wb-adjust="models"/);assert.match(html,/data-wb-unit-options=/);
  vm.runInContext(`u.options=[]`,c);assert.equal(vm.runInContext(`beLoadoutHtml(u,e)`,c),'');
  const rich=vm.runInContext(`beRich('Attacks have [SUSTAINED HITS 1]. <script>bad</script>')`,c);assert.match(rich,/data-wb-rule="sustained"/);assert.doesNotMatch(rich,/<script>/);
});
test('Mandatory Warlord is chosen by its rule on add and can correct an old draft',()=>{
  const c=context();vm.runInContext(`const commander=builderClone(wbUnits().get('signal'));commander.id='commander';commander.name='Commander';commander.abilities=[{name:'Supreme Commander',description:'If this model is in your army, it must be your WARLORD.'}];fixture.units.push(commander);fixture.factions[0].unitIds.push('commander');builderUi.army.entries[0].warlord=true;wbAdd('commander');`,c);
  assert.equal(vm.runInContext(`builderUi.army.entries[1].warlord`,c),true);assert.equal(vm.runInContext(`builderUi.army.entries[0].warlord`,c),false);
  vm.runInContext(`builderUi.army.entries[1].warlord=false;builderUi.army.entries[0].warlord=true;wbApplyRequiredWarlord()`,c);assert.equal(vm.runInContext(`builderUi.army.entries[1].warlord`,c),true);
  vm.runInContext(`builderUi.army.entries[1].warlord=false`,c);assert.equal(vm.runInContext(`wbSetMode('play')`,c),false);
});
test('Catalog categories start collapsed, retain a chosen opening and reveal search results',()=>{
  const c=context();assert.doesNotMatch(vm.runInContext('wbCatalogList()',c),/<details\s+open\b/);
  vm.runInContext(`workbench.categoryOpen['sm:Character']=true`,c);assert.match(vm.runInContext('wbCatalogList()',c),/<details open class="wb-category" data-wb-category="Character"/);
  vm.runInContext(`workbench.categoryOpen={};workbench.search='Signal'`,c);assert.match(vm.runInContext('wbCatalogList()',c),/<details open/);
});
test('Attached members have individual Build sheets and a combined Play sheet',()=>{
  const c=context();vm.runInContext(`wbAdd('guard');const child=builderUi.army.entries[0],parent=builderUi.army.entries[1];wbUnits().get(child.unitId).leads=['guard'];child.attachedTo=parent.entryId;workbench.selected=child.entryId`,c);
  assert.doesNotMatch(vm.runInContext('wbDetail()',c),/class="wb-attached-profiles"/);assert.equal((vm.runInContext('wbRosterRows()',c).match(/aria-pressed="true"/g)||[]).length,1);
  vm.runInContext(`workbench.mode='play'`,c);const play=vm.runInContext('wbDetail()',c);assert.match(play,/class="wb-attached-profiles"/);assert.match(play,/Guard/);assert.match(play,/Keeper/);assert.doesNotMatch(play,/data-wb-unit-options/);
});
test('Closing an error notification keeps validation and the error returns if fixed then reintroduced',()=>{
  const c=context();vm.runInContext(`wbUnits().get('signal').support=true;const error=wbSupportErrors()[0]`,c);assert.match(vm.runInContext('wbErrorNotices([error])',c),/role="alert"/);
  vm.runInContext(`workbench.hiddenErrors.push(error)`,c);assert.equal(vm.runInContext('wbErrorNotices([error])',c),'');assert.equal(vm.runInContext('wbSupportErrors().length',c),1);
  vm.runInContext('wbErrorNotices([])',c);assert.match(vm.runInContext('wbErrorNotices([error])',c),/data-wb-dismiss-error/);
});
test('Backdrop closes a dialog while its padding and children keep it open',()=>{
  const c=context();let click,closed=0;const dialog={addEventListener(event,fn){click=fn;},getBoundingClientRect:()=>({left:10,right:100,top:10,bottom:100}),close(){closed++;}};c.dialog=dialog;vm.runInContext('wbCloseOnBackdrop(dialog)',c);
  click({target:dialog,clientX:20,clientY:20});click({target:{},clientX:2,clientY:2});assert.equal(closed,0);click({target:dialog,clientX:2,clientY:20});assert.equal(closed,1);
});
test('Fixed simple units omit source and cost drawers but retain compact extra options',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('signal');u.options=[];u.composition=[{description:'3 models'}]`,c);const html=vm.runInContext('wbUnitControls(u,e)',c);assert.doesNotMatch(html,/Dotazione di fonte|Costi e composizione|Opzioni avanzate|Opzioni di equipaggiamento/);assert.match(html,/data-wb-unit-options/);
});
test('Stratagems start collapsed, exclude Boarding Actions and include global core and chosen detachments',()=>{
  const c=context();vm.runInContext(`builderUi.catalog.stratagems=[{id:'core',name:'Core',type:'Core Stratagem',cp_cost:'1',turn:'Your turn',description:'EFFECT: Test.'},{id:'boarding',name:'Boarding',type:'Boarding Actions Stratagem'},{id:'chosen',name:'Chosen',detachment_id:'a'},{id:'other',name:'Other',detachment_id:'b'}];builderUi.army.detachmentIds=['a'];`,c);
  assert.equal(vm.runInContext(`wbAllStratagems().map(s=>s.id).join(',')`,c),'core,chosen');const html=vm.runInContext(`wbStratagems(builderUi.catalog.stratagems)`,c);assert.match(html,/<details class="wb-stratagem wb-turn-your">/);assert.doesNotMatch(html,/<details[^>]+\bopen\b|Boarding|Other/);
});
