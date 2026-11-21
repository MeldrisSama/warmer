'use strict';

// Offline is reserved for the installed app. No API responses, photos or sessions in Cache Storage.
const sectorOffline=(()=>{
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const clone=value=>JSON.parse(JSON.stringify(value));
  let dbPromise,owner=null,connected=true,preparing=null,syncing=null,message='',shellReady=false,resync=false,installPrompt=null,shellMessage='',panelGeneration=0,registering=null,conflictCount=0;
  let transfer={running:false,label:'',done:0,total:0},shellTransfer={running:false,label:'',done:0,total:0};
  let progressTick=0;
  let operationIcon=null,connectionOnline=true,connectionNotice=null,connectionDismissed=false,completionUntil=0,completionTimer;
  let conflictOpening=false,conflictChoosing=false;
  const namespace=location.pathname.replace(/[^/]*$/,'');
  const key='sector-offline-account:'+namespace;
  const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
  const database=()=>dbPromise??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('sector-offline:'+namespace,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('accounts',{keyPath:'id'});request.result.createObjectStore('catalogs',{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  async function read(store,key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store);const r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function write(store,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function change(account,fn){const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('accounts','readwrite'),store=tx.objectStore('accounts'),r=store.get(account);let result;
    r.onsuccess=()=>{try{const data=r.result||{id:account,records:{},defaults:[]};result=fn(data);store.put(data);}catch(e){reject(e);tx.abort();}};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}
  function unavailable(){return !connected||navigator.onLine===false;}
  function active(){return installed()&&Boolean(owner);}
  function signal(progressOnly=false){window.dispatchEvent(new CustomEvent('sector-offline-change',{detail:{progressOnly}}));}
  function progress(label,done=0,total=0,bytes=null){
    transfer={running:true,label,done,total,bytes};
    const now=Date.now();if(!bytes||now-progressTick>120){progressTick=now;signal(true);}
  }
  function progressHtml(item,label){
    if(!item.running)return '';
    const bytes=item.bytes,total=bytes?.total||(!bytes?item.total:0),value=bytes?bytes.loaded:item.done;
    const detail=bytes?' · '+(bytes.loaded/1000000).toLocaleString('it-IT',{maximumFractionDigits:1})+' MB'+(bytes.total?' / '+(bytes.total/1000000).toLocaleString('it-IT',{maximumFractionDigits:1})+' MB':''):item.total?' · '+item.done+' / '+item.total:'';
    const percent=bytes&&total?' · '+Math.floor(Math.min(value,total)/total*100)+'%':'';
    return '<div class="offline-progress">'+esc(item.label||label)+esc(detail+percent)+'</div>';
  }
  function connectionChanged(online){
    if(connectionOnline===online)return;
    connectionOnline=online;connectionNotice=online?'online':'offline';connectionDismissed=false;
  }
  function refreshConnectionNotice(){
    let notice=document.querySelector('#offline-connection-notice');
    if(!active()||!connectionNotice||connectionDismissed){if(notice)notice.hidden=true;return;}
    if(!notice){
      notice=document.createElement('aside');notice.id='offline-connection-notice';notice.className='offline-connection-notice';
      notice.innerHTML='<p role="status"></p><button type="button" aria-label="Chiudi notifica di connessione">×</button>';
      notice.querySelector('button').onclick=()=>{connectionDismissed=true;notice.hidden=true;};
      document.querySelector('#nav').after(notice);
    }
    notice.hidden=false;notice.dataset.connection=connectionNotice;
    const label=connectionNotice==='online'?'Sei di nuovo online. La sincronizzazione riprende automaticamente.':navigator.onLine===false?'Sei offline. Le modifiche vengono salvate sul dispositivo.':'Server non raggiungibile. Le modifiche vengono salvate sul dispositivo.';
    const text=notice.querySelector('p');if(text.textContent!==label)text.textContent=label;
  }
  function refreshActivity(){
    refreshConnectionNotice();
    let box=document.querySelector('#offline-activity');
    if(!active()){if(box)box.hidden=true;return;}
    if(!box){box=document.createElement('aside');box.id='offline-activity';box.className='offline-activity';box.setAttribute('aria-label','Stato sincronizzazione');document.querySelector('#nav').after(box);}
    const busy=transfer.running||shellTransfer.running;
    box.hidden=(!busy&&unavailable())||(!busy&&!message&&!shellMessage&&Date.now()>completionUntil);
    const label=transfer.running?'Sincronizzazione in corso':message||shellMessage||(unavailable()?'Senza connessione · modifiche conservate sul dispositivo':(conflictCount?'Scegli il salvataggio per '+conflictCount+' liste in conflitto':shellReady?'App pronta offline · '+(transfer.label||'Controllo dati in attesa'):'Preparazione offline in corso'));
    box.setAttribute('aria-busy',String(busy));
    if(!box.querySelector('[data-offline-progress]'))box.innerHTML='<div data-offline-loading aria-hidden="true"></div><div class="offline-activity-copy"><p role="status"></p><div data-offline-progress></div></div>';
    const symbol=box.querySelector('[data-offline-loading]');symbol.hidden=!busy;
    const iconId=operationIcon||window.SectorSyncIcons?.ids[0]||'fallback';
    if(busy&&symbol.dataset.icon!==iconId){symbol.dataset.icon=iconId;symbol.innerHTML=window.SectorSyncIcons?window.SectorSyncIcons.render(iconId):'<span class="offline-loading-mark">↻</span>';}
    const status=box.querySelector('p');if(status.textContent!==label)status.textContent=label;
    const progressBox=box.querySelector('[data-offline-progress]'),html=progressHtml(transfer,'Sincronizzazione')+progressHtml(shellTransfer,'Preparazione app');
    if(progressBox.innerHTML!==html)progressBox.innerHTML=html;
    const existing=box.querySelector('[data-offline-login]');
    if(message.includes('Accedi')&&!existing){const login=document.createElement('button');login.type='button';login.dataset.offlineLogin='';login.textContent='Accedi di nuovo';login.onclick=()=>refresh().catch(e=>notify(e.message,true));box.append(login);}
    else if(!message.includes('Accedi')&&existing)existing.remove();
  }
  async function refreshConflicts(){
    const account=owner;if(!active()){const old=document.querySelector('#offline-conflicts-banner');if(old)old.hidden=true;document.querySelector('#offline-conflict-dialog')?.close();return;}
    const data=await read('accounts',account);if(owner!==account||!data)return;
    conflictCount=Object.values(data.records).filter(r=>r.conflict).length;
    let banner=document.querySelector('#offline-conflicts-banner');
    if(!banner){banner=document.createElement('aside');banner.id='offline-conflicts-banner';banner.className='email-banner';document.querySelector('#nav').after(banner);}
    banner.hidden=!conflictCount;banner.innerHTML=conflictCount?'<span>'+(conflictCount===1?'C’è una lista con salvataggi in conflitto.':'Ci sono '+conflictCount+' liste con salvataggi in conflitto.')+'</span><a href="#builder">Scegli il salvataggio da tenere</a>':'';
    refreshActivity();
    await showConflictDialog(data,account);
  }
  async function describeConflictArmy(army,deleted,account){
    if(deleted||!army)return 'Lista eliminata';
    const cat=await catalog(account,army.catalogId),units=new Map((cat?.units||[]).map(u=>[u.id,u])),faction=cat?.factions.find(f=>f.id===army.factionId);
    return [army.name,(faction?.name||army.factionId)+' · '+army.limit+' pt',
      'Distaccamenti: '+(army.detachmentIds||[army.detachmentId]).map(id=>faction?.detachments.find(d=>d.id===id)?.name||id).join(', '),
      ...army.entries.map(e=>{const u=units.get(e.unitId);return [e.models+' × '+(u?.name||e.unitId)+(e.warlord?' · Warlord':''),
        ...Object.entries(e.weaponCounts||{}).filter(([,n])=>n>0).map(([line,n])=>'  '+n+' × '+(u?.weapons.find(w=>String(w.line)===line)?.name||line)),
        ...(e.enhancementIds||[]).map(id=>'  '+(u?.enhancements.find(x=>x.id===id)?.name||id)),e.notes||''].filter(Boolean).join('\n');})].join('\n');
  }
  async function showConflictDialog(data,account){
    let dialog=document.querySelector('#offline-conflict-dialog');
    const pair=Object.entries(data.records).find(([,r])=>r.conflict);
    if(dialog&&(dialog.dataset.account!==account||(!pair&&!conflictChoosing))){dialog.close();dialog=null;}
    if(!pair||conflictChoosing)return;
    if(dialog){
      const current=data.records[dialog.dataset.army],signature=current?.conflict?current.generation+':'+current.conflict.revision:null;
      if(dialog.dataset.signature!==signature){dialog.close();dialog=null;}
      else{
        dialog.querySelectorAll('[data-conflict-pick]').forEach(button=>button.disabled=unavailable());
        dialog.querySelector('[data-conflict-offline-close]').hidden=!unavailable();
        return;
      }
    }
    if(unavailable()||conflictOpening)return;
    conflictOpening=true;
    try{
      const [armyId,record]=pair,signature=record.generation+':'+record.conflict.revision;
      const [localText,remoteText]=await Promise.all([describeConflictArmy(record.army,record.deleted,account),describeConflictArmy(record.conflict.remote,!record.conflict.remote,account)]);
      if(owner!==account||document.querySelector('#offline-conflict-dialog'))return;
      dialog=document.createElement('dialog');dialog.id='offline-conflict-dialog';dialog.className='workbench wb-detachment-dialog offline-conflict-dialog';
      dialog.dataset.account=account;dialog.dataset.army=armyId;dialog.dataset.signature=signature;dialog.setAttribute('aria-labelledby','offline-conflict-title');
      const column=(label,text,date,choice,deleted)=>`<section class="offline-conflict-version"><h3>${label}</h3><p class="wb-muted">${esc(date?builderDate(date):'Eliminata')}</p><pre>${esc(text)}</pre><button type="button" data-conflict-pick="${choice}">Tieni ${deleted?'l’eliminazione':'il salvataggio'} ${choice==='local'?'del dispositivo':'online'}</button></section>`;
      dialog.innerHTML='<div class="wb-dialog-head"><h2 id="offline-conflict-title" tabindex="-1">Risolvi il conflitto</h2></div><p>La lista è cambiata sul dispositivo e online. Confronta i salvataggi e scegli quale mantenere per continuare.</p><div class="offline-conflict-versions">'+column('Sul dispositivo',localText,record.army.updated,'local',record.deleted)+column('Online',remoteText,record.conflict.remote?.updated,'online',!record.conflict.remote)+'</div><p data-conflict-result role="status"></p><button type="button" data-conflict-offline-close hidden>Torna alle liste offline</button>';
      dialog.addEventListener('cancel',event=>{if(!unavailable())event.preventDefault();});
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});
      dialog.querySelector('[data-conflict-offline-close]').onclick=()=>{if(unavailable())dialog.close();};
      dialog.querySelectorAll('[data-conflict-pick]').forEach(button=>button.onclick=async()=>{
        const sameEditor=typeof builderUi!=='undefined'&&builderUi.owner===account&&builderUi.army?.id===armyId;
        if(sameEditor&&builderUi.pending){notify('Attendi il completamento del salvataggio.',true);return;}
        const unsaved=sameEditor&&builderHasUnsaved();
        const warning=unsaved?(button.dataset.conflictPick==='local'?'Saranno incluse anche le modifiche non salvate nell’editor. ':'Le modifiche non salvate nell’editor verranno abbandonate. '):'';
        if(!confirm(warning+'Confermi? Il salvataggio scelto sostituirà l’altro.'))return;
        conflictChoosing=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);dialog.querySelector('[data-conflict-result]').textContent='Applicazione del salvataggio scelto…';
        try{
          if(unsaved&&button.dataset.conflictPick==='local'){
            const saved=await request(networkApi,'builderSave',clone(builderUi.army));builderUi.army=saved.army;workbench.dirty=false;
          }
          await resolve(armyId,button.dataset.conflictPick,networkApi);
          if(sameEditor&&owner===account){
            const current=(await read('accounts',account)).records[armyId];
            if(current&&!current.deleted&&!current.conflict){builderUi.army=clone(current.army);builderUi.catalog=await catalog(account,current.army.catalogId);builderUi.baseline=JSON.stringify(current.army);workbench.dirty=false;builderRender();}
            else if(!current||current.deleted){workbench.dirty=false;builderUi.army=null;builderUi.view='archive';builderRender();}
          }
          dialog.close();
        }catch(error){dialog.querySelector('[data-conflict-result]').textContent=error.message;}
        finally{conflictChoosing=false;dialog.querySelectorAll('[data-conflict-pick]').forEach(b=>b.disabled=unavailable());void refreshConflicts();}
      });
      document.body.appendChild(dialog);dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});
    }finally{conflictOpening=false;}
  }
  function sameContent(first,second){
    const clean=army=>{const copy=clone(army);for(const key of ['catalogId','revision','updated','created','factionName','catalogWarning','_syncOperation'])delete copy[key];if(copy.schemaVersion===2)delete copy.detachmentId;return copy;};
    const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
    return JSON.stringify(sorted(clean(first)))===JSON.stringify(sorted(clean(second)));
  }
  function networkError(e){return e instanceof TypeError||e.name==='NetworkError'||e.name==='TimeoutError'||e.name==='AbortError'||e.status>=500;}
  async function register(){
    if(!('serviceWorker' in navigator))throw Error('Questo browser non supporta l’avvio offline.');
    shellTransfer={running:true,label:'Preparazione dell’app offline',done:0,total:0};signal();
    shellReady=Boolean((await navigator.serviceWorker.getRegistration('./'))?.active);
    const registration=await navigator.serviceWorker.register('service-worker.php',{scope:'./',updateViaCache:'none'});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Download dell’app incompleto. Riprova con una connessione.')),30000);
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Download dell’app non riuscito. Riprova con una connessione.'));}});
      navigator.serviceWorker.ready.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
    if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>{});
    const worker=registration.active;
    shellReady=Boolean(worker);shellTransfer={running:false,label:'App salvata sul dispositivo',done:1,total:1};shellMessage='';signal();
  }
  async function session(network){
    try{
      const result=await network('state');connected=true;connectionChanged(true);
      if(!result.user){owner=null;localStorage.removeItem(key);signal();return result;}
      if(!installed())return result;
      owner=result.user.id;localStorage.setItem(key,owner);
      await change(owner,data=>{data.user={id:result.user.id,name:result.user.name,admin:false};});
      return result;
    }catch(e){
      if(!networkError(e))throw e;
      connected=false;
      if(!installed())throw Error('Per usare le liste offline apri la PWA dall’icona sul dispositivo.');
      const account=localStorage.getItem(key),data=account?await read('accounts',account):null;
      if(!data?.ready)throw Error('Completa il primo accesso e il download delle liste con una connessione.');
      owner=account;
      connectionChanged(false);
      return {user:data.user,users:[data.user],csrf:'',mailEnabled:false,needsEmail:false,offline:true};
    }
  }
  async function catalog(account,catalogId){return (await read('catalogs',account+':'+catalogId))?.catalog;}
  async function rememberCatalog(account,value,revision=null){if(value)await write('catalogs',{key:account+':'+value.catalogId,catalog:value,revision});}
  async function download(network,account){
    progress('Controllo delle liste e dei conflitti');
    const armies=await network('builderArmies');
    await change(account,data=>{
      const remote=new Map(armies.armies.map(a=>[a.id,a]));
      for(const [armyId,r] of Object.entries(data.records)){
        if(!r.dirty)continue;
        const online=remote.get(armyId)||null,revision=online?.revision??null;
        const alreadySaved=online&&(online._syncOperation===r.generation||(!r.deleted&&sameContent(r.army,online)));
        if(r.baseRevision!==revision&&!alreadySaved&&!(r.deleted&&!online))r.conflict={remote:online,revision};
        else delete r.conflict;
      }
    });
    await refreshConflicts();signal();
    progress('Controllo degli aggiornamenti del catalogo');
    const metadata=await network('builderCatalog&edition=11&metadata=1');
    const cached=metadata.catalog?await read('catalogs',account+':'+metadata.catalog.catalogId):null;
    let cats;
    if(cached&&metadata.catalog.revision&&cached.revision===metadata.catalog.revision){
      cats={catalog:cached.catalog};progress('Catalogo già aggiornato',1,1);
    }else{
      progress('Scaricamento del catalogo attivo');
      cats=await network('builderCatalog&edition=11',undefined,bytes=>progress('Scaricamento del catalogo attivo',0,0,bytes));
      await rememberCatalog(account,cats.catalog,metadata.catalog?.revision);
    }
    const defaults=await network('builderDefaults');
    const known=new Map(armies.armies.map(a=>[a.catalogId,a.edition]));
    const saved=await read('accounts',account);
    for(const r of Object.values(saved.records))if(r.army)known.set(r.army.catalogId,r.army.edition);
    let downloaded=0;
    for(const [catalogId,edition] of known){
      if(catalogId===cats.catalog?.catalogId||await catalog(account,catalogId)){downloaded++;continue;}
      progress('Download dei cataloghi delle liste',downloaded,known.size);
      const result=await network('builderCatalog&edition='+edition+'&catalogId='+encodeURIComponent(catalogId),undefined,bytes=>progress('Download dei cataloghi delle liste',downloaded,known.size,bytes));
      if(!result.catalog)throw Error('Catalogo di una lista non disponibile.');
      await rememberCatalog(account,result.catalog);downloaded++;progress('Cataloghi salvati sul dispositivo',downloaded,known.size);
    }
    await change(account,data=>{
      const incoming=new Map(armies.armies.map(a=>[a.id,a]));
      for(const [id,r] of Object.entries(data.records))if(!r.dirty&&!incoming.has(id))delete data.records[id];
      for(const army of armies.armies){const old=data.records[army.id];if(!old?.dirty)data.records[army.id]={army,baseRevision:army.revision,dirty:false,generation:id(),warning:army.catalogWarning};}
      data.active=cats.catalog?.catalogId;data.defaults=defaults.defaults;data.ready=true;
    });
  }
  async function performSync(network,account){
    // Always verify the authenticated account, including after an offline session expires.
    progress('Verifica dell’accesso');
    const session=await network('state');
    if(session.user?.id!==account)throw Error('Accedi con l’account di queste liste per sincronizzarle.');
    if(typeof state!=='undefined'&&owner===account)state=session;
    connected=true;connectionChanged(true);
    await download(network,account);
    let data=await read('accounts',account);
    const pending=Object.entries(data.records).filter(([,r])=>!r.conflict&&(r.dirty||(r.army.schemaVersion===2&&r.army.catalogId!==data.active)));
    let completed=0;
    for(const [armyId,record] of pending){
      if(owner!==account)return;
      if(record.conflict)continue;
      if(!record.dirty&&(record.army.catalogId===data.active||record.army.schemaVersion!==2))continue;
      progress('Sincronizzazione delle liste',completed,pending.length);
      const result=await network('builderSync',{id:armyId,baseRevision:record.baseRevision,deleted:Boolean(record.deleted),army:record.army,operationId:record.generation});
      if(result.army&&!await catalog(account,result.army.catalogId)){
        const cat=await network('builderCatalog&edition='+result.army.edition+'&catalogId='+encodeURIComponent(result.army.catalogId));
        if(!cat.catalog)throw Error('Catalogo sincronizzato non disponibile.');await rememberCatalog(account,cat.catalog);
      }
      await change(account,current=>{
        const latest=current.records[armyId];if(!latest)return;
        if(result.conflict){latest.conflict={remote:result.remote,revision:result.revision};return;}
        if(result.deleted){if(latest.generation===record.generation)delete current.records[armyId];else{latest.baseRevision=null;latest.dirty=true;}return;}
        if(latest.generation===record.generation){current.records[armyId]={army:result.army,baseRevision:result.army.revision,dirty:false,generation:id(),warning:result.catalogWarning};}
        else{latest.baseRevision=result.army.revision;latest.dirty=true;}
      });
      completed++;progress('Sincronizzazione delle liste',completed,pending.length);await refreshConflicts();
      // An acknowledgement of our own save advances the editor base even if the user
      // has typed more changes while that save was in flight.
      if(result.army&&owner===account&&typeof builderUi!=='undefined'&&builderUi.army?.id===armyId)builderUi.army.revision=result.army.revision;
    }
    data=await read('accounts',account);
    const timestamp=new Date().toISOString();
    await change(account,current=>{current.lastCheck=timestamp;if(!Object.values(current.records).some(r=>r.dirty||r.conflict))current.lastSync=timestamp;});
    await refreshConflicts();
    message='';transfer={running:false,label:conflictCount?'Sincronizzazione sospesa: scegli il salvataggio da tenere':'Sincronizzazione completata',done:completed,total:pending.length};
    completionUntil=Date.now()+5000;clearTimeout(completionTimer);completionTimer=setTimeout(refreshActivity,5001);
  }
  function sync(network,{queueIfBusy=true}={}){
    if(!active())return Promise.resolve();
    if(navigator.onLine===false){connectionChanged(false);transfer={running:false,label:'Sincronizzazione in attesa della connessione',done:0,total:0};signal();return Promise.resolve();}
    if(syncing){if(queueIfBusy)resync=true;return syncing;}
    operationIcon=window.SectorSyncIcons?.choose()||null;
    message='';progress('Avvio della sincronizzazione');
    const account=owner;
    const scopedNetwork=(action,input,onProgress)=>network(action+(action.startsWith('builder')?'&offlineOwner='+encodeURIComponent(account):''),input?{...input,offlineOwner:account}:undefined,onProgress);
    const run=()=>performSync(scopedNetwork,account);
    syncing=(navigator.locks?navigator.locks.request('sector-sync-'+namespace+':'+account,run):run()).catch(e=>{
      if(networkError(e)){connected=false;connectionChanged(false);}
      transfer={running:false,label:'Sincronizzazione non completata',done:0,total:0};
      message=networkError(e)?'Sincronizzazione non completata: connessione al server non disponibile. Le modifiche restano sul dispositivo.':'Sincronizzazione non completata: '+e.message;
    }).finally(()=>{syncing=null;signal();if(resync){resync=false;return sync(network);}});
    signal();return syncing;
  }
  function start(network){
    if(!active())return;
    // The list check must not wait for downloading/installing the offline interface.
    if(!registering)registering=register().catch(e=>{shellMessage=e.message;shellTransfer={running:false,label:e.message,done:0,total:0};}).finally(()=>{registering=null;signal();});
    if(!preparing)preparing=sync(network,{queueIfBusy:false}).finally(()=>{preparing=null;signal();});
  }
  async function request(network,action,input){
    const kind=action.split('&')[0];
    if(kind==='state')return session(network);
    if(kind==='logout'){
      if(active()&&unavailable())throw Error('Serve una connessione per uscire dall’account.');
      const result=await network(action,input);owner=null;localStorage.removeItem(key);signal();return result;
    }
    if(!active()){
      if(unavailable())throw Error('Serve una connessione. L’offline è disponibile nella PWA.');
      return network(action,input);
    }
    if(!kind.startsWith('builder')){
      if(unavailable())throw Error('Questa funzione richiede una connessione.');
      return network(action,input);
    }
    if(preparing&&!(await read('accounts',owner))?.ready)await preparing;
    const account=owner,data=await read('accounts',account);
    if(!data?.ready)throw Error(message||'Preparazione offline incompleta. Riprova con una connessione.');
    if(kind==='builderCatalog'){
      const params=new URLSearchParams(action.slice(action.indexOf('&')+1));
      const value=await catalog(account,params.get('catalogId')||data.active);
      return {catalog:value||null};
    }
    if(kind==='builderArmies')return {armies:Object.values(data.records).filter(r=>!r.deleted).map(r=>({...r.army,catalogWarning:r.warning}))};
    if(kind==='builderDefaults')return {defaults:data.defaults||[]};
    if(kind==='builderSave'){
      const army=clone(input);army.id??=id();army.updated=new Date().toISOString();
      await change(account,current=>{
        if(!current.records[army.id]&&Object.values(current.records).filter(r=>!r.deleted).length>=100)throw Error('Hai raggiunto il limite di 100 armate.');
        const previous=current.records[army.id];army.created??=previous?.army.created||army.updated;
        current.records[army.id]={...previous,army,baseRevision:previous?.dirty?previous.baseRevision:(army.revision??previous?.baseRevision??null),dirty:true,deleted:false,generation:id()};
      });
      signal();void sync(network);
      return {ok:true,army,validation:{valid:true,errors:[]},local:true};
    }
    if(kind==='builderDelete'){
      await change(account,current=>{const r=current.records[input.id];if(!r)throw Error('Armata non trovata.');if(!r.baseRevision&&!r.conflict)delete current.records[input.id];else{r.deleted=true;r.dirty=true;r.generation=id();}});
      signal();void sync(network);return {ok:true};
    }
    // Imports and personal defaults retain their authenticated online behavior.
    if(unavailable())throw Error('Questa operazione richiede una connessione.');
    const result=await network(action,input);await sync(network);return result;
  }
  async function resolve(armyId,choice,network){
    if(unavailable())throw Error('Accedi con una connessione per risolvere il conflitto.');
    const account=owner;
    await change(account,data=>{
      const r=data.records[armyId];if(!r?.conflict)return;
      if(choice==='online'){
        if(r.conflict.remote)data.records[armyId]={army:r.conflict.remote,baseRevision:r.conflict.revision,dirty:false,generation:id()};
        else delete data.records[armyId];
      }else{r.baseRevision=r.conflict.revision;r.dirty=true;delete r.conflict;r.generation=id();}
    });
    await sync(network);signal();
  }
  async function panel(){
    if(!installed())return '<section class="wb-library offline-panel"><h2>Le tue liste anche senza rete</h2><p>Installa l’app e aprila dall’icona per creare, modificare e consultare le liste offline.</p>'+(installPrompt?'<button type="button" id="offline-install">Installa l’app</button>':'<p class="wb-muted">Su iPhone: menu Condividi di Safari → Aggiungi alla schermata Home. Su Android: menu del browser → Installa app o Aggiungi a schermata Home.</p>')+'</section>';
    return '';
  }
  async function refreshPanel(){
    const generation=++panelGeneration,target=document.querySelector('#offline-panel');if(!target)return;
    const html=await panel();if(generation!==panelGeneration||!target.isConnected)return;
    target.innerHTML=html;
    target.querySelector('#offline-install')?.addEventListener('click',async()=>{await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;void refreshPanel();});

  }
  window.addEventListener('sector-offline-change',event=>{
    refreshActivity();if(event.detail?.progressOnly)return;
    void refreshConflicts().catch(e=>{message=e.message;});void refreshPanel();
    if(!active()||typeof builderUi==='undefined'||syncing||preparing)return;
    if(typeof state!=='undefined'&&state?.user&&page()!=='builder'&&!state.offline&&!unavailable())render();
    const account=owner;
    void (async()=>{
      const data=await read('accounts',account);if(!data||owner!==account)return;
      if(builderUi.owner!==account)return;
      const activeCatalog=await catalog(account,data.active);if(owner!==account||builderUi.owner!==account)return;
      const rows=Object.values(data.records).filter(r=>!r.deleted).map(r=>({...r.army,catalogWarning:r.warning}));
      const changed=builderUi.active?.catalogId!==activeCatalog?.catalogId||JSON.stringify(builderUi.armies)!==JSON.stringify(rows);
      builderUi.active=activeCatalog;builderUi.armies=rows;
      if(page()!=='builder'||builderUi.pending)return;
      if(builderUi.view==='archive'){if(changed)builderArchiveRender();return;}
      const record=data.records[builderUi.army?.id];
      if(record&&!record.deleted&&!record.conflict&&!builderHasUnsaved()){
        const next=await catalog(account,record.army.catalogId);if(!next||owner!==account||builderUi.owner!==account||builderHasUnsaved()||builderUi.pending)return;
        builderUi.army=clone(record.army);builderUi.catalog=next;builderUi.baseline=JSON.stringify(record.army);builderRender();
      }
    })().catch(e=>{message=e.message;});
  });
  window.addEventListener('offline',()=>{connected=false;connectionChanged(false);signal();if(typeof state!=='undefined'&&state?.user){if(page()!=='builder'||!active())render();else if(builderUi.army)builderRender();}});
  window.addEventListener('online',()=>{connected=true;connectionChanged(true);if(active())void sync(networkApi,{queueIfBusy:false});signal();});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;void refreshPanel();});
  window.addEventListener('focus',()=>{if(active())void sync(networkApi,{queueIfBusy:false});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active())void sync(networkApi,{queueIfBusy:false});});
  window.addEventListener('pageshow',()=>{if(active())void sync(networkApi,{queueIfBusy:false});});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{
    const p=event.data;if(!active()||p?.type!=='sector-shell-progress'||p.scope!==new URL('./',location.href).href)return;
    shellTransfer={running:p.completed<p.total,label:shellReady?'Aggiornamento dell’app':'Download dell’app offline',done:p.completed,total:p.total};signal(true);
  });
  return {installed,active,unavailable,session,request,start,sync,refreshPanel,settled:signal,enter:()=>sync(networkApi,{queueIfBusy:false})};
})();
