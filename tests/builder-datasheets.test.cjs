'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function context(){
  const c=vm.createContext({esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))});
  for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),c);
  vm.runInContext(`builderUi.catalog={texts:[],coreRules:[
    {id:'lethal',name:'LETHAL HITS',reference:'24.23',description:'Synthetic lethal rule.'},
    {id:'sustained',name:'SUSTAINED HITS',description:'Synthetic sustained rule.'},
    {id:'rapid',name:'RAPID FIRE',description:'Synthetic rapid fire rule.'},
    {id:'anti',name:'ANTI',description:'Synthetic anti rule.'},
    {id:'deep',name:'DEEP STRIKE',description:'Synthetic deep rule.'}
  ]};`,c);return c;
}
test('Weapon keywords resolve parameterized source rules without confusing parameters and references',()=>{
  const c=context();for(const [label,id] of [['lethal hits','lethal'],['[SUSTAINED HITS D3]','sustained'],['Anti-Infantry 4+','anti']]){
    c.label=label;assert.equal(vm.runInContext('wbCoreRule(label)?.id',c),id);
  }
  assert.equal(vm.runInContext(`wbCoreRule('Lethal Hits 24.23')`,c),undefined);
  const html=vm.runInContext(`wbWeaponKeywords('[LETHAL HITS], Sustained Hits 1, Anti-Infantry 4+, Unknown 2')`,c);
  assert.equal((html.match(/<button/g)||[]).length,3);assert.match(html,/\[SUSTAINED HITS 1\]/);assert.match(html,/\[UNKNOWN 2\]/);
  assert.doesNotMatch(vm.runInContext(`wbWeaponKeywords('<img src=x onerror=alert(1)>')`,c),/<img/);
});
test('Weapon rows retain all statistics and put keywords under the escaped name',()=>{
  const c=context();c.rows=[{origin:'Bodyguard',count:5,weapon:{name:'Rifle <script>',range:'24',A:'2',BS_WS:'3',S:'4',AP:'-1',D:'1',description:'Lethal Hits'}}];
  const html=vm.runInContext('wbWeaponTable(rows)',c);assert.match(html,/Bodyguard/);assert.match(html,/Rifle /);assert.doesNotMatch(html,/<script>/);assert.match(html,/24&quot;/);assert.match(html,/3\+/);assert.doesNotMatch(html,/<th scope="col">Regole/);assert.ok(html.indexOf('wb-weapon-name')<html.indexOf('data-wb-rule="lethal"'));
  assert.match(html,/<strong class="wb-weapon-count">\(×5\)<\/strong>/);assert.doesNotMatch(html,/<th scope="col">N\./);assert.match(html,/<td class="">24&quot;<\/td><td class="">2<\/td>/);
});
test('Rule dialog uses catalog IDs, opens modally and returns focus after closing',()=>{
  const c=context();let focused=false,shown=false,removed=false,closeHandler,clickHandler;
  const dialog={setAttribute(k,v){this[k]=v;},querySelector(){return {addEventListener(event,fn){clickHandler=fn;}};},addEventListener(event,fn){closeHandler=fn;},showModal(){shown=true;},close(){closeHandler();},remove(){removed=true;}};
  c.document={querySelector:()=>null,createElement:()=>dialog,body:{append(){}}};c.button={dataset:{wbRule:'lethal',wbRuleLabel:'Lethal Hits'},isConnected:true,focus(){focused=true;}};
  vm.runInContext('wbOpenRule(button)',c);assert.equal(shown,true);assert.equal(dialog['aria-labelledby'],'wb-rule-title');assert.match(dialog.innerHTML,/Synthetic lethal rule/);clickHandler();assert.equal(removed,true);assert.equal(focused,true);
  shown=false;c.button.dataset.wbRule='missing';vm.runInContext('wbOpenRule(button)',c);assert.equal(shown,false);
});
test('Stratagem cards use turn metadata and preserve operational sections and extra CP modes',()=>{
  const c=context();for(const [turn,expected] of [['Your turn','your'],['Opponent’s turn','opponent'],["Either player's turn",'either'],['Anything else','unknown']]){c.turn=turn;assert.equal(vm.runInContext('wbStratagemTurn(turn)',c),expected);}
  c.rows=[{name:'Example <script>',cp_cost:'1',type:'Core Stratagem',turn:'Opponent’s turn',phase:'Charge phase',description:'WHEN: End of phase.\n\nTARGET: One unit.\n\nEFFECT: Resolve a move.\n\n+1CP: Additional option.\n\nRESTRICTIONS: Once per battle.'}];
  const html=vm.runInContext('wbStratagems(rows)',c);for(const text of ['wb-turn-opponent','1 CP','Charge phase','WHEN','TARGET','EFFECT','+1CP','RESTRICTIONS','Once per battle.'])assert.ok(html.includes(text),text);assert.doesNotMatch(html,/<script>/);
});
test('Legacy raw rule reference resolves only a matching core ability',()=>{
  const c=context();assert.match(vm.runInContext(`wbRules([{name:'Deep Strike',description:'DEEP STRIKE24.09'}])`,c),/Synthetic deep rule/);
  assert.match(vm.runInContext(`wbRules([{name:'Deep Strike',description:'Retain this operational exception.'}])`,c),/Retain this operational exception/);
  vm.runInContext('delete builderUi.catalog.coreRules',c);assert.doesNotThrow(()=>vm.runInContext(`wbWeaponKeywords('Lethal Hits')`,c));assert.doesNotMatch(vm.runInContext(`wbWeaponKeywords('Lethal Hits')`,c),/<button/);
});
test('Uncommon weapon keywords resolve within their own datasheet, with qualifiers retained',()=>{
  const c=context();vm.runInContext(`builderUi.catalog.units=[{id:'unit',abilities:[{name:'Conversion',description:'Synthetic conversion rule.'}]}]`,c);
  assert.match(vm.runInContext(`wbWeaponKeywords('Conversion','unit')`,c),/data-wb-rule-unit="unit"/);
  assert.doesNotMatch(vm.runInContext(`wbWeaponKeywords('Conversion','other')`,c),/<button/);
  for(const label of ['Anti-non-Monster/Vehicle 2+','Sustained Hits 1: non-MONSTER/VEHICLE','Rapid Fire D6+3']){c.label=label;assert.ok(vm.runInContext('wbCoreRule(label)',c));}
  assert.match(vm.runInContext(`wbWeaponKeywords('Sustained Hits 1: non-MONSTER/VEHICLE')`,c),/\[SUSTAINED HITS 1: NON-MONSTER\/VEHICLE\]/);
});
