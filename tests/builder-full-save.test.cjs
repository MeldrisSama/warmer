'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
test('Full real catalog saves armies and pools from low PHP limits and synchronizes pool metadata',{skip:!process.env.BUILDER_CATALOG_PATH},t=>{
  const catalog=JSON.parse(fs.readFileSync(process.env.BUILDER_CATALOG_PATH,'utf8')),c=vm.createContext({catalog,crypto:require('node:crypto').webcrypto,notify(){},esc:String});
  for(const file of ['builder.js','builder-engine.js','builder-workbench.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Cangiolone.com',file),'utf8'),c);
  vm.runInContext("builderUi.catalog=catalog;builderUi.army=builderWorkbenchNewArmy();builderUi.army.factionId='ec';builderUi.army.catalogId='real';builderWorkbenchRender=()=>{};for(const name of ['Lucius the Eternal','Fulgrim','Lord Exultant','Lord Kakophonist','Sorcerer','Daemon Prince of Slaanesh with Wings'])wbAdd(catalog.units.find(u=>u.factionId==='ec'&&u.name===name).id);builderUi.army.limit=3000;",c);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warmer-full-save-')),fixture=path.join(dir,'army.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(fixture,vm.runInContext('JSON.stringify(builderUi.army)',c));
  for(const [mode,memory] of [['normal','64M'],['pool','128M'],['sync','128M']]){
    const r=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit='+memory,path.join(__dirname,'builder-full-save.php'),process.env.BUILDER_CATALOG_PATH,fixture,mode],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
    const result=JSON.parse(r.stdout);assert.equal(result.saved,true);assert.ok(result.peakMiB<140,mode+' duplicated the catalog');
  }
});
