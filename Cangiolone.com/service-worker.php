<?php
declare(strict_types=1);
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
$files=['index.php','app.js','sync-icons.js','sync-icons.css','offline.js','standings.js','builder.js','builder-engine.js','builder-workbench.js','theme.js','style.css','builder.css','theme.css','manifest.webmanifest','assets/pwa/icon-192.png','assets/pwa/icon-512.png','assets/pwa/logo-192.png'];
foreach (glob(__DIR__.'/assets/factions/*.svg') as $file) $files[]='assets/factions/'.basename($file);
$namespace=substr(hash('sha256',rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME'])),'/').'/'),0,16);
$hash=hash_init('sha256');$urls=[];
foreach ($files as $file) {
    $digest=hash_file('sha256',__DIR__.'/'.$file);hash_update($hash,$file.$digest);
    $urls[]=$file.(preg_match('/\.(js|css)$/',$file)?'?v='.$digest:'');
}
?>
'use strict';
const cachePrefix='sector-shell-<?= $namespace ?>-';
const cacheName=cachePrefix+'<?= substr(hash_final($hash),0,20) ?>';
const files=<?= json_encode($urls,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR) ?>;
const base=new URL('./',self.location.href);
async function reportProgress(completed){
  const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});
  for(const client of clients)if(client.url.startsWith(base.href))client.postMessage({type:'sector-shell-progress',scope:base.href,completed,total:files.length});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  // An incomplete update must not replace a working offline shell.
  let next=0,completed=0;await reportProgress(0);
  await Promise.all(Array.from({length:4},async()=>{
    while(next<files.length){const file=files[next++];await cache.add(new Request(new URL(file,base),{cache:'reload'}));await reportProgress(++completed);}
  }));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(cachePrefix)&&name!==cacheName)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  const path=url.pathname.slice(base.pathname.length);
  if(event.request.mode==='navigate'){
    if(!['','index.php'].includes(path))return;
    event.respondWith(fetch(event.request).catch(async()=>{
      const cache=await caches.open(cacheName);return (await cache.match(new URL('index.php',base)))||Response.error();
    }));return;
  }
  // Exact allowlist, including content hashes. API, photos, league pages and external assets never enter this cache.
  const relative=path+url.search;
  if(!files.includes(relative))return;
  event.respondWith((async()=>{const cache=await caches.open(cacheName);return (await cache.match(event.request))||fetch(event.request);})());
});
