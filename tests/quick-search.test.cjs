'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function context(){
 const c=vm.createContext({URL,console,esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))});
 for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),c);
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'workbench-fixture.json'),'utf8'));
 catalog.coreRules=[{id:'core_rapid',name:'RAPID FIRE',reference:'24.20',description:'Add the specified number of attacks at half range.',sourceUrl:'https://example.test/rules'}];
 catalog.texts=[{id:'body',description:'WHEN: Fight phase. TARGET: One unit. EFFECT: Test counterattack.'}];
 catalog.stratagems=[{id:'counter',name:'Counterattack',descriptionRef:'body',cp_cost:'2',detachment_id:'first',phase:'Fight phase',turn:'Opponent turn'},{id:'boarding',name:'Boarding test',type:'Boarding Actions'}];
 catalog.units[0].weapons[0].description='Rapid Fire 2';catalog.units[0].sourceUrl='https://example.test/squad';
 catalog.factions.push({id:'other',name:'Altra fazione',unitIds:[],detachments:[{id:'alien',name:'Alien rule',description:'Completely separate text'}]});
 c.catalog=catalog;vm.runInContext('builderUi.catalog=catalog',c);return c;
}
test('Quick search resolves texts and weapon keywords, keeps origins and filters by kind, faction and body',()=>{
 const c=context(),rows=c.wbQuickSearchIndex(c.catalog);
 assert.equal(c.wbQuickSearchFilter(rows,'counterattack','stratagem','test').length,1);
 assert.match(c.wbQuickSearchFilter(rows,'counterattack','stratagem','test')[0].description,/WHEN: Fight phase/);
 assert.equal(c.wbQuickSearchFilter(rows,'counterattack','keyword').length,0);
 assert.ok(c.wbQuickSearchFilter(rows,'rapid fire 2','keyword','test').some(row=>row.reference==='24.20'&&row.unitId==='squad'));
 assert.ok(c.wbQuickSearchFilter(rows,'24.20','keyword','test').length);
 assert.ok(c.wbQuickSearchFilter(rows,'specified attacks','keyword','test').length);
 assert.equal(c.wbQuickSearchFilter(rows,'Alien rule','','test').length,0);
 assert.equal(c.wbQuickSearchFilter(rows,'Alien rule','','other').length,1);
 assert.equal(c.wbQuickSearchFilter(rows,'boarding').length,0);
 assert.equal(c.wbQuickSearchFilter(rows,'no-such-rule').length,0);
 assert.ok(rows.some(row=>row.context.includes('Squadra test')));
});
test('Reference links reject executable schemes and escape catalog text',()=>{
 const c=context();assert.equal(c.wbQuickSearchReference({sourceUrl:'javascript:alert(1)'}),'');assert.equal(c.wbQuickSearchReference({sourceUrl:'data:text/html,test'}),'');
 assert.match(c.wbQuickSearchReference({sourceUrl:'https://example.test/rules'}),/rel="noopener noreferrer"/);
 assert.doesNotMatch(c.wbQuickSearchReference({sourceUrl:'https://example.test/" onmouseover="bad'}),/href="[^"]*" onmouseover=/);
});
test('Real catalog supports rule, keyword and stratagem searches without network access',{skip:!process.env.BUILDER_CATALOG_PATH},()=>{
 const c=context(),catalog=JSON.parse(fs.readFileSync(process.env.BUILDER_CATALOG_PATH,'utf8')),rows=c.wbQuickSearchIndex(catalog);
 assert.ok(rows.length>1000);assert.ok(c.wbQuickSearchFilter(rows,'deep strike').length);assert.ok(c.wbQuickSearchFilter(rows,'counteroffensive','stratagem').length);assert.ok(c.wbQuickSearchFilter(rows,'sustained hits','keyword').length);assert.ok(c.wbQuickSearchFilter(rows,'sustained hits','keyword','ork').every(row=>!row.context.includes('Ynnari')&&!row.context.includes('Warhound')));
});
