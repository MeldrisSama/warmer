'use strict';
// Exercise real catalog choices in the client engine, then verify their payloads in PHP.
// No application configuration, session or database is loaded.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Specify a catalog JSON.');
const catalog=JSON.parse(fs.readFileSync(source,'utf8')),units=new Map(catalog.units.map(u=>[u.id,u]));
const c=vm.createContext({builderClone:structuredClone,notify(){},wbUnits:()=>units});
vm.runInContext(fs.readFileSync(path.join(root,'Cangiolone.com/builder-engine.js'),'utf8'),c);
const directory=path.join(root,'.taste-skill/loadout-check');fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,'cases.ndjson'),fd=fs.openSync(file,'w');let cases=0,disabled=0,configurations=0,maxChoices=0;
try{
  for(const unit of units.values()){
    const recipe=unit.loadoutRecipe;if(!recipe?.groups?.length)continue;
    maxChoices=Math.max(maxChoices,...recipe.groups.map(g=>g.choices.length));
    const layouts=recipe.layouts?.length?recipe.layouts.map(l=>({models:Object.values(l.counts).reduce((a,b)=>a+b,0),counts:l.counts})):Array.from(new Set(unit.points.map(p=>p.models)),models=>({models,counts:null}));
    for(const layout of layouts){
      configurations++;c.unit=unit;c.models=layout.models;c.counts=layout.counts;
      vm.runInContext(`entry={unitId:unit.id,models,weaponCounts:{},enhancementIds:[],loadoutSelections:beSelections(unit,models)};
        if(counts){entry.loadoutSelections._models=builderClone(counts);for(const g of unit.loadoutRecipe.groups)entry.loadoutSelections[g.id]={[g.default]:beCapacity(unit.loadoutRecipe,g,models,counts)};}beSync(unit,entry);`,c);
      const base=structuredClone(c.entry);
      const write=()=>{const cost=vm.runInContext('beSync(unit,entry)',c),price=vm.runInContext('beEntryBasePrice(unit,entry,1)',c);fs.writeSync(fd,JSON.stringify({unit:unit.id,models:c.entry.models,selections:c.entry.loadoutSelections,counts:c.entry.weaponCounts,cost,price})+'\n');cases++;};
      write();
      for(const group of recipe.groups)for(const choice of group.choices){
        if(choice.id===group.default)continue;c.entry=structuredClone(base);c.group=group;c.choice=choice;
        const allowed=vm.runInContext('beChoiceAllowed(unit,entry,group,choice.id,1)',c);
        const changed=vm.runInContext('beChangeChoice(entry,group.id,choice.id,1)',c);
        assert.equal(changed,allowed,`${unit.name}: button and mutation disagree`);
        if(changed)write();else disabled++;
      }
    }
  }
}finally{fs.closeSync(fd);}
const checked=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit=256M',path.join(root,'tests/builder-loadout-cases.php'),source,file],{encoding:'utf8',maxBuffer:1e6,windowsHide:true});
assert.equal(checked.status,0,checked.stdout+checked.stderr);
console.log(JSON.stringify({version:catalog.version,configurations,cases,disabled,maxChoices,server:JSON.parse(checked.stdout)}));
