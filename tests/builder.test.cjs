'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
test('Builder PHP model and syntax',()=>{
  for(const name of ['builder-model.php','api.php','storage.php','index.php','router.php']){
    const r=spawnSync(process.env.PHP_BINARY||'php',['-l',path.join(root,'Cangiolone.com',name)],{encoding:'utf8'});
    assert.equal(r.status,0,r.stdout+r.stderr);
  }
  const check=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'builder-model.php')],{encoding:'utf8'});
  assert.equal(check.status,0,check.stdout+check.stderr);
});
test('Builder JS totals and escaping with an independent demo catalog',()=>{
  const code=fs.readFileSync(path.join(root,'Cangiolone.com/builder.js'),'utf8');
  const context=vm.createContext({});
  vm.runInContext(code,context);
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'Cangiolone.com/builder-example.json'),'utf8'));
  context.fixture=fixture;
  const output=vm.runInContext(`builderUi.catalog=fixture;builderUi.edition='10';builderUi.army={factionId:'esploratori_stellari',detachmentId:'spedizione',limit:2000,entries:[{unitId:'ricognitori',models:10,quantity:2,equipmentIds:['sensore']},{unitId:'vettore',models:1,quantity:1,equipmentIds:[]}]};builderTotals()`,context);
  assert.equal(output.total,480);
  assert.equal(output.issues.length,0);
  const invalid=vm.runInContext(`builderUi.army.limit=400;builderTotals()`,context);
  assert.equal(invalid.issues.length,1);
});
