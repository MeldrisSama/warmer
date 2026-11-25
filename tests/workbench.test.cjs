'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=join(__dirname,'..');
function context(){
  const c=vm.createContext({crypto:require('node:crypto').webcrypto,structuredClone});
  vm.runInContext(readFileSync(join(root,'Cangiolone.com/builder.js'),'utf8'),c);
  vm.runInContext(readFileSync(join(root,'Cangiolone.com/builder-engine.js'),'utf8'),c);
  vm.runInContext(readFileSync(join(root,'Cangiolone.com/builder-workbench.js'),'utf8'),c);
  c.fixture=JSON.parse(readFileSync(join(__dirname,'workbench-fixture.json'),'utf8'));
  vm.runInContext(`builderUi.catalog=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};wbAdd('squad');wbAdd('squad');wbAdd('squad');wbAdd('leader');wbAdd('support');builderUi.army.entries[3].attachedTo=builderUi.army.entries[0].entryId;builderUi.army.entries[4].attachedTo=builderUi.army.entries[0].entryId;`,c);
  return c;
}
test('Workbench PHP validates and persists catalog, tiers, equipment and groups',()=>{
  const r=spawnSync(process.env.PHP_BINARY||'php',[join(__dirname,'workbench-model.php')],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});
test('JS tier pricing agrees with PHP; attached members are counted once',()=>{
  const c=context();assert.equal(vm.runInContext('builderWorkbenchTotals().total',c),340);
  assert.equal(vm.runInContext('wbGroup(builderUi.army.entries[0]).length',c),3);
  vm.runInContext('builderUi.army.entries.splice(1,1)',c);
  assert.equal(vm.runInContext('builderWorkbenchTotals().total',c),240);
});
test('Unique groups and DP disable incompatible detachments; manual prices remain explicit',()=>{
  const c=context();vm.runInContext(`builderUi.army.detachmentIds=['first'];`,c);
  assert.equal(vm.runInContext(`wbDetachmentConflict(wbFaction().detachments[1])`,c),'UNIQUE: TEST');
  vm.runInContext('builderUi.army.dpLimit=2',c);
  assert.equal(vm.runInContext(`wbDetachmentConflict(wbFaction().detachments[2])`,c),'Budget DP insufficiente');
  vm.runInContext('builderUi.army.entries[0].models=7',c);
  assert.equal(vm.runInContext('wbPrice(builderUi.army.entries[0])',c),null);
});
test('Play opens member profiles immediately and escapes catalog text',()=>{
  const c=context();vm.runInContext(`const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));builderUi.army.entries[0].weaponCounts={'1':5};workbench.selected=builderUi.army.entries[0].entryId;workbench.mode='play';`,c);
  const html=vm.runInContext('wbDetail()',c);assert.match(html,/Rifle/);assert.match(html,/Leader test/);assert.match(html,/Support test/);assert.match(html,/Testo della regola/);
  vm.runInContext(`builderUi.catalog.units[0].name='<img src=x onerror=alert(1)>';`,c);
  assert.doesNotMatch(vm.runInContext('wbDetail()',c),/<img/);
});

test('Offline Play opens cached profiles, stays active and remains available in the mobile menu',()=>{
  const c=context();c.sectorOffline={unavailable:()=>true};c.notify=()=>{};
  c.api=()=>{throw Error('Play attempted a network request');};c.esc=v=>String(v??'');
  vm.runInContext("builderUi.army.entries[0].weaponCounts={'1':5};workbench.selected=builderUi.army.entries[3].entryId;wbSetMode('play')",c);
  assert.equal(vm.runInContext('workbench.mode',c),'play');
  assert.equal(vm.runInContext('workbench.selected===builderUi.army.entries[0].entryId',c),true);
  assert.match(vm.runInContext('wbDetail()',c),/Rifle/);
  assert.match(vm.runInContext('wbDetail()',c),/Testo della regola/);
  let menu='';c.wbModal=(_title,html)=>{menu=html;return {querySelector:()=>({addEventListener(){}}),addEventListener(){}};};
  vm.runInContext('wbOpenMobileMenu()',c);
  assert.match(menu,/data-wb-menu-mode="play" aria-pressed="true"/);
  const source=readFileSync(join(root,'Cangiolone.com/builder-workbench.js'),'utf8');
  c.page=()=> 'campionati';
  vm.runInContext(source.slice(source.indexOf('function builderWorkbenchRender('),source.indexOf('function wbDownload('))+'\nbuilderWorkbenchRender();',c);
  assert.equal(vm.runInContext('workbench.mode',c),'play','Offline rerender reset Play');
  vm.runInContext("workbench.mode='build';builderUi.army.entries[4].attachedTo=null;wbSetMode('play')",c);
  assert.equal(vm.runInContext('workbench.mode',c),'build','Offline bypassed list validation');
});
test('Weapon buttons increment and decrement safely without changing squad size',()=>{
  const c=context();
  vm.runInContext(`workbench.selected=builderUi.army.entries[0].entryId;wbChangeWeapon('1',1);`,c);
  assert.equal(vm.runInContext(`wbEntry(workbench.selected).weaponCounts['1']`,c),1);
  vm.runInContext(`wbChangeWeapon('1',-1);wbChangeWeapon('1',-1);wbChangeWeapon('unknown',1);`,c);
  assert.equal(vm.runInContext(`wbEntry(workbench.selected).weaponCounts['1']`,c),0);
  assert.equal(vm.runInContext(`wbEntry(workbench.selected).weaponCounts.unknown`,c),undefined);
  assert.equal(vm.runInContext(`wbEntry(workbench.selected).models`,c),5);
});
test('Attachment choices contain compatible copies and reserve one leader and one support',()=>{
  const c=context();
  assert.equal(vm.runInContext(`wbAttachmentTargets(builderUi.army.entries[3]).length`,c),3);
  vm.runInContext(`wbAdd('leader');`,c);
  assert.equal(vm.runInContext(`wbAttachmentTargets(builderUi.army.entries[5]).length`,c),2);
  assert.equal(vm.runInContext(`wbAttachmentTargets(builderUi.army.entries[0]).length`,c),0);
  assert.equal(vm.runInContext(`wbAttachmentTargets(builderUi.army.entries[4]).length`,c),3);
});
test('Categories use keyword precedence instead of composite source role labels',()=>{
  const c=context();
  for(const [category,expected] of [['Infantry Epic Hero','Epic Hero'],['Mounted Character','Character'],['Infantry Battleline','Battleline'],['Beast','Mounted/Beast'],['Walker','Vehicle'],['Monster','Other']]){
    c.unit={category,keywords:''};assert.equal(vm.runInContext('wbCategory(unit)',c),expected);
  }
});
test('Detachment Battleline moves units in both catalogs, unlocks copies and is reversible',()=>{
  const c=context();c.esc=value=>String(value??'');
  vm.runInContext(`
    const squad=fixture.units[0],army=builderUi.army;
    squad.name='Outrider Squad';squad.keywords='Mounted';squad.category='Mounted';squad.maxCopies=3;
    for(const [id,name] of [['zebra','Zebra Squad'],['alpha','Alpha Squad']]){
      fixture.units.push({...squad,id,name});wbFaction().unitIds.push(id);
    }
    wbFaction().detachments[0].description='Friendly Outrider Squad units have BATTLELINE.';
    workbench.search='squad';
    wbAdd('squad');
  `,c);
  for(const expression of ['wbCatalogList()', 'wbMobileCatalogList("Mounted","squad")']){
    const html=vm.runInContext(expression,c);
    assert.ok(html.indexOf('Alpha Squad')<html.indexOf('Outrider Squad')&&html.indexOf('Outrider Squad')<html.indexOf('Zebra Squad'));
  }
  assert.match(vm.runInContext('builderWorkbenchTotals().issues.join(" ")',c),/Troppe copie/);
  vm.runInContext("army.detachmentIds=['first'];",c);
  const desktop=vm.runInContext('wbCatalogList()',c);
  assert.match(desktop,/<summary>Battleline[^<]*<small>1<\/small>[\s\S]*?Outrider Squad/);
  assert.match(vm.runInContext('wbMobileCatalogList("Battleline")',c),/Outrider Squad/);
  assert.doesNotMatch(vm.runInContext('wbMobileCatalogList("Mounted")',c),/Outrider Squad/);
  assert.match(vm.runInContext("wbProfiles(wbUnits().get('squad'))",c),/wb-keywords[^>]*>Mounted, BATTLELINE/);
  assert.doesNotMatch(vm.runInContext('builderWorkbenchTotals().issues.join(" ")',c),/Troppe copie/);
  assert.equal(vm.runInContext('squad.keywords',c),'Mounted');
  vm.runInContext('army.detachmentIds=[];',c);
  assert.equal(vm.runInContext("wbCategory(wbUnits().get('squad'))",c),'Mounted/Beast');
  assert.match(vm.runInContext('builderWorkbenchTotals().issues.join(" ")',c),/Troppe copie/);
});
test('Battleline bullet grants require the named Warlord keywords and ignore references',()=>{
  const c=context();
  const description='• If a friendly MILITARUM TEMPESTUS OFFICER model is your WARLORD, friendly TEMPESTUS SCIONS units have:\n\n• BATTLELINE.';
  assert.deepEqual(Array.from(c.beBattlelineTargets(description,null)),[]);
  assert.deepEqual(Array.from(c.beBattlelineTargets(description,{keywords:'Officer, Character, Militarum Tempestus'})),['tempestus scions']);
  assert.deepEqual(Array.from(c.beBattlelineTargets('When a friendly BATTLELINE unit shoots, add 1.',null)),[]);
});
test('Character upgrades and a second power in an attached group are blocked in Build and Play',()=>{
  const c=context();c.esc=value=>String(value??'');c.notify=()=>{};
  vm.runInContext(`
    const [body,,,leader]=builderUi.army.entries;
    const bodyUnit=wbUnits().get(body.unitId),heroUnit=wbUnits().get(leader.unitId);
    heroUnit.category='Character Epic Hero';
    heroUnit.models=[{line:'1',name:'Leader',OC:'1'}];
    const effectsJson=JSON.stringify([{field:'OC',operation:'add',value:1,scope:'unit',source:'Unit upgrade'}]);
    const upgrade={id:'upgrade',name:'Unit upgrade',upgrade:'true',cost:'10',effectsJson};
    const enhancement={id:'enhancement',name:'Leader enhancement',cost:'10'};
    bodyUnit.enhancements=[upgrade];heroUnit.enhancements=[upgrade,enhancement];
  `,c);
  assert.doesNotMatch(vm.runInContext('beEnhancementsHtml(heroUnit,leader)',c),/data-wb-enhancement="upgrade"/);
  assert.equal(vm.runInContext('beCanAddPower(heroUnit,leader,upgrade)',c),false);
  vm.runInContext("body.enhancementIds=['upgrade'];",c);
  assert.equal(vm.runInContext('beCanAddPower(heroUnit,leader,enhancement)',c),false);
  assert.match(vm.runInContext('beEnhancementsHtml(heroUnit,leader)',c),/data-wb-enhancement="enhancement"[^>]*disabled/);
  assert.equal(vm.runInContext('builderWorkbenchTotals().errors.length',c),0);
  assert.equal(vm.runInContext('beEffects(heroUnit,leader).unit.models[0].OC',c),'2');
  vm.runInContext('leader.attachedTo=null;',c);
  assert.equal(vm.runInContext('beEffects(heroUnit,leader).unit.models[0].OC',c),'1');
  vm.runInContext('leader.attachedTo=body.entryId;',c);
  vm.runInContext("leader.enhancementIds=['enhancement'];",c);
  assert.equal(vm.runInContext('beAttachmentPowerConflict(leader,body.entryId)',c),true);
  assert.match(vm.runInContext('builderWorkbenchTotals().errors.join(" ")',c),/gruppo attached/);
  assert.equal(vm.runInContext("wbSetMode('play')",c),false);
  vm.runInContext("body.enhancementIds=[];leader.enhancementIds=['upgrade'];",c);
  assert.match(vm.runInContext('builderWorkbenchTotals().errors.join(" ")',c),/Epic Hero non può ricevere un Upgrade/);
  assert.match(vm.runInContext('beEnhancementsHtml(heroUnit,leader)',c),/checked[^>]*>[\s\S]*Da rimuovere/);
  vm.runInContext('leader.enhancementIds=[];',c);
  assert.equal(vm.runInContext("wbSetMode('play')",c),true);
});
test('Incursion allows a single 3 DP detachment and keeps the popup selection coherent',()=>{
  const c=context();
  vm.runInContext(`builderUi.army.limit=1000;builderUi.army.dpLimit=2;wbFaction().detachments.push({id:'large',name:'Large',dp:3,force_disposition:'Take and Hold'});`,c);
  assert.equal(vm.runInContext(`wbDetachmentConflict(wbFaction().detachments[3])`,c),'');
  vm.runInContext(`wbToggleDetachment('large',true);`,c);
  assert.equal(vm.runInContext(`wbIncursionException()`,c),true);
  assert.equal(vm.runInContext(`builderWorkbenchTotals().issues.includes('Budget Detachment Points superato.')`,c),false);
  assert.equal(vm.runInContext(`wbToggleDetachment('first',true)`,c),false);
  vm.runInContext(`wbToggleDetachment('large',false);wbToggleDetachment('first',true);builderUi.army.disposition='Take and Hold';wbToggleDetachment('first',false);`,c);
  assert.equal(vm.runInContext(`builderUi.army.disposition`,c),'');
});
test('Play orders all member models, all ranged weapons, all melee weapons and finally rules',()=>{
  const c=context();
  vm.runInContext(`const esc=v=>String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    for(const unit of fixture.units){unit.models=[{name:unit.name+' model'}];unit.weapons=[{line:'1',name:'Ranged '+unit.name,type:'Ranged'},{line:'2',name:'Melee '+unit.name,type:'Melee'}];}
    for(const entry of builderUi.army.entries)entry.weaponCounts={'1':1,'2':1};
    workbench.selected=builderUi.army.entries[0].entryId;workbench.mode='play';`,c);
  const html=vm.runInContext('wbDetail()',c);
  const models=html.indexOf('Profili dei modelli'),ranged=html.indexOf('Armi a distanza'),melee=html.indexOf('Armi da mischia'),rules=html.indexOf('Abilità e regole del gruppo');
  assert.ok(models<ranged&&ranged<melee&&melee<rules);
  for(const unit of ['Squadra test','Leader test','Support test']){
    assert.ok(html.indexOf(unit+' model')<ranged);
    assert.ok(html.indexOf('Ranged '+unit)>ranged&&html.indexOf('Ranged '+unit)<melee);
    assert.ok(html.indexOf('Melee '+unit)>melee&&html.indexOf('Melee '+unit)<rules);
  }
});
test('Unattached Support is an error and blocks switching to Play until assigned',()=>{
  const c=context();c.notify=()=>{};
  vm.runInContext(`builderUi.army.entries[4].attachedTo=null;`,c);
  assert.equal(vm.runInContext('builderWorkbenchTotals().errors.length',c),1);
  assert.equal(vm.runInContext(`wbSetMode('play')`,c),false);
  assert.equal(vm.runInContext('workbench.mode',c),'build');
  vm.runInContext(`builderUi.army.entries[4].attachedTo=builderUi.army.entries[0].entryId;`,c);
  assert.equal(vm.runInContext(`wbSetMode('play')`,c),true);
});
test('Detachment popup stays open and preserves its contents while toggling choices',()=>{
  const c=context();c.esc=value=>String(value??'');
  const rows=new Map();
  const inputs=['first','second','third'].map(id=>({dataset:{wbDetachment:id},checked:false,disabled:false,
    matches:selector=>selector==='[data-wb-detachment]',closest:()=>({classList:{toggle(){}}})}));
  let focused=false;
  c.main={querySelector:()=>({focus(){focused=true;}})};
  const dialog={events:{},open:false,innerHTML:'',setAttribute(){},
    querySelector(selector){if(!rows.has(selector))rows.set(selector,{});return rows.get(selector);},
    querySelectorAll:()=>inputs,addEventListener(event,handler){this.events[event]=handler;},
    showModal(){this.open=true;},close(){this.open=false;this.events.close();},remove(){this.removed=true;}};
  c.document={querySelector:()=>dialog.open?dialog:null,createElement:()=>dialog,body:{appendChild(){}}};
  vm.runInContext('wbOpenDetachments()',c);
  const html=dialog.innerHTML;
  inputs[0].checked=true;dialog.events.change({target:inputs[0]});
  assert.equal(dialog.open,true);
  assert.equal(dialog.innerHTML,html);
  assert.equal(inputs[1].disabled,true);
  assert.equal(vm.runInContext('builderUi.army.detachmentIds.join(",")',c),'first');
  inputs[0].checked=false;dialog.events.change({target:inputs[0]});
  assert.equal(dialog.open,true);
  assert.equal(inputs[1].disabled,false);
  rows.get('[data-wb-close]').onclick();
  assert.equal(dialog.removed,true);assert.equal(focused,true);
});
test('Attached groups show each stratagem once and retain all member origins',()=>{
  const c=context();c.esc=v=>String(v??'');
  vm.runInContext(`builderUi.catalog.stratagems=[{id:'shared',name:'Shared stratagem',cp_cost:'1',turn:'Your turn',phase:'Shooting phase',description:'WHEN: Synthetic trigger.\\n\\nEFFECT: Synthetic effect.'}];for(const u of fixture.units)u.stratagems=[{id:'shared'}];`,c);
  const html=vm.runInContext('wbAttachedProfiles(wbGroup(builderUi.army.entries[0]))',c);
  assert.equal((html.match(/Shared stratagem/g)||[]).length,1);assert.match(html,/Stratagemmi del gruppo \(1\)/);assert.match(html,/Squadra test · Leader test · Support test/);
});
