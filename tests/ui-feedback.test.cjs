'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,'Cangiolone.com',file),'utf8');

test('Six safe decorative loading icons support random choice and deterministic rendering',()=>{
  const c=vm.createContext({window:{},Math:Object.create(Math)});vm.runInContext(read('sync-icons.js'),c);
  const icons=c.window.SectorSyncIcons;assert.equal(icons.ids.length,6);
  for(let i=0;i<6;i++){
    c.Math.random=()=>i/6+.01;assert.equal(icons.choose(),icons.ids[i]);
    const markup=icons.render(icons.ids[i]);assert.equal(markup,icons.render(icons.ids[i]));
    assert.match(markup,/aria-hidden="true"/);assert.doesNotMatch(markup,/<script|onload=|href=/);
  }
  assert.equal(icons.render('<script>bad</script>'),icons.render('cog'));
});

test('Epic Hero, Character and Other remain separate in catalogs and army on every viewport',()=>{
  const c=vm.createContext({crypto:require('node:crypto').webcrypto,structuredClone,esc:v=>String(v??''),Intl,Date});
  for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(read(file),c);
  c.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'workbench-fixture.json'),'utf8'));
  vm.runInContext(`builderUi.catalog=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};
    const base=fixture.units.find(u=>u.id==='leader');
    for(const [id,name,keywords] of [['epic','Epic native','Character, Epic Hero'],['ally','Ally epic','Character, Epic Hero'],['monster','Other native','Monster']])fixture.units.push({...structuredClone(base),id,name,category:keywords,keywords});
    fixture.factions[0].unitIds.push('epic','monster');beCatalogIds=()=>['epic','leader','ally','monster'];
    wbAdd('epic');wbAdd('leader');wbAdd('ally');wbAdd('monster');`,c);
  for(const [id,category] of [['epic','Epic Hero'],['leader','Character'],['ally','Other'],['monster','Other']]){
    c.unitId=id;assert.equal(vm.runInContext('wbMobileCategory(wbUnits().get(unitId))',c),category);
  }
  for(const fn of ['wbMobileCatalogList()','wbCatalogList()','wbRosterRows()']){
    const html=vm.runInContext(fn,c);assert.match(html,/>Epic Hero[ <]/);assert.match(html,/>Character[ <]/);assert.match(html,/>Other[ <]/);
  }
  assert.doesNotMatch(vm.runInContext("wbMobileCatalogList('Character')",c),/Epic native|Ally epic/);
  assert.match(vm.runInContext("wbMobileCatalogList('Other')",c),/Ally epic/);
  assert.doesNotMatch(vm.runInContext("wbRosterRows('Epic Hero')",c),/Ally epic|Other native/);
  assert.match(vm.runInContext("wbRosterRows('Other')",c),/Ally epic/);
});

test('Army Builder menu returns to archive inside the builder and preserves the army from other pages',()=>{
  const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',hidden:false});return nodes.get(key);};
  const c=vm.createContext({document:{querySelector:node},window:{addEventListener(){}},fetch:()=>new Promise(()=>{}),location:{hash:'#builder'},history:{},console});
  vm.runInContext(read('app.js'),c);
  vm.runInContext("state={user:{id:'owner',admin:false},users:[],account:{},mailEnabled:false,needsEmail:false};builderPage=()=>{};leaguesPage=()=>{};var archives=0;builderArchive=()=>{archives++};render();",c);
  let prevented=false;nodes.get('#nav').onclick({target:{closest:()=>({})},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(vm.runInContext('archives',c),1);
  c.location.hash='#campionati';vm.runInContext('render()',c);prevented=false;
  nodes.get('#nav').onclick({target:{closest:()=>({})},preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(vm.runInContext('archives',c),1);
});

test('Connection notice can be dismissed for the offline period and returns on a connection change',()=>{
  const source=read('offline.js'),a=source.indexOf('  function connectionChanged('),b=source.indexOf('  function refreshActivity(',a);
  let notice;
  const document={querySelector:key=>key==='#offline-connection-notice'?notice:{after:value=>{notice=value;}},createElement:()=>{
    const p={textContent:''},button={onclick:null};return {hidden:true,dataset:{},querySelector:key=>key==='p'?p:button};
  }};
  const c=vm.createContext({document,navigator:{onLine:false},active:()=>true});
  vm.runInContext('let connectionOnline=true,connectionNotice=null,connectionDismissed=false;'+source.slice(a,b),c);
  vm.runInContext('connectionChanged(false);refreshConnectionNotice()',c);assert.equal(notice.hidden,false);assert.match(notice.querySelector('p').textContent,/offline/);
  notice.querySelector('button').onclick();vm.runInContext('refreshConnectionNotice();connectionChanged(false);refreshConnectionNotice()',c);assert.equal(notice.hidden,true);
  c.navigator.onLine=true;vm.runInContext('connectionChanged(true);refreshConnectionNotice()',c);assert.equal(notice.hidden,false);assert.match(notice.querySelector('p').textContent,/nuovo online/);
});

test('Conflicts automatically open one comparison dialog with explicit choices and preserve both versions offline',async()=>{
  const source=read('offline.js'),start=source.indexOf('  async function showConflictDialog('),end=source.indexOf('  function sameContent(',start);
  let current=null,created=0;
  const document={querySelector:()=>current,body:{appendChild:dialog=>{current=dialog;}},createElement:()=>{
    created++;const buttons=['local','online'].map(value=>({dataset:{conflictPick:value}})),close={hidden:true},status={textContent:''};
    return {dataset:{},handlers:{},setAttribute(){},querySelectorAll:selector=>selector==='button'?[...buttons,close]:buttons,
      querySelector:selector=>selector==='h2'?{focus(){}}:selector==='[data-conflict-result]'?status:close,
      addEventListener(name,fn){this.handlers[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close();},remove(){current=null;}};
  }};
  const c=vm.createContext({document,owner:'owner',isOffline:false,unavailable:()=>c.isOffline,describeConflictArmy:async army=>army?.name||'Eliminata',esc:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),builderDate:v=>v});
  c.fixture={records:{a:{generation:'g1',army:{name:'Locale <script>',updated:'now'},conflict:{revision:'r1',remote:{name:'Online',updated:'before'}}}}};
  vm.runInContext('let conflictOpening=false,conflictChoosing=false;'+source.slice(start,end),c);
  await vm.runInContext('showConflictDialog(fixture,owner)',c);
  assert.equal(current.open,true);assert.equal(created,1);assert.match(current.innerHTML,/Locale &lt;script&gt;/);assert.match(current.innerHTML,/Sul dispositivo/);assert.match(current.innerHTML,/data-conflict-pick="local"/);assert.match(current.innerHTML,/data-conflict-pick="online"/);
  let prevented=false;current.handlers.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  await vm.runInContext('showConflictDialog(fixture,owner)',c);assert.equal(created,1);
  c.isOffline=true;await vm.runInContext('showConflictDialog(fixture,owner)',c);
  assert.ok(current.querySelectorAll('[data-conflict-pick]').every(button=>button.disabled));assert.equal(current.querySelector('[data-conflict-offline-close]').hidden,false);
  current.querySelector('[data-conflict-offline-close]').onclick();assert.equal(current,null);assert.equal(c.fixture.records.a.army.name,'Locale <script>');assert.equal(c.fixture.records.a.conflict.remote.name,'Online');
});
