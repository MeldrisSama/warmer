'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../Cangiolone.com/statistics.js'),'utf8');
function model(){const c=vm.createContext({});vm.runInContext(source,c);return c;}
const matches=[
  {id:'one',a:'me',b:'other',date:'2026-01-01',scoreA:90,scoreB:60,leagueId:null},
  {id:'two',a:'other',b:'me',date:'2026-02-01',scoreA:80,scoreB:50,leagueId:'league'},
  {id:'three',a:'me',b:'third',date:'2026-03-01',scoreA:70,scoreB:70,leagueId:'league'},
  {id:'void',a:'me',b:'other',date:'2026-04-01',scoreA:100,scoreB:0,void:true},
  {id:'others',a:'third',b:'other',date:'2026-05-01',scoreA:100,scoreB:0}
];
test('Personal results orient scores, count each archive match once and exclude void/unrelated games',()=>{
  const c=model(),r=c.personalResults([...matches,matches[1]],'me');
  assert.equal(r.length,3);assert.deepEqual(Array.from(r,m=>m.result),['V','S','P']);
  assert.equal(r[1].scored,50);assert.equal(r[1].conceded,80);
  const s=c.summarizeResults(r);assert.equal(s.played,3);assert.equal(s.w,1);assert.equal(s.d,1);assert.equal(s.l,1);assert.equal(s.diff,0);assert.equal(s.scored,210);assert.equal(s.averageFor,70);assert.equal(s.winRate,100/3);
});
test('Inclusive dates, opponent and league/type filters combine without assuming leagueLocked',()=>{
  const c=model();
  assert.equal(c.personalResults(matches,'me',{from:'2026-02-01',to:'2026-02-01',opponent:'other',league:'league',type:'league'}).length,1);
  assert.equal(c.personalResults(matches,'me',{type:'friendly'}).length,1);
  assert.equal(c.personalResults(matches,'me',{type:'league'}).length,2);
  assert.equal(c.personalResults(matches,'me',{from:'2026-03-02',to:'2026-01-01'}).length,0);
  assert.equal(c.personalResults(matches,'me',{league:'missing'}).length,0);
});
test('No games and all draws have truthful rates and no division by zero',()=>{
  const c=model(),empty=c.summarizeResults([]);assert.equal(empty.winRate,null);assert.equal(empty.averageFor,null);assert.equal(empty.averageAgainst,null);
  const draw=c.summarizeResults(c.personalResults([matches[2]],'me'));assert.equal(draw.winRate,0);assert.equal(draw.d,1);
});
test('Page escapes identity, opponents and mission, and supports filter submission',()=>{
  const c=model();c.location={hash:'#statistiche'};c.URLSearchParams=URLSearchParams;
  c.esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');c.dateLabel=s=>s;c.empty=()=>'<p>Nessuna partita</p>';
  const listeners={},form={elements:Object.fromEntries(['from','to','type','league'].map(k=>[k,{value:'',addEventListener(){},setCustomValidity(){},reportValidity(){}}])),addEventListener:(k,fn)=>listeners[k]=fn};
  c.main={innerHTML:'',querySelector:()=>form};
  c.state={user:{id:'me',name:'<script>bad</script>'},users:[{id:'other',name:'<img src=x>'}],leagues:[{id:'league',name:'<svg>'}],matches:[{...matches[0],mission:'<iframe>'}]};
  c.statisticsPage();assert.doesNotMatch(c.main.innerHTML,/<script>|<img src=x>|<iframe>/);assert.match(c.main.innerHTML,/&lt;iframe>/);assert.match(c.main.innerHTML,/Confronti diretti/);
  c.FormData=class{*[Symbol.iterator](){yield ['from','2026-01-01'];yield ['type','friendly'];}};
  listeners.submit({preventDefault(){}});assert.equal(c.location.hash,'statistiche?from=2026-01-01&type=friendly');
});
