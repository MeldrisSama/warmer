'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
  const nodes=new Map();
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',addEventListener(){},contains:()=>false,querySelectorAll:()=>[],querySelector:()=>null});return nodes.get(selector);};
  const c=vm.createContext({crypto:require('node:crypto').webcrypto,Intl,Date,console,
    state:{user:{id:'owner',admin:true}},page:()=> 'builder',notify:()=>{},confirm:()=>true,
    main:{innerHTML:'',querySelector:node,querySelectorAll:()=>[]},document:{activeElement:null},
    esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))});
  for(const f of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com',f),'utf8'),c);
  c.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'workbench-fixture.json'),'utf8'));
  vm.runInContext(`fixture.catalogId='active';builderUi.active=fixture;builderUi.catalog=fixture;builderUi.owner='owner';`,c);
  c.nodes=nodes;return c;
}
test('Direct access and fresh load show the archive without creating an army',async()=>{
  const c=context();
  c.api=async action=>action==='builderArmies'?{armies:[]}:{catalog:c.fixture};
  await vm.runInContext('builderLoad()',c);
  assert.equal(vm.runInContext('builderUi.army',c),null);
  assert.match(c.main.innerHTML,/Nessuna armata salvata/);
  assert.doesNotMatch(c.main.innerHTML,/wb-name/);
  vm.runInContext('builderPage()',c);
  assert.match(c.main.innerHTML,/builder-create-new/);
});

test('Builder navigation returns to the archive and respects unsaved edits, pending work and modified clicks',()=>{
  const c=context();let prevented=false;c.event={button:0,preventDefault(){prevented=true;}};
  vm.runInContext(`builderStart('test')`,c);c.confirm=()=>false;
  vm.runInContext('builderNavigate(event)',c);assert.equal(prevented,true);assert.equal(vm.runInContext('builderUi.view',c),'editor');
  c.confirm=()=>true;prevented=false;vm.runInContext('builderNavigate(event)',c);assert.equal(prevented,true);assert.equal(vm.runInContext('builderUi.view',c),'archive');
  vm.runInContext(`builderStart('test');builderUi.pending=true`,c);vm.runInContext('builderNavigate(event)',c);assert.equal(vm.runInContext('builderUi.view',c),'editor');
  vm.runInContext('builderUi.pending=false',c);prevented=false;c.event.ctrlKey=true;vm.runInContext('builderNavigate(event)',c);assert.equal(prevented,false);assert.equal(vm.runInContext('builderUi.view',c),'editor');
  c.event.ctrlKey=false;c.page=()=> 'classifica';vm.runInContext('builderNavigate(event)',c);assert.equal(prevented,false);assert.equal(vm.runInContext('builderUi.view',c),'editor');
});
test('Archive keeps faction groups for every ordering, with local army icons',()=>{
  const c=context();vm.runInContext(`builderUi.armies=[{id:'a',name:'Older Angels',edition:'11',factionId:'sm_dark_angels',factionName:'Dark Angels',updated:'2026-11-01'},{id:'b',name:'Chaos list',edition:'11',factionId:'csm',factionName:'Chaos Space Marines',updated:'2026-11-10'},{id:'c',name:'Recent Angels',edition:'11',factionId:'sm_dark_angels',factionName:'Dark Angels',updated:'2026-11-18'}]`,c);
  for(const sort of ['updated','created','faction']){c.sort=sort;vm.runInContext('builderUi.sort=sort;builderArchiveRender()',c);assert.equal((c.main.innerHTML.match(/class="builder-army-group"/g)||[]).length,2);assert.match(c.main.innerHTML,/assets\/factions\/sm_dark_angels.svg/);}
  vm.runInContext(`builderUi.sort='updated';builderArchiveRender()`,c);assert.ok(c.main.innerHTML.indexOf('Recent Angels')<c.main.innerHTML.indexOf('Older Angels'));assert.ok(c.main.innerHTML.indexOf('Older Angels')<c.main.innerHTML.indexOf('Chaos list'));
});
test('Faction group popup selects an army without opening the builder or replacing the form',()=>{
  const c=context();vm.runInContext(`fixture.factions=[{...fixture.factions[0],id:'nec',name:'Necrons'}]`,c);
  let click,closed=false,html='';c.wbModal=(title,body)=>{html=body;return {addEventListener(event,fn){click=fn;},close(){closed=true;}};};
  vm.runInContext(`builderOpenFactionGroup('Xenos',{})`,c);assert.match(html,/Necrons/);assert.match(html,/data-create-faction="nec"/);
  click({target:{closest:()=>({dataset:{createFaction:'nec'}})}});assert.equal(c.nodes.get('[name=faction]').value,'nec');assert.equal(closed,true);assert.equal(vm.runInContext('builderUi.army',c),null);assert.match(c.nodes.get('#builder-chosen-faction').innerHTML,/Necrons/);
});
test('Archive sorts faction and both dates, missing creation dates stay last',()=>{
  const c=context();
  vm.runInContext(`builderUi.armies=[
    {id:'c',name:'Old',factionName:'Zeta',created:null,updated:'2026-11-18'},
    {id:'b',name:'Bravo',factionName:'Alpha',created:'2026-11-17',updated:'2026-11-16'},
    {id:'a',name:'Alpha',factionName:'Alpha',created:'2026-11-16',updated:'2026-11-17'}];`,c);
  for(const [sort,ids] of [['updated','c,a,b'],['created','b,a,c'],['faction','a,b,c']]){
    c.sort=sort;assert.equal(vm.runInContext('builderUi.sort=sort;builderSortedArmies().map(a=>a.id).join(",")',c),ids);
  }
  assert.equal(vm.runInContext('builderDate(null)',c),'Non disponibile');
  vm.runInContext(`builderUi.armies[0].name='<img src=x>';builderArchiveRender();`,c);
  assert.doesNotMatch(c.main.innerHTML,/<img/);
});
test('Create uses active 11th catalog and excludes Unbound; return protects unsaved changes',()=>{
  const c=context();
  vm.runInContext(`fixture.factions.unshift({id:'unbound',name:'Unbound Adversaries'});builderStart('test');`,c);
  assert.equal(vm.runInContext('builderUi.army.factionId',c),'test');
  assert.equal(vm.runInContext('builderUi.view',c),'editor');
  assert.equal(vm.runInContext('builderHasUnsaved()',c),true);
  c.confirm=()=>false;vm.runInContext('builderArchive()',c);
  assert.equal(vm.runInContext('builderUi.view',c),'editor');
  c.confirm=()=>true;vm.runInContext('builderArchive();builderStart("unbound")',c);
  assert.equal(vm.runInContext('builderUi.army',c),null);
  assert.doesNotMatch(c.main.innerHTML,/value="unbound"/);
});
test('Open restores the exact historical catalog; a failed load preserves the archive',async()=>{
  const c=context();
  vm.runInContext(`builderUi.armies=[{id:'old',name:'Old',edition:'10',catalogId:'historical',factionId:'legacy',entries:[]}];`,c);
  let requested;
  c.api=async action=>{requested=action;return {catalog:{schemaVersion:1,catalogId:'historical',factions:[]}};};
  vm.runInContext('builderRender=()=>{}',c);
  await vm.runInContext('builderOpen("old")',c);
  assert.match(requested,/edition=10&catalogId=historical/);
  assert.equal(vm.runInContext('builderUi.catalog.catalogId',c),'historical');
  assert.equal(vm.runInContext('builderUi.active.catalogId',c),'active');
  assert.equal(vm.runInContext('builderHasUnsaved()',c),false);
  vm.runInContext('builderUi.army.name="Modified"',c);
  c.confirm=()=>false;vm.runInContext('builderArchive()',c);
  assert.equal(vm.runInContext('builderUi.view',c),'editor');
  c.confirm=()=>true;vm.runInContext('builderArchive()',c);
  c.api=async()=>({catalog:null});await vm.runInContext('builderOpen("old")',c);
  assert.equal(vm.runInContext('builderUi.view',c),'archive');
  assert.equal(vm.runInContext('builderUi.pending',c),false);
});
test('Workbench catalog follows the list faction; configuration stays open on rerender',()=>{
  const c=context();
  vm.runInContext(`builderUi.view='editor';builderUi.army=builderWorkbenchNewArmy();wbBind=()=>{};`,c);
  const old={querySelectorAll:()=>[],querySelector:()=>({open:true}),contains:()=>false};
  c.main.querySelector=selector=>selector==='.workbench'?old:null;
  vm.runInContext(`fixture.factions.push({id:'other',name:'Other',unitIds:[]});workbench.catalogFaction='other';wbAdd('squad');builderWorkbenchRender();`,c);
  assert.doesNotMatch(c.main.innerHTML,/Fazione da consultare|wb-catalog-faction/);
  assert.match(c.main.innerHTML,/wb-configuration wb-army-settings" open/);
  assert.match(c.main.innerHTML,/data-wb-preview="squad"/);
});
test('Restore creates a separate army and opens it from the archive',async()=>{
  const c=context();
  const saved=JSON.parse(vm.runInContext('JSON.stringify(builderWorkbenchNewArmy())',c));
  saved.id='restored';saved.created='2026-11-18T12:00:00Z';
  let submitted;
  c.api=async(action,data)=>{
    if(action==='builderSave'){submitted=data;return {army:saved};}
    if(action==='builderArmies')return {armies:[{...saved,id:'existing'},saved]};
    return {catalog:c.fixture};
  };
  c.file={size:100,text:async()=>JSON.stringify({...saved,id:'original'})};
  await vm.runInContext('builderRestoreFile(file)',c);
  assert.equal(submitted.id,null);
  assert.equal(vm.runInContext('builderUi.armies.length',c),2);
  assert.equal(vm.runInContext('builderUi.army.id',c),'restored');
  assert.equal(vm.runInContext('builderUi.view',c),'editor');
  assert.equal(vm.runInContext('builderUi.pending',c),false);
});
test('Import prevents concurrent creation and returns to the refreshed archive',async()=>{
  const c=context();let complete,started;
  const entered=new Promise(resolve=>{started=resolve;});
  c.api=async action=>{
    if(action==='builderImport')return new Promise(resolve=>{complete=resolve;started();});
    return action==='builderArmies'?{armies:[]}:{catalog:c.fixture};
  };
  c.file={size:100,text:async()=>JSON.stringify(c.fixture)};
  const importing=vm.runInContext('builderImportFile(file)',c);
  await entered;
  vm.runInContext('builderStart("test")',c);
  assert.equal(vm.runInContext('builderUi.army',c),null);
  complete({});await importing;
  assert.equal(vm.runInContext('builderUi.view',c),'archive');
  assert.equal(vm.runInContext('builderUi.pending',c),false);
});
test('Creation groups real factions, exposes three formats and only then opens an editor',()=>{
  const c=context();
  vm.runInContext(`builderCreationBind=()=>{};fixture.factions=[
    {...fixture.factions[0],id:'nec',name:'Necrons'},
    {...fixture.factions[0],id:'csm',name:'Chaos Space Marines'},
    {...fixture.factions[0],id:'am',name:'Astra Militarum'},
    {...fixture.factions[0],id:'sm_dark_angels',name:'Dark Angels'},
    {...fixture.factions[0],id:'ua',name:'Unbound Adversaries'}];builderCreate();`,c);
  assert.equal(vm.runInContext('builderUi.view',c),'create');
  assert.equal(vm.runInContext('builderUi.army',c),null);
  for(const group of ['Xenos','Chaos','Imperium','Adeptus Astartes','Incursion','Strike Force','Onslaught'])assert.ok(c.main.innerHTML.includes(group));
  assert.doesNotMatch(c.main.innerHTML,/Unbound Adversaries/);
  vm.runInContext(`builderWorkbenchRender=()=>{};builderStart('nec',1000);`,c);
  assert.equal(vm.runInContext('builderUi.army.limit',c),1000);
  assert.equal(vm.runInContext('builderUi.army.dpLimit',c),2);
  vm.runInContext(`builderArchive();builderStart('sm_dark_angels',3000,5);`,c);
  assert.equal(vm.runInContext('builderUi.army.dpLimit',c),5);
  assert.equal(vm.runInContext('builderUi.army.limit',c),3000);
});
test('Search changes only the catalog list and does not render the whole screen',()=>{
  const c=context();
  vm.runInContext(`builderUi.army=builderWorkbenchNewArmy();builderUi.view='editor';wbSearch('Squadra');`,c);
  assert.equal(c.main.innerHTML,'');
  assert.match(c.nodes.get('#wb-catalog-list').innerHTML,/Squadra test/);
  assert.doesNotMatch(c.nodes.get('#wb-catalog-list').innerHTML,/Leader test/);
  vm.runInContext(`wbSearch('missing');`,c);
  assert.match(c.nodes.get('#wb-catalog-list').innerHTML,/Nessuna unità/);
});
