const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Cangiolone.com/app.js','utf8');
const calendar=source.slice(source.indexOf('function calendarFixtureStatus('),source.indexOf('function leaguesPage('));
function setup(data){
  const output={innerHTML:''},form={elements:{league:{value:''},status:{value:''},mine:{checked:false}}};
  const panel={innerHTML:'',classList:{add(){}},querySelector:s=>s==='form'?form:output};
  const main={firstElementChild:panel,innerHTML:''};
  const context=vm.createContext({main,state:{user:{id:'me'}},page:()=> 'calendario',api:async()=>data,
    esc:v=>String(v??'').replaceAll('<','&lt;'),name:id=>id,dateLabel:d=>d,leagueLink:l=>'campionato.php?id='+l.id,encodeURIComponent});
  vm.runInContext(calendar,context);
  return {context,panel,form,output};
}
test('stati: riposo, confermato, annullato e proposta pendente',()=>{
  const {context}=setup({});
  for(const [fixture,status] of [
    [{b:null},'riposo'],[{b:'other',result:{void:false}},'giocato'],
    [{b:'other',result:{void:true}},'da-giocare'],[{b:'other',awaiting:true},'conferma']
  ])assert.equal(context.calendarFixtureStatus(fixture),status);
});
test('iscrizioni aperte, escaping, incontri e filtri combinati',async()=>{
  const leagues=[
    {id:'open',name:'<Aperto>',entrants:1},
    {id:'paused',name:'Pausa',paused:'2026-01-01'},
    {id:'closed',name:'Concluso',closed:'2026-01-01'},
    {id:'active',name:'In corso',start:'2026-01-01'}
  ];
  const fixtures=[
    {id:'one',leagueId:'active',round:2,a:'me',b:'other'},
    {id:'two',leagueId:'active',round:1,a:'third',b:null},
    {id:'three',leagueId:'closed',round:1,a:'me',b:'third',result:{void:false,scoreA:90,scoreB:50,date:'2026-01-02'}}
  ];
  const {context,panel,form,output}=setup({leagues,fixtures});
  await context.calendarPage();
  const signup=panel.innerHTML.split('calendar-fixtures-title')[0];
  assert.match(signup,/&lt;Aperto>/);
  assert.doesNotMatch(signup,/id=paused|id=closed|id=active/);
  assert.match(output.innerHTML,/fixture=one/);
  assert.ok(output.innerHTML.indexOf('Giornata 1')<output.innerHTML.indexOf('Giornata 2'));
  form.elements.mine.checked=true;form.onchange();
  assert.doesNotMatch(output.innerHTML,/fixture=two/);
  form.elements.league.value='active';form.elements.status.value='giocato';form.onchange();
  assert.match(output.innerHTML,/Nessun incontro/);
});
test('risposta tardiva non sovrascrive una pagina abbandonata',async()=>{
  const {context,panel}=setup({leagues:[],fixtures:[]});
  let resolve;context.api=()=>new Promise(r=>resolve=r);
  const pending=context.calendarPage();context.page=()=> 'home';
  resolve({leagues:[],fixtures:[]});await pending;
  assert.equal(panel.innerHTML,'');
});
