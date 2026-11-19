'use strict';
// An isolated, disposable local preview; never reads the application database configuration.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const catalogPath=process.argv[2],directory=process.argv[3];
if(!catalogPath||!directory)throw Error('Usage: node scripts/preview-builder.cjs catalog.json NEW-preview-directory');
if(fs.existsSync(directory))throw Error('Preview directory must be new.');
fs.mkdirSync(directory,{recursive:true});
const source=path.resolve(__dirname,'../Cangiolone.com');
for(const entry of fs.readdirSync(source,{withFileTypes:true}))if(entry.isFile()&&entry.name!=='config.php')fs.copyFileSync(path.join(source,entry.name),path.join(directory,entry.name));
fs.writeFileSync(path.join(directory,'config.php'),`<?php return ['setup_hash'=>'${createHash('sha256').update('builder-local-preview').digest('hex')}','database'=>['driver'=>'sqlite','path'=>__DIR__.'/preview.sqlite']];`);
const php=process.env.PHP_BINARY||'php',base='http://127.0.0.1:8798';
const server=spawn(php,['-d','memory_limit=256M','-d','post_max_size=32M','-S','127.0.0.1:8798','-t',directory,path.join(directory,'router.php')],{stdio:['ignore','ignore','inherit']});
server.on('error',e=>{throw e;});
let cookie='',csrf='';
async function api(action,data){const response=await fetch(base+'/api.php?action='+action,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:data?JSON.stringify(data):undefined});for(const value of response.headers.getSetCookie())if(value.startsWith('sector_session='))cookie=value.split(';')[0];const text=await response.text();let result;try{result=JSON.parse(text);}catch{throw Error(text.slice(0,3000));}if(!response.ok)throw Error(JSON.stringify(result));if(result.csrf)csrf=result.csrf;return result;}
(async()=>{
  let ready=false;
  for(let i=0;i<40;i++){try{await api('state');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert(ready,'Preview server did not start');
  await api('setup',{username:'preview',name:'Anteprima locale',password:'BuilderPreview!2026',code:'builder-local-preview'});
  await api('state');
  const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
  const imported=await api('builderImport',{catalog});
  const active=(await api('builderCatalog&edition=11')).catalog;
  assert.equal(active.catalogId,imported.catalogId);assert.equal(active.units.length,catalog.units.length);
  const faction=active.factions.find(f=>f.id==='sm_dark_angels');
  const squad=active.units.find(u=>u.name==='Intercessor Squad'),leader=active.units.find(u=>u.name==='Azrael');
  assert(faction&&squad&&leader);
  const entry=(id,u)=>({entryId:id,unitId:u.id,models:u.points[0]?.models||1,manualPoints:null,weaponCounts:{},enhancementIds:[],attachedTo:null,warlord:false,notes:''});
  const body=entry('squad_one',squad),character=entry('azrael_one',leader);character.attachedTo=body.entryId;character.warlord=true;
  for(const weapon of squad.weapons)if(/^(Bolt Pistol|Bolt Rifle -|Knives and Fists)/i.test(weapon.name))body.weaponCounts[weapon.line]=body.models;
  for(const weapon of leader.weapons)if(!weapon.enhancement_id)character.weaponCounts[weapon.line]=1;
  const detachment=faction.detachments.find(d=>d.name==='Gladius Task Force');
  const saved=await api('builderSave',{schemaVersion:2,edition:'11',catalogId:active.catalogId,name:'Dark Angels · prova Build e Play',factionId:faction.id,limit:2000,dpLimit:3,detachmentIds:[detachment.id],disposition:'Take and Hold',entries:[body,character]});
  const read=(await api('builderArmies')).armies.find(a=>a.id===saved.army.id);
  assert.equal(read.entries[1].attachedTo,'squad_one');assert.equal(read.entries[0].weaponCounts['1'],body.models);
  console.log('HTTP import/save/read passed. Preview: '+base+'/#builder');
  console.log('Local disposable login: preview / BuilderPreview!2026');
})().catch(e=>{console.error(e);server.kill();process.exitCode=1;});
process.on('SIGINT',()=>server.kill());
