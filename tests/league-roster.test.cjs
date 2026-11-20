'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('Roster reserves the maximum declared paid option per copy and charges normal match costs',()=>{
  const result=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'league-roster-model.php')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const fixture=JSON.parse(result.stdout);
  assert.equal(fixture.roster.points,115);
});
test('The supplied historical catalog reserves 15 points for both Defiler paid weapons', {skip:!process.env.BUILDER_CATALOG_PATH},()=>{
  const result=spawnSync(process.env.PHP_BINARY||'php',['-d','memory_limit=256M',path.join(__dirname,'league-roster-catalog.php'),process.env.BUILDER_CATALOG_PATH],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.ok(JSON.parse(result.stdout).every(row=>row.extra===15));
});
