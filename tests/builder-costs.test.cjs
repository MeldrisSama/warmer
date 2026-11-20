'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
function run(args=[]){const r=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit=256M',path.join(__dirname,'builder-costs.php'),...args],{encoding:'utf8',maxBuffer:32e6});assert.equal(r.status,0,r.stdout.slice(0,1500)+r.stderr);return r.stdout;}
test('Cost parser preserves brackets, trims source values, expands ranges and repairs idempotently',()=>assert.match(run(),/ok/));
test('All real catalog unit sizes have client prices, and stored Eldrad validates server-side',{skip:!process.env.BUILDER_CATALOG_PATH},()=>{
  const catalog=JSON.parse(run([process.env.BUILDER_CATALOG_PATH])),context=vm.createContext({catalog,crypto:require('node:crypto').webcrypto,notify(){},esc:String});
  for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),context);
  const result=vm.runInContext(`builderUi.catalog=catalog;builderUi.army=builderWorkbenchNewArmy();builderWorkbenchRender=()=>{};
    let checked=0;const missing=[];
    for(const unit of catalog.units){
      if(!unit.points.length){missing.push(unit.name);continue;}
      const tiers=new Map(unit.points.map(p=>[p.models+':'+p.first+':'+p.last,p]));
      for(const p of tiers.values()){
        if(unit.loadoutRecipe?.layouts?.some(l=>l.prices))continue;
        const entry={models:p.models,loadoutSelections:beSelections(unit,p.models)};
        for(const ordinal of new Set([p.first,p.last])){if(beEntryBasePrice(unit,entry,ordinal)!==p.points)throw Error(unit.name+' has unknown/wrong price');checked++;}
      }
      for(const layout of unit.loadoutRecipe?.layouts||[])for(const p of layout.prices||[]){
        const entry={models:Object.values(layout.counts).reduce((a,b)=>a+b,0),loadoutSelections:{_models:layout.counts}};
        for(const ordinal of new Set([p.first,p.last])){if(beEntryBasePrice(unit,entry,ordinal)!==p.points)throw Error(unit.name+' formation price');checked++;}
      }
    }
    builderUi.army.factionId='ae';wbAdd('000000568');const eldrad=wbPrice(builderUi.army.entries[0]);
    ({checked,missing,eldrad});`,context);
  assert.equal(result.eldrad,120);assert.ok(result.checked>4800);assert.deepEqual(Array.from(result.missing),['Sir Hekhtur']);
});
