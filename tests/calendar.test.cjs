'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const vm=require('node:vm');
const php=process.env.PHP_BINARY||'php';
const cgi=process.env.PHP_CGI_BINARY||path.join(path.dirname(php),process.platform==='win32'?'php-cgi.exe':'php-cgi');
const id=()=>randomBytes(12).toString('hex');
test('Calendario: griglia con lunedì iniziale, bisestile e mesi di 6 settimane',async()=>{
  const context=vm.createContext({});
  const source=await fs.readFile(path.join(__dirname,'../Cangiolone.com/calendar.js'),'utf8');
  vm.runInContext(source,context);
  const feb=context.calendarMonthDays(2024,1);
  assert.equal(feb.length,35);assert.equal(feb[0],null);assert.equal(feb[3],'2024-02-01');assert.ok(feb.includes('2024-02-29'));
  const march=context.calendarMonthDays(2026,2);
  assert.equal(march.length,42);assert.equal(march[6],'2026-03-01');
  assert.equal(context.calendarMonthDays(2026,5)[0],'2026-06-01');
});
test('Calendario: filtri, posti liberi, date di campionato ed escaping',async()=>{
  const nodes=new Map(),panel={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:''});return nodes.get(selector);}};
  const context=vm.createContext({state:{user:{id:'me',admin:false}},page:()=> 'calendario',main:{querySelector:()=>panel},
    name:id=>id==='me'?'<Me>':id,esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),encodeURIComponent});
  vm.runInContext(await fs.readFile(path.join(__dirname,'../Cangiolone.com/calendar.js'),'utf8'),context);
  context.demo={selected:'2026-11-27',year:2026,month:10,league:'',mine:false,data:{today:'2026-11-25',
    leagues:[{id:'league',name:'<Lega>',start:'2026-01-01'}],
    fixtures:[{id:'fixture',leagueId:'league',round:1,a:'me',b:'other',played:false},{id:'undated',leagueId:'league',round:2,a:'me',b:'other',played:false}],
    events:[{id:'open',date:'2026-11-27',time:'20:00',a:'other',b:null,fixture:null,owner:'other',location:'<Luogo>',notes:'<script>alert(1)</script>'},
      {id:'league-event',date:'2026-11-27',time:'18:00',a:'me',b:'other',fixture:'fixture',owner:'me'},
      {id:'cancelled',date:'2026-11-27',a:'me',b:null,cancelled:true,fixture:null}]}};
  vm.runInContext('calendarView=demo; calendarDraw();',context);
  assert.match(nodes.get('#calendar-grid').innerHTML,/data-calendar-event="league-event"/);
  assert.match(nodes.get('#calendar-agenda').innerHTML,/data-calendar-join="open"/);
  assert.match(nodes.get('#calendar-agenda').innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(nodes.get('#calendar-agenda').innerHTML,/<script>/);
  assert.match(nodes.get('#calendar-unscheduled').innerHTML,/data-calendar-fixture="undated"/);
  assert.doesNotMatch(nodes.get('#calendar-unscheduled').innerHTML,/data-calendar-fixture="fixture"/);
  context.demo.mine=true;vm.runInContext('calendarDraw()',context);
  assert.doesNotMatch(nodes.get('#calendar-grid').innerHTML,/data-calendar-event="open"|cancelled/);
  context.demo.mine=false;context.demo.league='friendly';vm.runInContext('calendarDraw()',context);
  assert.doesNotMatch(nodes.get('#calendar-grid').innerHTML,/league-event/);
  assert.match(nodes.get('#calendar-grid').innerHTML,/data-calendar-event="open"/);
  context.demo.league='';
  context.demo.data.fixtures[0].proposal={version:1,pending:{by:'other',event:{date:'2026-11-27',time:'20:00'}}};
  vm.runInContext('calendarDraw()',context);
  assert.match(nodes.get('#calendar-unscheduled').innerHTML,/data-calendar-proposal="calendarApprove"/);
  assert.doesNotMatch(nodes.get('#calendar-agenda').innerHTML,/data-calendar-edit="league-event"/);
});
test('La pagina del campionato propone la data prima delle liste e distingue chi deve approvare',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../Cangiolone.com/campionato.js'),'utf8');
  const context=vm.createContext({state:{user:{id:'alice'},league:{},today:'2026-11-25'},mine:()=>true,
    player:id=>id,escapeHtml:String,formatDate:String,action:(name,label)=>'<button value="'+name+'">'+label+'</button>'});
  vm.runInContext(source.slice(source.indexOf('function schedulePanel('),source.indexOf('function listPanel(')),context);
  const f={a:'alice',b:'bob',scheduleProposal:{version:1,pending:{by:'alice',event:{date:'2026-12-01',time:'20:00'}}}};
  let html=context.schedulePanel(f);
  assert.match(html,/calendarWithdraw/);assert.doesNotMatch(html,/value="calendarApprove"/);
  context.state.user.id='bob';html=context.schedulePanel(f);
  assert.match(html,/calendarApprove/);assert.match(html,/calendarReject/);assert.doesNotMatch(html,/calendarWithdraw/);
  assert.ok(source.indexOf('${schedulePanel(fixture)}')<source.indexOf('${listPanel(fixture)}'));
});
test('Calendario API con sessioni reali e SQLite isolato via CGI',{timeout:60000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'warmer-calendar-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const app=path.join(root,'app'),sessions=path.join(root,'sessions');
  await fs.mkdir(app);await fs.mkdir(sessions);
  for(const entry of await fs.readdir(path.join(__dirname,'../Cangiolone.com'))){
    if(entry.endsWith('.php')&&entry!=='config.php')await fs.copyFile(path.join(__dirname,'../Cangiolone.com',entry),path.join(app,entry));
  }
  const setup='calendar-isolated-setup';
  await fs.writeFile(path.join(app,'config.php'),"<?php return ['setup_hash'=>'"+createHash('sha256').update(setup).digest('hex')+"','database'=>['driver'=>'sqlite','path'=>__DIR__.'/calendar.sqlite']];");
  function client(){
    let cookie='',csrf='';
    return (action,data,status=200,headers={})=>{
      const body=data===undefined?'':JSON.stringify(data);
      const result=spawnSync(cgi,['-d','session.save_path="'+sessions.replaceAll('\\','/')+'"'],{cwd:app,input:body,encoding:'utf8',env:{
        ...process.env,REDIRECT_STATUS:'1',REQUEST_METHOD:data===undefined?'GET':'POST',SCRIPT_FILENAME:path.join(app,'api.php'),
        SCRIPT_NAME:'/api.php',REQUEST_URI:'/api.php?action='+action,QUERY_STRING:'action='+action,HTTPS:'on',SERVER_NAME:'localhost',SERVER_PROTOCOL:'HTTP/1.1',GATEWAY_INTERFACE:'CGI/1.1',
        REMOTE_ADDR:'127.0.0.1',CONTENT_TYPE:'application/json',CONTENT_LENGTH:String(Buffer.byteLength(body)),
        HTTP_COOKIE:cookie,HTTP_X_CSRF_TOKEN:csrf,...headers
      }});
      assert.equal(result.status,0,result.stderr+result.stdout);
      const split=result.stdout.search(/\r?\n\r?\n/);
      assert.ok(split>=0,result.stdout);
      const head=result.stdout.slice(0,split),json=result.stdout.slice(split).trim();
      const actual=Number(head.match(/^Status: (\d+)/mi)?.[1]||200);
      assert.equal(actual,status,action+': '+json);
      const setCookie=head.match(/^Set-Cookie: (sector_session=[^;]+)/mi);if(setCookie)cookie=setCookie[1];
      const value=head.includes('application/json')?JSON.parse(json):json;if(value.csrf)csrf=value.csrf;
      return value;
    };
  }
  const admin=client(),alice=client(),bob=client(),carlo=client(),guest=client();
  guest('calendar',undefined,401);guest('state');
  guest('calendarSave',{},403,{HTTP_X_CSRF_TOKEN:'bad'});
  guest('state');
  guest('calendarSave',{},401);
  admin('state');admin('setup',{username:'admin',name:'Admin',password:'calendar-password-123',code:setup});
  const adminId=admin('state').user.id;
  const users={};
  for(const [username,call] of [['alice',alice],['bob',bob],['carlo',carlo]]){
    const code=admin('invite',{}).code;call('state');call('register',{username,name:username,password:'calendar-password-123',code});
    users[username]=call('state').user.id;
  }
  const date=new Date();date.setDate(date.getDate()+2);const tomorrow=date.toISOString().slice(0,10);
  const save=(overrides={})=>({id:id(),version:0,proposalVersion:0,date:tomorrow,time:'18:00',a:users.alice,b:'',fixture:'',location:'Sala <test>',notes:'<img src=x>',...overrides});
  const open=save();admin('calendarSave',open);
  let event=admin('calendar').events.find(e=>e.id===open.id);
  assert.equal(event.b,null);assert.equal(event.version,1);assert.equal(event.location,'Sala <test>');
  assert.equal(event.owner,adminId);
  admin('calendarSave',open,409);
  alice('calendarJoin',{id:open.id,version:1},409);
  bob('calendarJoin',{id:open.id,version:1});
  carlo('calendarJoin',{id:open.id,version:1},409);
  event=admin('calendar').events.find(e=>e.id===open.id);assert.equal(event.b,users.bob);assert.equal(event.version,2);
  carlo('calendarSave',{...open,version:2},403);
  alice('calendarSave',{...open,version:2,a:users.carlo,b:users.bob},403);
  alice('calendarSave',{...open,version:2,b:users.bob,time:'19:00'});
  admin('calendarSave',{...open,version:2,b:users.bob},409);
  admin('calendarSave',save({a:'',b:''}),422);
  admin('calendarSave',save({b:users.alice}),422);
  admin('calendarSave',save({a:'missing'}),422);
  admin('calendarSave',save({date:'2000-01-01'}),422);
  admin('calendarSave',save({date:'2027-02-30'}),422);
  admin('calendarSave',save({time:'25:01'}),422);
  admin('calendarSave',save({a:users.bob,time:'19:00'}),409);
  // Joining an open match also checks the joining player's other appointments.
  const collision=save({a:users.carlo,time:'19:00'});admin('calendarSave',collision);
  bob('calendarJoin',{id:collision.id,version:1},409);
  carlo('calendarCancel',{id:open.id,version:3},403);
  alice('calendarLineup',{id:open.id,version:3,text:'Lista Alice'});
  bob('calendarDownload&id='+open.id+'&player='+users.alice,undefined,403);
  admin('calendarLineup',{id:open.id,version:3,text:'Lista amministratore'},403);
  alice('calendarLineup',{id:open.id,version:2,text:'Revisione vecchia'},409);
  alice('calendarLineup',{id:open.id,version:3,text:'Lista Alice aggiornata'});
  assert.equal(alice('calendar').events.find(e=>e.id===open.id).lineups.mine,true);
  assert.ok(!JSON.stringify(bob('calendar')).includes('Lista Alice aggiornata'));
  bob('calendarLineup',{id:open.id,version:3,text:'Lista Bob'});
  assert.equal(admin('calendarDownload&id='+open.id+'&player='+users.alice),'Lista Alice aggiornata');
  assert.equal(alice('calendarDownload&id='+open.id+'&player='+users.bob),'Lista Bob');
  alice('calendarLineup',{id:open.id,version:3,text:'Modifica dopo rivelazione'},409);
  admin('calendarSave',{...open,version:3,b:users.carlo},409);
  admin('calendarCancel',{id:open.id,version:3});
  assert.equal(admin('calendar').events.find(e=>e.id===open.id).cancelled,true);
  const league=admin('leagueOpen',{name:'Campionato di prova',request:id()}).id;
  alice('leagueJoin',{league,army:'orks'});bob('leagueJoin',{league,army:'necrons'});carlo('leagueJoin',{league,army:'aeldari'});
  admin('leagueStart',{league});
  const initial=alice('calendar');
  assert.equal(initial.fixtures.length,3);assert.equal(initial.events.filter(e=>e.fixture).length,0);
  const fixture=initial.fixtures.find(f=>[f.a,f.b].includes(users.alice));
  const outsider=[['bob',bob],['carlo',carlo]].find(([who])=>![fixture.a,fixture.b].includes(users[who]))[1];
  const leagueEvent=save({fixture:fixture.id,a:users.carlo,b:users.carlo,time:'20:00'});
  outsider('calendarSave',leagueEvent,403);
  alice('calendarSave',leagueEvent);
  assert.equal(admin('calendar').events.some(e=>e.fixture===fixture.id),false);
  const opponent=[['bob',bob],['carlo',carlo]].find(([who])=>[fixture.a,fixture.b].includes(users[who]))[1];
  const proposal=()=>alice('calendar').fixtures.find(f=>f.id===fixture.id).proposal;
  assert.equal(proposal().pending.by,users.alice);
  alice('calendarApprove',{fixture:fixture.id,proposalVersion:proposal().version},403);
  outsider('calendarApprove',{fixture:fixture.id,proposalVersion:proposal().version},403);
  const intervening=save({time:'20:00'});admin('calendarSave',intervening);
  opponent('calendarApprove',{fixture:fixture.id,proposalVersion:proposal().version},409);
  assert.ok(proposal().pending);
  admin('calendarCancel',{id:intervening.id,version:1});
  opponent('calendarApprove',{fixture:fixture.id,proposalVersion:proposal().version});
  opponent('calendarApprove',{fixture:fixture.id,proposalVersion:1},409);
  const assigned=admin('calendar').events.find(e=>e.fixture===fixture.id);
  assert.deepEqual([assigned.a,assigned.b],[fixture.a,fixture.b]);
  admin('calendarSave',save({fixture:fixture.id,time:'21:00'}),403);
  outsider('calendarJoin',{id:assigned.id,version:1},409);
  admin('leaguePause',{league});
  alice('calendarSave',{...leagueEvent,version:1,proposalVersion:proposal().version,time:'21:00'},409);
  admin('leagueResume',{league});
  alice('calendarSave',{...leagueEvent,version:1,proposalVersion:proposal().version,time:'21:00'});
  assert.equal(admin('calendar').events.find(e=>e.fixture===fixture.id).time,'20:00');
  opponent('calendarReject',{fixture:fixture.id,proposalVersion:proposal().version});
  assert.equal(proposal().pending,null);
  alice('calendarSave',{...leagueEvent,version:1,proposalVersion:proposal().version,time:'21:00'});
  alice('calendarWithdraw',{fixture:fixture.id,proposalVersion:proposal().version});
  assert.equal(proposal().pending,null);
  alice('calendarSave',{...leagueEvent,version:1,proposalVersion:proposal().version,time:'21:00'});
  opponent('calendarSave',{...leagueEvent,version:1,proposalVersion:proposal().version,time:'22:00'},409);
  opponent('calendarApprove',{fixture:fixture.id,proposalVersion:proposal().version});
  const confirmedEvent=admin('calendar').events.find(e=>e.fixture===fixture.id);
  assert.equal(confirmedEvent.time,'21:00');
  const opponentId=fixture.a===users.alice?fixture.b:fixture.a;
  alice('calendarLineup',{id:assigned.id,version:2,text:'Lista campionato Alice'});
  assert.equal(alice('league&id='+league).fixtures.find(f=>f.id===fixture.id).lineups.mine,true);
  opponent('calendarLineup',{id:assigned.id,version:2,text:'Lista campionato avversario'});
  assert.equal(alice('calendarDownload&id='+assigned.id+'&player='+opponentId),'Lista campionato avversario');
  assert.equal(alice('calendar').events.find(e=>e.id===assigned.id).lineups.readable,true);
  const replacement=save({a:users.alice,time:'17:00'});admin('calendarSave',replacement);
  alice('calendarLineup',{id:replacement.id,version:1,text:'Lista da invalidare'});
  admin('calendarSave',{...replacement,version:1,a:users.bob,b:users.carlo});
  assert.equal(bob('calendar').events.find(e=>e.id===replacement.id).lineups.mine,false);
  bob('calendarLineup',{id:replacement.id,version:2,text:'Lista nuovo giocatore'});
  carlo('calendarLineup',{id:replacement.id,version:2,text:'Lista secondo giocatore'});
  assert.equal(bob('calendarDownload&id='+replacement.id+'&player='+users.bob),'Lista nuovo giocatore');
  const rosterFixture=alice('calendar').fixtures.find(f=>f.id!==fixture.id&&[f.a,f.b].includes(users.alice));
  const rosterOpponent=[['bob',bob],['carlo',carlo]].find(([who])=>[rosterFixture.a,rosterFixture.b].includes(users[who]))[1];
  const rosterEvent=save({fixture:rosterFixture.id,time:'22:00'});
  alice('calendarSave',rosterEvent);
  rosterOpponent('calendarApprove',{fixture:rosterFixture.id,proposalVersion:1});
  const settings=spawnSync(php,['-r','$db=new PDO("sqlite:".$argv[1]);$db->prepare("INSERT INTO w40k_league_roster_settings (id,payload) VALUES (?,?)")->execute([$argv[2],json_encode(["rosterLimit"=>3000,"matchLimit"=>2000,"windowOpen"=>false])]);',path.join(app,'calendar.sqlite'),league],{encoding:'utf8'});
  assert.equal(settings.status,0,settings.stderr);
  const rosterError=alice('calendarLineup',{id:rosterEvent.id,version:1,text:'Tentativo senza verifica'},409);
  assert.match(rosterError.error,/roster/);
  assert.equal(alice('calendar').events.find(e=>e.id===rosterEvent.id).lineups.mine,false);
  // Public calendar data does not include hidden result proposals or list text.
  const pending=admin('calendar');
  assert.ok(pending.fixtures.every(f=>!('pending' in f)&&!('lineups' in f)));
  const sql=spawnSync(php,['-r','$db=new PDO("sqlite:".$argv[1]);$db->exec("UPDATE w40k_league_fixtures SET match_id=\\x27confirmed\\x27 WHERE id=\\x27".$argv[2]."\\x27");',path.join(app,'calendar.sqlite'),fixture.id],{encoding:'utf8'});
  assert.equal(sql.status,0,sql.stderr);
  alice('calendarSave',{...leagueEvent,version:2,proposalVersion:proposal().version,time:'22:00'},409);
  // Persistent data survives a separate storage connection and CGI process.
  assert.equal(admin('calendar').events.find(e=>e.id===leagueEvent.id).time,'21:00');
});

