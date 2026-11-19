'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let fixtures;
function load(){if(!fixtures){const r=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'loadout-rules-model.php')],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);fixtures=JSON.parse(r.stdout);}return structuredClone(fixtures);}
function context(which){const unit=load()[which],c=vm.createContext({unit,builderClone:structuredClone,notify(){},wbUnits:()=>new Map([['u',unit]])});vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com/builder-engine.js'),'utf8'),c);vm.runInContext("entry={unitId:'u',models:3,weaponCounts:{},loadoutSelections:beSelections(unit,3)};g=unit.loadoutRecipe.groups.find(g=>g.choices.length>1);",c);return c;}
test('PHP enforces bundle consumption, independent row limits, all-model changes, footnotes, slots and ownership',()=>{load();});
test('Client disables a replacement at its own limit without disabling a different replacement',()=>{
  const c=context('limits');assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice1',1)",c),true);assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,g,'choice1',1)",c),false);assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice2',1)",c),true);assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,g,'choice2',1)",c),false);
});
test('All-model replacements change the entire group atomically and restore it atomically',()=>{
  const c=context('all');assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice1',1)",c),true);assert.equal(vm.runInContext("entry.loadoutSelections[g.id].choice1",c),3);assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice1',-1)",c),true);assert.equal(vm.runInContext("entry.loadoutSelections[g.id].base",c),3);
});
test('Client shares the per-option footnote limit and allows the larger squad threshold',()=>{
  const c=context('duplicate');assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice1',1)",c),true);assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,g,'choice1',1)",c),false);assert.equal(vm.runInContext("beResize(entry,6)",c),true);assert.equal(vm.runInContext("beChangeChoice(entry,g.id,'choice1',1)",c),true);assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,g,'choice1',1)",c),false);assert.equal(vm.runInContext("beResize(entry,3)",c),false);
});
test('Optional model controls transfer a body model, preserve ownership and use named-model quotas',()=>{
  const c=context('flex');assert.equal(vm.runInContext('beResize(entry,6)',c),true);
  assert.equal(vm.runInContext("const next=beModelChange(unit,entry,'m1',1);entry.loadoutSelections=next;beSync(unit,entry);entry.loadoutSelections._models.m0",c),5);
  assert.equal(vm.runInContext('entry.loadoutSelections._models.m1',c),1);
  assert.equal(vm.runInContext("beModelChange(unit,entry,'m1',1)",c),null);
  assert.equal(vm.runInContext("const extra=unit.loadoutRecipe.groups[4];beCapacity(unit.loadoutRecipe,extra,6,entry.loadoutSelections._models)",c),1);
  assert.equal(vm.runInContext("beChangeChoice(entry,extra.id,'choice0',1)",c),true);
  assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,extra,'choice0',1)",c),false);
  assert.equal(vm.runInContext('beResize(entry,6);entry.loadoutSelections._models.m1',c),1);
});
test('Weapon teams add/remove both bearers atomically and exclude the sniper alternative',()=>{
  const c=context('team');
  assert.equal(vm.runInContext("const gunner=g.choices.find(c=>c.weapons.w_5),crew=g.choices.find(c=>c.weapons.w_4&&!c.weapons.w_5),sniper=g.choices.find(c=>c.weapons.w_3);beChangeChoice(entry,g.id,gunner.id,1)",c),true);
  assert.equal(vm.runInContext("entry.weaponCounts['4']",c),2);assert.equal(vm.runInContext("entry.weaponCounts['5']",c),1);assert.equal(vm.runInContext("entry.weaponCounts['1']",c),1);
  assert.equal(vm.runInContext("beChoiceAllowed(unit,entry,g,sniper.id,1)",c),false);
  assert.equal(vm.runInContext("beChangeChoice(entry,g.id,crew.id,-1)",c),true);assert.equal(vm.runInContext("entry.loadoutSelections[g.id].base",c),3);
});
test('Same-size formations retain their own point price and the chosen model allocation',()=>{
  const c=context('priced');assert.equal(vm.runInContext("beResize(entry,6);beEntryBasePrice(unit,entry,1)",c),110);
  assert.equal(vm.runInContext("beResize(entry,6,{m0:5,m1:1});beEntryBasePrice(unit,entry,1)",c),130);
  assert.equal(vm.runInContext("beEntryBasePrice(unit,entry,3)",c),140);
  assert.equal(vm.runInContext("beResize(entry,6);entry.loadoutSelections._models.m1",c),1);
});
