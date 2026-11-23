'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function context(){
 const c=vm.createContext({crypto:require('node:crypto').webcrypto,console,esc:value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),state:{user:{id:'owner',name:'Player'}},notify(){},window:{addEventListener(){}},document:{}});
 for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),c);
 c.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'workbench-fixture.json'),'utf8'));
 vm.runInContext(`builderUi.catalog=fixture;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};wbAdd('squad');wbAdd('leader');wbAdd('support');builderUi.army.entries[0].weaponCounts={'1':5};builderUi.army.entries[1].attachedTo=builderUi.army.entries[0].entryId;builderUi.army.entries[2].attachedTo=builderUi.army.entries[0].entryId;builderUi.army.entries[1].warlord=true;builderUi.army.detachmentIds=['first'];builderUi.army.disposition='Take and Hold';`,c);
 return c;
}
test('Printable sheets keep attached members together, selected gear, notes, totals and current rules',()=>{
 const c=context();vm.runInContext(`fixture.units[0].weapons.push({...fixture.units[0].weapons[0],line:'2',name:'Unselected cannon'});fixture.units[0].enhancements=[{id:'chosen',name:'Chosen gift',cost:'15',description:'Chosen gift rule'},{id:'unused',name:'Unused gift',cost:'40',description:'Unused rule'}];builderUi.army.entries[0].enhancementIds=['chosen'];builderUi.army.entries[0].notes='Remember this unit';`,c);
 const before=vm.runInContext('JSON.stringify(builderUi.army)',c),army=vm.runInContext('builderUi.army',c),html=vm.runInContext('wbPrintHtml()',c);
 assert.equal((html.match(/class="wb-print-card"/g)||[]).length,1);assert.match(html,/Gruppo attached/);
 for(const text of ['Squadra test','Leader test','Support test','5x Rifle','Chosen gift rule','Remember this unit','Primo distaccamento','Take and Hold','Warlord','175 \/ 2000'])assert.match(html,new RegExp(text));
 assert.doesNotMatch(html,/Unselected cannon|Unused gift|Unused rule/);assert.equal(vm.runInContext('builderUi.army',c),army);assert.equal(vm.runInContext('JSON.stringify(builderUi.army)',c),before);
});
test('Missing or circular attachments remain printable and validation warnings are retained',()=>{
 const c=context();vm.runInContext(`builderUi.army.entries[0].attachedTo=builderUi.army.entries[1].entryId;builderUi.army.entries[1].attachedTo=builderUi.army.entries[0].entryId;builderUi.army.entries[2].attachedTo='missing';`,c);
 const html=c.wbPrintHtml();assert.match(html,/Verifiche da completare/);assert.match(html,/unità mancante/);
 for(const name of ['Squadra test','Leader test','Support test'])assert.match(html,new RegExp('class="wb-print-loadout"><h3>'+name));
 assert.equal((html.match(/class="wb-print-loadout"/g)||[]).length,3);
});
test('Catalog, names and notes stay escaped; source identity is restored even if rendering fails',()=>{
 const c=context();vm.runInContext(`builderUi.army.name='<script>alert(1)</script>';builderUi.army.entries[0].notes='<img src=x>';fixture.units[0].abilities=[{name:'<svg onload=alert(1)>',description:'<script>bad</script>'}];`,c);
 const html=c.wbPrintHtml();assert.doesNotMatch(html,/<script>|<img|<svg/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img src=x&gt;/);
 const original=vm.runInContext('builderUi.army',c);c.wbAttachedProfiles=()=>{throw Error('test render failure');};assert.throws(()=>c.wbPrintHtml(),/test render failure/);assert.equal(vm.runInContext('builderUi.army',c),original);
});
test('Pool and empty lists do not open a printable view or request data',()=>{
 const c=context(),messages=[];c.notify=message=>messages.push(message);c.fetch=()=>{throw Error('network');};
 vm.runInContext("builderUi.army.purpose='pool';wbOpenPrint();delete builderUi.army.purpose;builderUi.army.entries=[];wbOpenPrint()",c);
 assert.equal(messages.length,2);assert.match(messages[0],/pool/);assert.match(messages[1],/almeno un/);
});
test('Printing reuses the current catalog offline and leaves the editing mode and selection intact',()=>{
 const c=context();c.fetch=c.api=()=>{throw Error('network');};vm.runInContext("workbench.mode='play';workbench.selected=builderUi.army.entries[1].entryId;workbench.dirty=true",c);
 const before=vm.runInContext('JSON.stringify(workbench)',c);assert.match(c.wbPrintHtml(),/Rifle/);assert.equal(vm.runInContext('JSON.stringify(workbench)',c),before);
});
