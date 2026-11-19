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

test('Logout inside Profile preserves the existing API flow and handles failure without leaving the page',async()=>{
  const c=context();const calls=[];c.api=async action=>{calls.push(action);};c.refresh=async()=>{calls.push('refresh');};vm.runInContext('profilePage()',c);
  const button=c.nodes.get('#logout');await button.onclick({currentTarget:button});assert.deepEqual(calls,['logout','refresh']);assert.equal(c.location.hash,'classifica');
  c.location.hash='#profilo';c.api=async()=>{throw Error('Connection failed');};c.notify=()=>{};button.disabled=false;await button.onclick({currentTarget:button});assert.equal(button.disabled,false);assert.equal(c.location.hash,'#profilo');
});
