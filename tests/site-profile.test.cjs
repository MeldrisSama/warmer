'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function context(){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:false,addEventListener(){},querySelector(){return null;}});return nodes.get(id);};
  const main=node('#main'),location={hash:'#classifica',search:''};
  const c=vm.createContext({console,URLSearchParams,Date,location,history:{state:null,replaceState(_state,_title,hash){location.hash=hash;}},document:{querySelector:node,getElementById:id=>node('#'+id),querySelectorAll:()=>[]},window:{addEventListener(){},SectorTheme:{mount(){c.appearanceMounted=true;}}},setTimeout,clearTimeout});
  main.querySelector=node;
  const source=fs.readFileSync(path.join(__dirname,'../Cangiolone.com/app.js'),'utf8');
  vm.runInContext(source.slice(0,source.lastIndexOf('refresh().catch(')),c);
  c.nodes=nodes;c.mainNode=main;c.appearanceMounted=false;
  vm.runInContext(`state={user:{id:'owner',name:'Player',username:'player',admin:false},mailEnabled:true,needsEmail:false,account:{email:'verified@example.test',pendingEmail:null},users:[{id:'owner',name:'Player'},{id:'other',name:'Opponent'}],matches:[],leagues:[]};`,c);
  return c;
}

test('Verified profile shows its address without offering another verification form',()=>{
  const c=context();vm.runInContext('profilePage()',c);const html=c.mainNode.innerHTML;
  assert.match(html,/verified@example\.test/);assert.match(html,/Email verificata/);assert.doesNotMatch(html,/id="profile-email"|Invia.*link|name="email"/);assert.match(html,/id="profile-password"/);assert.match(html,/id="logout"/);assert.equal(c.appearanceMounted,true);
});

test('The Army Builder navigation link calls the archive navigation handler',()=>{
  const c=context();let handler,called=false;c.builderNavigate=()=>{called=true;};c.builderPage=()=>{};c.nodes.get('#nav');
  c.document.querySelector('#nav').querySelector=selector=>selector==='a[href="#builder"]'?{addEventListener(event,fn){assert.equal(event,'click');handler=fn;}}:null;
  c.location.hash='#builder';vm.runInContext('render()',c);assert.equal(typeof handler,'function');handler({button:0});assert.equal(called,true);
});

test('An unverified or pending address retains verification and onboarding remains usable',()=>{
  const c=context();vm.runInContext(`state.account={email:null,pendingEmail:'pending@example.test'};profilePage(true);`,c);assert.match(c.mainNode.innerHTML,/id="profile-email"/);assert.match(c.mainNode.innerHTML,/Invia di nuovo il link/);assert.doesNotMatch(c.mainNode.innerHTML,/profile-password|profile-appearance/);assert.match(c.mainNode.innerHTML,/id="logout"/);
  vm.runInContext(`state.account={email:'old@example.test',pendingEmail:'new@example.test'};profilePage();`,c);assert.match(c.mainNode.innerHTML,/name="current"/);assert.match(c.mainNode.innerHTML,/new@example\.test/);
});

test('The header opens Profile through an icon, logout stays inside it, and Lists is removed from navigation',()=>{
  const c=context();c.standings=()=>{};vm.runInContext('render()',c);
  const account=c.nodes.get('#account').innerHTML,nav=c.nodes.get('#nav').innerHTML;
  assert.match(account,/class="account-profile-link"/);assert.match(account,/<svg/);assert.match(account,/href="#profilo"/);assert.doesNotMatch(account,/id="logout"/);assert.doesNotMatch(nav,/#liste|>Liste</);assert.match(nav,/#builder/);
});

test('Old Lists links open the builder and keep its navigation active',()=>{
  const c=context();let opened=false;c.builderPage=()=>{opened=true;};c.location.hash='#liste';
  vm.runInContext(`render();`,c);assert.equal(opened,true);assert.equal(c.location.hash,'#builder');assert.match(c.nodes.get('#nav').innerHTML,/href="#builder"[^>]*aria-current="page"/);
});

test('Recent matches have separate photo and action cells with no flex table cells',()=>{
  const c=context();c.match={id:'match',a:'owner',b:'other',by:'owner',date:'2026-11-19',scoreA:90,scoreB:80,mission:'Take and Hold',photo:'api.php?action=photo&id=match',void:false};
  let html=vm.runInContext('recentMatchRow(match)',c);assert.equal((html.match(/<td[ >]/g)||[]).length,7);assert.match(html,/<td class="match-photo"><button[^>]*data-photo=/);assert.match(html,/<td><div class="match-actions">/);assert.doesNotMatch(html,/<td class="match-actions"/);assert.match(html,/Annulla/);
  c.match.leagueLocked=true;c.match.photo=null;html=vm.runInContext('recentMatchRow(match)',c);assert.equal((html.match(/<td[ >]/g)||[]).length,7);assert.match(html,/Nessuna foto/);assert.doesNotMatch(html,/data-void/);
});

test('Profile and match text remain escaped',()=>{
  const c=context();vm.runInContext(`state.user.name='<img src=x onerror=alert(1)>';state.account.email='<verified@example.test>';profilePage();`,c);assert.doesNotMatch(c.mainNode.innerHTML,/<img src=x/);assert.match(c.mainNode.innerHTML,/&lt;verified@example\.test&gt;/);
});

test('Standings have no per-player Lists button and a completed match opens its own lists',()=>{
  const c=context();c.rankStandings=()=>[{id:'owner',name:'Player',rank:1,played:1,w:1,d:0,l:0,diff:10,points:3}];
  vm.runInContext(`state.lists=[{id:'legacy',owner:'owner',name:'Legacy'}];standings();`,c);
  assert.doesNotMatch(c.mainNode.innerHTML,/data-player-lists=/);
  vm.runInContext(`state.readableLists=[{player:'owner',match:'confirmed',title:'League',url:'api.php?action=leagueDownload'}];standings();`,c);
  assert.doesNotMatch(c.mainNode.innerHTML,/data-player-lists=/);
  c.match={id:'confirmed',a:'owner',b:'other',by:'owner',date:'2026-11-19',scoreA:90,scoreB:80,leagueLocked:true};
  assert.match(vm.runInContext('recentMatchRow(match)',c),/data-match-lists="confirmed"/);
  c.match.id='pending';assert.doesNotMatch(vm.runInContext('recentMatchRow(match)',c),/data-match-lists/);
});

test('League observers can read revealed lists without receiving participant controls',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../Cangiolone.com/campionato.js'),'utf8');
  const c=vm.createContext({state:{user:{id:'observer'},league:{}},mine:f=>f.lineups!==null,player:id=>id,confirmed:()=>false,playable:()=>true,playerArmy:()=>'',openFixture:null});
  vm.runInContext(source.slice(source.indexOf('function listPanel('),source.indexOf('function resultPanel('))+source.slice(source.indexOf('function photoPanel('),source.indexOf('function renderRounds(')),c);
  c.fixture={id:'fixture',a:'one',b:'two',lineups:null,listsReadable:true};
  let html=vm.runInContext('fixtureRow(fixture)',c);assert.match(html,/data-lineup="one"/);assert.match(html,/data-lineup="two"/);assert.doesNotMatch(html,/<form|leaguePropose|leagueConfirm/);
  c.fixture.listsReadable=false;html=vm.runInContext('fixtureRow(fixture)',c);assert.doesNotMatch(html,/data-lineup|<details/);
});

test('League photos are visible to observers while upload stays with participants after confirmation',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../Cangiolone.com/campionato.js'),'utf8');
  const c=vm.createContext({mine:f=>f.lineups!==null,escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;'),player:id=>id,action:(name,label)=>`<button value="${name}">${label}</button>`});
  vm.runInContext(source.slice(source.indexOf('function photoPanel('),source.indexOf('function fixtureRow(')),c);
  c.fixture={a:'one',b:'two',lineups:{},result:null};assert.equal(vm.runInContext('photoPanel(fixture)',c),'');
  c.fixture.result={void:false,photo:null};assert.match(vm.runInContext('photoPanel(fixture)',c),/name="photo"/);
  c.fixture.result.photo='api.php?action=photo&id=match';c.fixture.lineups=null;
  const html=vm.runInContext('photoPanel(fixture)',c);assert.match(html,/<img/);assert.doesNotMatch(html,/<form|name="photo"/);
  c.fixture.lineups={};c.fixture.result.void=true;assert.doesNotMatch(vm.runInContext('photoPanel(fixture)',c),/<form/);
  await assert.rejects(c.matchPhotoData({size:6*1024*1024,type:'image/png'}),/5 MB/);
  await assert.rejects(c.matchPhotoData({size:100,type:'text/html'}),/JPG/);
});

test('Logout inside Profile preserves the existing API flow and handles failure without leaving the page',async()=>{
  const c=context();const calls=[];c.api=async action=>{calls.push(action);};c.refresh=async()=>{calls.push('refresh');};vm.runInContext('profilePage()',c);
  const button=c.nodes.get('#logout');await button.onclick({currentTarget:button});assert.deepEqual(calls,['logout','refresh']);assert.equal(c.location.hash,'classifica');
  c.location.hash='#profilo';c.api=async()=>{throw Error('Connection failed');};c.notify=()=>{};button.disabled=false;await button.onclick({currentTarget:button});assert.equal(button.disabled,false);assert.equal(c.location.hash,'#profilo');
});


test('Profile photo controls, compression and removal preserve existing account flows',async()=>{
  const c=context();vm.runInContext('profilePage()',c);assert.match(c.mainNode.innerHTML,/profile-photo/);assert.match(c.mainNode.innerHTML,/48 KB/);
  await assert.rejects(c.profilePhotoData({type:'image/svg+xml',size:10}),/JPG/);
  await assert.rejects(c.profilePhotoData({type:'image/jpeg',size:11*1024*1024}),/10 MB/);
  const draws=[];let quality;
  c.Image=class{naturalWidth=800;naturalHeight=600;async decode(){}};
  c.fileToBase64=async()=> 'data:image/png;base64,test';
  c.document.createElement=()=>({getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);}}),toDataURL:(type,q)=>{quality=q;return 'data:image/jpeg;base64,small';}});
  assert.equal(await c.profilePhotoData({type:'image/png',size:100}),'data:image/jpeg;base64,small');
  assert.equal(quality,0.85);assert.deepEqual(draws[0].slice(1),[100,0,600,600,0,0,256,256]);
  vm.runInContext("state.user.avatar='api.php?action=avatar&id=owner&v=one';profilePage()",c);
  assert.match(c.mainNode.innerHTML,/class="profile-avatar"/);assert.match(c.mainNode.innerHTML,/remove-profile-photo/);
  const calls=[];c.api=async(action,data)=>calls.push([action,data.photo]);c.refresh=async()=>{};c.notify=()=>{};
  await c.nodes.get('#remove-profile-photo').onclick();assert.deepEqual(calls,[['avatarSave',null]]);
  vm.runInContext('profilePage(true)',c);assert.doesNotMatch(c.mainNode.innerHTML,/profile-photo/);
});
