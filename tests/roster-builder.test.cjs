'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{spawnSync}=require('node:child_process');
function context(){
 const result=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'league-roster-model.php')],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const fixture=JSON.parse(result.stdout),c=vm.createContext({console,esc:String,URL,URLSearchParams,crypto:require('node:crypto').webcrypto,state:{user:{id:'owner'}},page:()=> 'builder',location:{search:'?roster=official',href:'http://localhost/index.php?roster=official#builder'},history:{state:null,replaceState(){}},notify(){},main:{querySelector:()=>null},document:{activeElement:null},confirm:()=>true});
 for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),c);
 c.fixture=fixture;c.source={id:'official',version:1,leagueId:'season',matchLimit:2000,roster:{...fixture.roster,catalogId:'historical',edition:'11',name:'Bacino'}};
 c.fixture.catalog.catalogId='historical';c.api=async action=>action.startsWith('leagueRosterDraft')?{source:c.source}:action==='builderArmies'?{armies:[]}:action==='builderDefaults'?{defaults:[]}:{catalog:c.fixture.catalog};
 vm.runInContext('builderRender=()=>{};builderWorkbenchRender=()=>{}',c);return c;
}
test('Roster entry route starts a separate empty match draft using the historical catalog',async()=>{
 const c=context();await vm.runInContext('builderLoad()',c);
 const army=vm.runInContext('builderUi.army',c);assert.equal(army.rosterSource.id,'official');assert.equal(army.catalogId,'historical');assert.equal(army.limit,2000);assert.equal(army.entries.length,0);assert.equal(army.purpose,undefined);
 vm.runInContext("wbAdd('roster_vehicle')",c);assert.equal(army.entries[0].entryId,'copy_a');assert.equal(army.entries[0].models,1);
 vm.runInContext("wbAdd('roster_vehicle')",c);assert.equal(army.entries.length,1);
 assert.equal(vm.runInContext('beRosterErrors().length',c),0);
 army.entries[0].models=2;assert.ok(vm.runInContext('beRosterErrors().length',c));army.entries[0].models=1;
 army.entries[0].loadoutSelections=structuredClone(c.fixture.both.entries[0].loadoutSelections);assert.equal(vm.runInContext('beRosterErrors().length',c),0);
 const paid=c.source.roster.entries[0].options.find(o=>o.cost===25);const u=c.fixture.catalog.units[0];for(const group of u.loadoutRecipe.groups){const choice=group.choices.find(ch=>ch.weapons[paid.id]);if(choice)army.entries[0].loadoutSelections[group.id]={[group.default]:0,[choice.id]:1};}
 assert.ok(vm.runInContext('beRosterErrors().some(e=>e.includes("non riservata"))',c));
});
test('Multiple copies are chosen explicitly and unreserved units never enter the draft',async()=>{
 const c=context();c.source.roster.entries.push({...structuredClone(c.source.roster.entries[0]),entryId:'copy_b',paidOptions:{}});await vm.runInContext('builderLoad()',c);
 let html;c.wbModal=(_title,body)=>{html=body;return {querySelectorAll:()=>[]};};vm.runInContext("wbAdd('roster_vehicle')",c);assert.match(html,/copy_a/);assert.match(html,/copy_b/);assert.equal(vm.runInContext('builderUi.army.entries.length',c),0);
 vm.runInContext("wbAdd('roster_vehicle','copy_b');wbAdd('squad')",c);assert.equal(vm.runInContext('builderUi.army.entries.length',c),1);assert.equal(vm.runInContext('builderUi.army.entries[0].entryId',c),'copy_b');
});
