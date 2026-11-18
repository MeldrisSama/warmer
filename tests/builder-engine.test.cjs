'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let fixture;
function catalog(){if(!fixture){const result=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'automation-model.php')],{encoding:'utf8',maxBuffer:4e6});assert.equal(result.status,0,result.stdout+result.stderr);fixture=JSON.parse(result.stdout);}return structuredClone(fixture);}
function context(){
  const c=vm.createContext({fixture:catalog(),crypto:require('node:crypto').webcrypto,notify(){},state:{user:{id:'owner',name:'Player'}},esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),main:{querySelector:()=>({value:'short'})}});
  for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com',f),'utf8'),c);
  vm.runInContext(`builderUi.catalog=fixture;builderUi.active=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};wbAdd('term');`,c);return c;
}
test('PHP compiles recipes and effects, derives quantities, isolates defaults and gates allies',()=>{catalog();});
test('Guided replacements preserve squad size and the Sergeant; modes share a count',()=>{
  const c=context();vm.runInContext(`const entry=builderUi.army.entries[0],unit=wbUnits().get('term'),g=unit.loadoutRecipe.groups.find(g=>g.model==='m1'&&g.choices.length>1);beChangeChoice(entry,g.id,'choice1',1);`,c);
  assert.equal(vm.runInContext(`entry.weaponCounts['1']`,c),4);assert.equal(vm.runInContext(`entry.weaponCounts['2']`,c),1);assert.equal(vm.runInContext(`entry.weaponCounts['3']`,c),1);
  assert.equal(vm.runInContext(`entry.loadoutSelections[unit.loadoutRecipe.groups[0].id].base`,c),1);
  assert.equal(vm.runInContext(`entry.models`,c),5);
  vm.runInContext(`beResize(entry,10);`,c);assert.equal(vm.runInContext(`entry.weaponCounts['1']`,c),9);
});
test('Personal default applies to new instances and does not rewrite existing entries',()=>{
  const c=context();vm.runInContext(`builderUi.catalog.catalogId='version';builderUi.army.catalogId='version';const first=builderClone(builderUi.army.entries[0]);builderUi.defaults=[{unitId:'term',catalogId:'version',entry:{...first,models:5,weaponCounts:{'1':2,'2':3,'3':3,'4':5},loadoutSelections:undefined}}];wbAdd('term');`,c);
  assert.equal(vm.runInContext(`builderUi.army.entries[0].weaponCounts['1']`,c),5);
  assert.equal(vm.runInContext(`builderUi.army.entries[1].weaponCounts['2']`,c),3);
});
test('Ally catalog and validation react to detachment removal and count limits',()=>{
  const c=context();assert.equal(vm.runInContext(`beCatalogIds().includes('deathwatch')`,c),false);
  vm.runInContext(`builderUi.army.detachmentIds=['dw'];wbAdd('deathwatch');`,c);assert.equal(vm.runInContext(`beAllyErrors().length`,c),0);
  vm.runInContext(`builderUi.army.detachmentIds=[];`,c);assert.match(vm.runInContext(`beAllyErrors().join(' ')`,c),/non autorizzato/);
});
test('Derived weapon effects preserve base values and do not stack twice on repeated render',()=>{
  const c=context();assert.match(vm.runInContext(`beEffects(wbUnits().get('term'),builderUi.army.entries[0]).unit.weapons[0].description`,c),/LETHAL HITS/);
  assert.equal(vm.runInContext(`wbUnits().get('term').weapons[0].description`,c),undefined);
  vm.runInContext(`builderUi.army.entries[0].enhancementIds=['upgrade'];`,c);
  assert.equal(vm.runInContext(`beEffects(wbUnits().get('term'),builderUi.army.entries[0]).unit.weapons[3].A`,c),'3');
  assert.equal(vm.runInContext(`beEffects(wbUnits().get('term'),builderUi.army.entries[0]).unit.weapons[3].A`,c),'3');
});
test('All text formats preserve gear and attachments; clipboard receives the selected format',async()=>{
  const c=context();for(const format of ['gw','wtc','short']){c.format=format;const text=vm.runInContext(`beExportText(format)`,c);assert.match(text,/Veterans/);assert.match(text,/Power Fist/);}
  let copied;c.navigator={clipboard:{writeText:async text=>{copied=text;}}};await vm.runInContext('beCopyExport()',c);assert.equal(copied,vm.runInContext(`beExportText('short')`,c));
});
test('Situational effects never alter profiles, even with an old active toggle',()=>{
  const c=context();vm.runInContext(`const e=builderUi.army.entries[0],u=wbUnits().get('term');u.effects=[{id:'conditional',source:'After charging',condition:'Unit charged',scope:'unit',weaponType:'melee',field:'A',operation:'add',value:1}];`,c);
  assert.equal(vm.runInContext(`beEffects(u,e).unit.weapons[0].A`,c),'3');
  vm.runInContext(`workbench.activeEffects[e.entryId+':conditional']=true;`,c);assert.equal(vm.runInContext(`beEffects(u,e).unit.weapons[0].A`,c),'3');
  vm.runInContext(`workbench.activeEffects={};`,c);assert.equal(vm.runInContext(`beEffects(u,e).unit.weapons[0].A`,c),'3');
});
test('Recipient and attachment changes update derived profiles without modifying source',()=>{
  const c=context();vm.runInContext(`wbAdd('leader');const leader=builderUi.army.entries[1];leader.attachedTo=builderUi.army.entries[0].entryId;wbUnits().get('leader').effects=[{id:'inv',source:'Shield',scope:'unit',condition:'leading',field:'inv_sv',operation:'min',value:4}];`,c);
  assert.equal(vm.runInContext(`beEffects(wbUnits().get('term'),builderUi.army.entries[0]).unit.models[0].inv_sv`,c),'4');
  vm.runInContext(`leader.attachedTo=null;`,c);assert.equal(vm.runInContext(`beEffects(wbUnits().get('term'),builderUi.army.entries[0]).unit.models[0].inv_sv`,c),undefined);
});
test('Copy into the active catalog preserves the original and remaps selected weapon lines',()=>{
  const c=context();c.confirm=()=>true;
  vm.runInContext(`builderRender=()=>{};builderUi.army.id='original';builderUi.army.catalogId='old';const original=builderUi.army;builderUi.catalog.catalogId='old';builderUi.active=builderClone(builderUi.catalog);builderUi.active.catalogId='new';for(const u of builderUi.active.units){for(const w of u.weapons)w.line='1'+w.line;for(const w of u.loadoutRecipe?.weapons||[])w.lines=w.lines.map(line=>'1'+line);}workbench.mode='play';beCopyActive();`,c);
  assert.equal(vm.runInContext('original.id',c),'original');
  assert.equal(vm.runInContext('original.catalogId',c),'old');
  assert.equal(vm.runInContext('builderUi.army.id',c),null);
  assert.equal(vm.runInContext('builderUi.army.catalogId',c),'new');
  assert.equal(vm.runInContext(`builderUi.army.entries[0].weaponCounts['11']`,c),5);
  assert.equal(vm.runInContext('workbench.mode',c),'build');
});
test('Clipboard denial opens selectable text without downloading a file',async()=>{
  const c=context();let selected=false,opened=false;
  const field={focus(){},select(){selected=true;}};
  const dialog={setAttribute(){},querySelector:selector=>selector==='textarea'?field:{},addEventListener(){},showModal(){opened=true;}};
  c.document={createElement:()=>dialog,body:{appendChild(){}}};c.navigator={clipboard:{writeText:async()=>{throw Error('Denied');}}};
  await vm.runInContext('beCopyExport()',c);assert.equal(opened,true);assert.equal(selected,true);assert.match(dialog.innerHTML,/Veterans/);
});
