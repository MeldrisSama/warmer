'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('Offline synchronization preserves edits, requires conflict resolution and updates catalog points independently',()=>{
  const r=spawnSync(process.env.PHP_BINARY||'php',[path.join(__dirname,'offline-sync.php')],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});
