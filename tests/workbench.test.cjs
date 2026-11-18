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
