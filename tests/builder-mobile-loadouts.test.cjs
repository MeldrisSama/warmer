'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{spawnSync}=require('node:child_process');
function context(){
  const c=vm.createContext({esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),notify(){}});
  for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',f),'utf8'),c);
  vm.runInContext(`const g={id:'gun',model:'pilot',name:'Pilot gun',default:'base',choices:[{id:'base',weapons:{bolter:1}},{id:'cannon',weapons:{cannon:1}}]},u={id:'pilot',points:[{models:1}],loadoutRecipe:{models:[{id:'pilot',name:'Pilot',fixed:1}],groups:[g],weapons:[{id:'bolter',name:'Heavy Bolter',lines:['1']},{id:'cannon',name:'Assault Cannon',lines:['2']}]}},e={entryId:'one',unitId:'pilot',models:1,loadoutSelections:{gun:{base:1}},weaponCounts:{}};builderUi.catalog={units:[u],texts:[],coreRules:[]};`,c);return c;
}
test('Single weapon choices switch directly and keep quantities for multi-slot and model-defined gear',()=>{
  const c=context();assert.match(vm.runInContext('beLoadoutGroupHtml(u,e,g)',c),/type="radio"/);assert.doesNotMatch(vm.runInContext('beLoadoutGroupHtml(u,e,g)',c),/wb-quantity/);
  assert.equal(vm.runInContext(`beChangeChoice(e,'gun','cannon',1)`,c),true);assert.equal(vm.runInContext(`e.weaponCounts['2']`,c),1);assert.equal(vm.runInContext(`beChangeChoice(e,'gun','base',1)`,c),true);assert.equal(vm.runInContext(`e.weaponCounts['1']`,c),1);
  vm.runInContext(`g.choices[1].weapons.cannon=2`,c);assert.equal(vm.runInContext('beSingleChoice(u,e,g)',c),false);
  vm.runInContext(`g.choices[1].weapons.cannon=1;u.loadoutRecipe.models[0].name='Legionary with bolt rifle'`,c);assert.equal(vm.runInContext('beSingleChoice(u,e,g)',c),false);
  vm.runInContext(`u.loadoutRecipe.models[0].name='Pilot';u.loadoutRecipe.groups.push({...g,id:'second-slot'})`,c);assert.equal(vm.runInContext('beSingleChoice(u,e,g)',c),false);
  vm.runInContext(`u.loadoutRecipe.groups.pop();u.loadoutRecipe.models[0].variable=true;u.points=[{models:1},{models:3}]`,c);assert.equal(vm.runInContext('beSingleChoice(u,e,g)',c),false);
});
test('Parameterized rules recover old source values and display escaped, distinct values without duplication',()=>{
  const result=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'rule-parameters-model.php')],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
  const c=context();c.rule=JSON.parse(result.stdout).unit.abilities[0];let html=vm.runInContext('wbRules([rule])',c);assert.match(html,/Deadly Demise <span class="wb-rule-parameter">D3<\/span>/);
  c.rule={name:'Feel No Pain',parameter:'5+',description:'Generic X+ rule'};html=vm.runInContext('wbRules([rule])',c);assert.match(html,/wb-rule-parameter">5\+/);
  c.rule={name:'Deadly Demise D6',parameter:'D6',description:'Generic rule'};assert.doesNotMatch(vm.runInContext('wbRules([rule])',c),/wb-rule-parameter/);
  c.rule={name:'Deadly Demise',parameter:'<script>',description:'Generic rule'};assert.doesNotMatch(vm.runInContext('wbRules([rule])',c),/<script>/);
});
