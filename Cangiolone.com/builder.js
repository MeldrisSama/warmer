'use strict';

// Catalog metadata and army drafts stay separate from the old .txt list archive.
const builderUi={edition:'11',active:null,catalog:null,armies:[],army:null,search:'',pending:false,view:'archive',sort:'updated',baseline:null,defaults:[]};
const builderClone=value=>JSON.parse(JSON.stringify(value));
const builderPlayableFactions=()=> (builderUi.catalog?.factions||[]).filter(f=>!/^Unbound Adversaries$/i.test(f.name.trim()));
function builderHasUnsaved(){
  return Boolean(builderUi.army && (builderUi.catalog?.schemaVersion===2 ? workbench.dirty : builderUi.baseline!==JSON.stringify(builderUi.army)));
}
function builderDiscard(){
  if(builderUi.pending){notify('Attendi il completamento dell’operazione in corso.');return false;}
  return !builderHasUnsaved()||confirm('Abbandonare le modifiche non salvate?');
}
function builderArchive(){
  if(!builderDiscard())return;
  builderUi.view='archive';builderUi.army=null;builderUi.catalog=builderUi.active;builderUi.baseline=null;
  Object.assign(workbench,{dirty:false,selected:null,preview:null,search:'',catalogFaction:null});
  builderRender();
}
function builderFactionGroup(faction){
  if(/^(sm(?:_|$)|gk$)/.test(faction.id))return 'Adeptus Astartes';
  if(['gc','nec','ae','ork','tau','lov','tyr','dru'].includes(faction.id))return 'Xenos';
  if(['ts','dg','ec','we','qt','cd','csm'].includes(faction.id))return 'Chaos';
  if(['aoi','am','tl','adm','qi','ac','as'].includes(faction.id))return 'Imperium';
  return 'Altri eserciti';
}
function builderCreate(){
  if(!builderDiscard())return;
  builderUi.catalog=builderUi.active;builderUi.army=null;builderUi.baseline=null;builderUi.creationFaction='';workbench.dirty=false;builderUi.view='create';builderRender();
}
const builderIconIds=new Set('aoi am gc nec ae tl ork gk tau lov adm ts dg ec we qt cd qi sm tyr ac as csm dru sm_black_templars sm_blood_angels sm_dark_angels sm_deathwatch sm_imperial_fists sm_iron_hands sm_raven_guard sm_salamanders sm_space_wolves sm_ultramarines sm_white_scars'.split(' '));
function builderFactionIcon(id){return builderIconIds.has(id)?`<img class="builder-faction-icon" src="assets/factions/${id}.svg" alt="" width="32" height="32" loading="lazy" decoding="async">`:'';}
function builderOpenFactionGroup(group,trigger){
  const rows=builderPlayableFactions().filter(f=>builderFactionGroup(f)===group).sort((a,b)=>a.name.localeCompare(b.name,'it'));
  const dialog=wbModal(group,`<div class="builder-faction-picker">${rows.map(f=>`<button type="button" data-create-faction="${esc(f.id)}">${builderFactionIcon(f.id)}<span>${esc(f.name)}</span></button>`).join('')}</div>`,trigger);
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-create-faction]');if(!button)return;const faction=rows.find(f=>f.id===button.dataset.createFaction);if(!faction)return;builderUi.creationFaction=faction.id;main.querySelector('[name=faction]').value=faction.id;main.querySelector('#builder-chosen-faction').innerHTML=builderFactionIcon(faction.id)+`<strong>${esc(faction.name)}</strong>`;dialog.close();});
}
function builderCreationRender(){
  const factions=builderPlayableFactions(),groups=['Xenos','Chaos','Imperium','Adeptus Astartes','Altri eserciti'];
  main.innerHTML=`<section class="workbench builder-archive"><div class="wb-heading"><div><p class="wb-muted">Warhammer 40.000 · 11ª edizione</p><h1>Crea nuova lista</h1></div><button id="builder-create-back" type="button">Torna alle armate</button></div>
    <form id="builder-create" class="wb-library builder-creation">
      <fieldset><legend>Scegli il tuo esercito</legend><input type="hidden" name="faction" value="${esc(builderUi.creationFaction||'')}"><div class="builder-faction-groups">${groups.map(group=>{const rows=factions.filter(f=>builderFactionGroup(f)===group);return rows.length?`<button type="button" data-create-group="${esc(group)}" aria-haspopup="dialog">${esc(group)} <small>${rows.length} eserciti</small></button>`:'';}).join('')}</div><p id="builder-chosen-faction" class="builder-chosen-faction" aria-live="polite">${builderUi.creationFaction?builderFactionIcon(builderUi.creationFaction)+esc(factions.find(f=>f.id===builderUi.creationFaction)?.name||''):'Nessun esercito selezionato'}</p></fieldset>
      <fieldset><legend>Formato della partita</legend><div class="builder-battle-sizes">${[[1000,'Incursion'],[2000,'Strike Force'],[3000,'Onslaught']].map(([points,name])=>`<label class="builder-battle-size"><input type="radio" name="battleSize" value="${points}" ${points===2000?'checked':''}><span><strong>${name}</strong><small>${points} punti</small></span></label>`).join('')}</div>
      <div id="builder-custom-dp" hidden><p class="wb-muted">Onslaught: formato da 3000 punti del gruppo. Concordate i DP prima della partita.</p><label>Detachment Points (DP)<input id="builder-create-dp" type="text" inputmode="numeric" pattern="[0-9]+" value="3"></label></div></fieldset>
      <button class="primary" type="submit">Apri il builder</button>
    </form></section>`;
  builderCreationBind();
}
function builderCreationBind(){
  const form=main.querySelector('#builder-create');
  main.querySelector('#builder-create-back').onclick=builderArchive;
  form.querySelectorAll('[data-create-group]').forEach(button=>button.onclick=()=>builderOpenFactionGroup(button.dataset.createGroup,button));
  form.addEventListener('change',()=>{main.querySelector('#builder-custom-dp').hidden=form.querySelector('[name=battleSize]:checked').value!=='3000';});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const faction=form.querySelector('[name=faction]'),size=Number(form.querySelector('[name=battleSize]:checked')?.value);
    if(!faction?.value){notify('Scegli un esercito.',true);form.querySelector('[data-create-group]')?.focus();return;}
    builderStart(faction.value,size,Number(main.querySelector('#builder-create-dp').value));
  });
}
function builderStart(factionId,limit=2000,dpLimit=3){
  if(!builderDiscard())return;
  if(![1000,2000,3000].includes(limit)||!Number.isInteger(dpLimit)||dpLimit<0||dpLimit>20){notify('Formato o DP non validi.',true);return;}
  builderUi.catalog=builderUi.active;
  if(builderUi.catalog?.schemaVersion!==2||!builderPlayableFactions().some(f=>f.id===factionId)){notify('Seleziona una fazione giocabile del catalogo 11ª.',true);return;}
  builderUi.army=builderNewArmy();Object.assign(builderUi.army,{factionId,limit,dpLimit:limit===1000?2:limit===2000?3:dpLimit});builderUi.view='editor';
  Object.assign(workbench,{dirty:true,revision:workbench.revision+1,selected:null,preview:null,mode:'build',pane:'roster',search:'',catalogFaction:null,activeEffects:{}});
  builderRender();
}
async function builderOpen(id){
  if(!builderDiscard())return;
  const army=builderUi.armies.find(a=>a.id===id),owner=state.user.id;if(!army)return;
  builderUi.pending=true;
  try{
    const r=await api('builderCatalog&edition='+army.edition+'&catalogId='+encodeURIComponent(army.catalogId));
    if(owner!==state.user?.id||page()!=='builder')return;
    if(!r.catalog)throw Error('Versione del catalogo non disponibile.');
    builderUi.catalog=r.catalog;builderUi.army=builderClone(army);builderUi.view='editor';builderUi.search='';
    if(r.catalog.schemaVersion===2)builderUi.army.dpLimit??=army.limit<=1000?2:3;
    builderUi.baseline=JSON.stringify(builderUi.army);
    Object.assign(workbench,{dirty:false,selected:null,preview:null,mode:'build',pane:'roster',search:'',catalogFaction:null,activeEffects:{}});
  }catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderRender();}
}
function builderDate(value){
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date.toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'}):'Non disponibile';
}
function builderSortedArmies(){
  const collator=new Intl.Collator('it',{sensitivity:'base',numeric:true});
  return [...builderUi.armies].sort((a,b)=>{
    let order=0;
    if(builderUi.sort==='faction')order=collator.compare(a.factionName||a.factionId,b.factionName||b.factionId);
    else {const timestamp=x=>Number.isFinite(Date.parse(x))?Date.parse(x):0;order=timestamp(b[builderUi.sort])-timestamp(a[builderUi.sort]);}
    return order||collator.compare(a.name,b.name)||collator.compare(a.id,b.id);
  });
}
function builderArchiveRender(){
  const factions=builderPlayableFactions(),canCreate=builderUi.active?.schemaVersion===2&&factions.length>0;
  const groups=new Map();for(const army of builderSortedArmies()){const key=army.edition+':'+(army.factionId||army.factionName);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(army);}
  main.innerHTML=`<section class="workbench builder-archive" aria-label="Archivio armate">
    <div class="wb-heading"><div><p class="wb-muted">Warhammer 40.000 · Le tue liste</p><h1>Army Builder</h1></div><span>${builderUi.armies.length} / 100 armate</span></div>
    <section class="wb-library"><h2>La prossima partita</h2>${canCreate?'<button id="builder-create-new" class="primary" type="button">Crea nuova lista</button>':'<p>Per creare un’armata importa un catalogo 11ª nel nuovo formato. Le liste salvate restano consultabili.</p>'}</section>
    <section class="wb-library"><div class="wb-heading"><h2>Armate salvate</h2><label>Ordina per<select id="builder-sort"><option value="updated" ${builderUi.sort==='updated'?'selected':''}>Ultima modifica · più recenti</option><option value="created" ${builderUi.sort==='created'?'selected':''}>Creazione · più recenti</option><option value="faction" ${builderUi.sort==='faction'?'selected':''}>Fazione · A–Z</option></select></label></div>
    <div class="builder-archive-list">${[...groups.values()].map(rows=>`<details class="builder-army-group" open><summary>${builderFactionIcon(rows[0].factionId)}<span>${esc(rows[0].factionName||rows[0].factionId)}</span><small>${rows.length} liste · ${esc(rows[0].edition)}ª</small></summary>${rows.map(a=>`<article class="builder-archive-row"><div><h3>${esc(a.name)}</h3><p>${esc(a.limit)} pt</p><dl><div><dt>Creazione</dt><dd>${esc(builderDate(a.created))}</dd></div><div><dt>Ultima modifica</dt><dd>${esc(builderDate(a.updated))}</dd></div></dl></div><div class="builder-actions"><button data-archive-open="${esc(a.id)}" aria-label="Apri ${esc(a.name)}">Apri</button><button data-archive-delete="${esc(a.id)}" aria-label="Elimina ${esc(a.name)}">Elimina</button></div></article>`).join('')}</details>`).join('')||'<div class="wb-empty"><h3>Nessuna armata salvata</h3><p>Crea la tua prima armata scegliendo una fazione.</p></div>'}</div></section>
    <details class="wb-library"><summary>Catalogo e backup</summary><p>Le liste conservano la propria versione del catalogo.</p><label>Ripristina backup JSON<input id="wb-restore" type="file" accept=".json,application/json"></label>${state.user.admin?'<label>Importa catalogo JSON<input id="wb-import-file" type="file" accept=".json,application/json"></label><button id="wb-import">Importa catalogo</button>':''}</details><p class="builder-icon-credit">Icone: <a href="https://github.com/Certseeds/wh40k-icon" target="_blank" rel="noopener noreferrer">wh40k-icon · autori e licenza</a>.</p>
  </section>`;
  builderArchiveBind();
}
function builderArchiveBind(){
  wbBind();
  const create=main.querySelector('#builder-create-new');if(create)create.onclick=builderCreate;
  main.querySelector('#builder-sort').onchange=e=>{builderUi.sort=e.target.value;builderArchiveRender();};
  main.querySelectorAll('[data-archive-open]').forEach(b=>b.onclick=()=>builderOpen(b.dataset.archiveOpen));
  main.querySelectorAll('[data-archive-delete]').forEach(b=>b.onclick=async()=>{
    if(!builderDiscard()||!confirm('Eliminare definitivamente questa armata?'))return;
    builderUi.pending=true;b.disabled=true;
    try{await api('builderDelete',{id:b.dataset.archiveDelete});builderUi.armies=(await api('builderArmies')).armies;notify('Armata eliminata.');}
    catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderRender();}
  });
}
async function builderLegacySave(){
  if(builderUi.pending)return;
  const snapshot=builderClone(builderUi.army);builderUi.pending=true;
  try{
    const result=await api('builderSave',snapshot);
    if(JSON.stringify(builderUi.army)===JSON.stringify(snapshot)){
      builderUi.army=result.army;builderUi.baseline=JSON.stringify(result.army);
    }else{
      builderUi.army.id=result.army.id;builderUi.army.created=result.army.created;
      builderUi.baseline=JSON.stringify(result.army);
    }
    builderUi.armies=(await api('builderArmies')).armies;
    notify(result.validation.valid?'Armata salvata.':'Bozza salvata: alcune verifiche non sono soddisfatte.');
  }catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderRender();}
}
async function builderImportFile(file){
  if(!file||file.size>28000000){notify('Seleziona un catalogo JSON entro 28 MB.',true);return;}
  if(!builderDiscard())return;
  builderUi.pending=true;
  try{
    await api('builderImport',{catalog:JSON.parse(await file.text())});
    builderUi.edition='11';workbench.dirty=false;
    await builderLoad();notify('Catalogo importato e versione attivata.');
  }catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderRender();}
}
async function builderRestoreFile(file){
  if(!file||file.size>2000000){notify('Seleziona un backup JSON entro 2 MB.',true);return;}
  if(!builderDiscard())return;
  builderUi.pending=true;
  try{
    const data=JSON.parse(await file.text());
    if(data.schemaVersion!==2||data.edition!=='11')throw Error('Backup 11ª non valido.');
    data.id=null;data.name=String(data.name||'Armata ripristinata').slice(0,100);
    const result=await api('builderSave',data);
    builderUi.armies=(await api('builderArmies')).armies;
    const r=await api('builderCatalog&edition=11&catalogId='+encodeURIComponent(result.army.catalogId));
    if(!r.catalog)throw Error('Versione del catalogo non disponibile. La copia resta nell’archivio.');
    builderUi.catalog=r.catalog;builderUi.army=result.army;builderUi.view='editor';
    Object.assign(workbench,{dirty:false,selected:null,preview:null,mode:'build',pane:'roster',search:'',catalogFaction:null,activeEffects:{}});
    notify('Backup ripristinato come nuova armata.');
  }catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderRender();}
}
const builderFaction=()=>builderUi.catalog?.factions.find(f=>f.id===builderUi.army?.factionId);
const builderUnit=id=>builderFaction()?.units.find(unit=>unit.id===id);
function builderTotals(){
  if(builderUi.catalog?.schemaVersion===2) return builderWorkbenchTotals();
  let total=0;
  for(const entry of builderUi.army?.entries||[]){
    const unit=builderUnit(entry.unitId);
    if(!unit) continue;
    const composition=unit.points.find(p=>p.models===entry.models);
    const gear=unit.equipment.filter(g=>entry.equipmentIds.includes(g.id)).reduce((sum,g)=>sum+g.points,0);
    total+=(composition?.points||0)*entry.quantity+gear*entry.quantity;
  }
  const issues=[];
  if(total>(builderUi.army?.limit||2000)) issues.push('Il limite di punti è stato superato.');
  for(const unit of builderFaction()?.units||[]){
    const n=(builderUi.army?.entries||[]).filter(e=>e.unitId===unit.id).reduce((sum,e)=>sum+e.quantity,0);
    if(n>unit.maxCopies) issues.push(`${unit.name}: ${n} copie, limite indicato ${unit.maxCopies}.`);
  }
  return {total,issues};
}
function builderNewArmy(){
  if(builderUi.catalog?.schemaVersion===2) return builderWorkbenchNewArmy();
  const faction=builderUi.catalog?.factions[0];
  return {id:null,name:'Nuova armata',edition:builderUi.edition,catalogId:builderUi.catalog?.catalogId||null,
    factionId:faction?.id||'',detachmentId:faction?.detachments[0]?.id||'',limit:2000,entries:[]};
}
async function builderLoad(){
  const edition=builderUi.edition;
  const owner=state.user?.id;
  const [catalog,armies,defaults]=await Promise.all([api('builderCatalog&edition='+edition),api('builderArmies'),api('builderDefaults')]);
  if(edition!==builderUi.edition||page()!=='builder'||owner!==state.user?.id) return;
  builderUi.owner=owner;
  builderUi.active=catalog.catalog;
  builderUi.catalog=catalog.catalog;
  builderUi.armies=armies.armies;
  builderUi.army=null;builderUi.view='archive';
  builderRender();
}
function builderPage(){
  if(builderUi.owner!==state.user?.id){builderUi.owner=null;builderUi.active=null;builderUi.catalog=null;builderUi.army=null;builderUi.armies=[];builderUi.defaults=[];builderUi.view='archive';if(typeof workbench!=='undefined')Object.assign(workbench,{dirty:false,selected:null,preview:null});}
  if(builderUi.owner===state.user?.id){builderRender();return;}
  main.innerHTML='<section class="panel"><h1>Army Builder</h1><p class="intro">Caricamento cataloghi…</p></section>';
  builderLoad().catch(err=>{if(page()==='builder')main.innerHTML=`<section class="panel"><h1>Army Builder</h1><p role="alert">${esc(err.message)}</p><button id="builder-retry" type="button">Riprova</button></section>`;
    const retry=document.querySelector('#builder-retry');if(retry)retry.onclick=builderPage;});
}
function builderRender(){
  if(page()!=='builder') return;
  if(builderUi.view==='create'){builderCreationRender();return;}
  if(builderUi.view==='archive'){builderArchiveRender();return;}
  if(builderUi.catalog?.schemaVersion===2){builderWorkbenchRender();return;}
  const cat=builderUi.catalog, army=builderUi.army, faction=builderFaction(), totals=builderTotals();
  main.innerHTML=`<section class="panel builder-shell">
    <button id="builder-archive" type="button">Torna alle armate</button><div class="builder-top"><div><p class="builder-eyebrow">CRONACHE DEL SETTORE / STRUMENTI</p><h1>Army Builder</h1><p class="intro">Crea la tua armata per Warhammer 40.000.</p></div>
    <label class="builder-edition">Edizione<select id="builder-edition"><option value="${cat?.edition||'11'}">${cat?.edition==='10'?'10ª · archivio':'11ª edizione'}</option></select></label></div>
    ${cat ? `<div class="builder-source"><span><strong>Catalogo ${esc(cat.version)}</strong> · ${esc(cat.source)} · ${esc(cat.license)}</span>${cat.catalogId!==builderUi.active?.catalogId?'<span class="builder-warning">Versione storica della lista</span>':''}<span>Non sostituisce le regole ufficiali.</span></div>` : `<div class="builder-empty"><h2>Nessun catalogo per questa edizione</h2><p>Importa il catalogo Wahapedia 11ª per aprire il nuovo editor Build e Play.</p></div>`}
    ${cat ? `<div class="builder-columns"><div class="builder-panel"><div class="builder-heading"><h2>Catalogo unità</h2><span>${faction?.units.length||0} unità</span></div>
        <label class="builder-field">Fazione<select id="builder-faction">${cat.factions.map(f=>`<option value="${esc(f.id)}" ${f.id===army.factionId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label class="builder-field">Cerca unità<input id="builder-search" autocomplete="off" placeholder="Nome o categoria" value="${esc(builderUi.search)}"></label>
        <div class="builder-units">${(faction?.units||[]).filter(u=>(u.name+' '+u.category).toLocaleLowerCase().includes(builderUi.search.toLocaleLowerCase())).map(u=>`<div class="builder-unit"><div><strong>${esc(u.name)}</strong><small>${esc(u.category)} · ${u.points.map(p=>`${p.models} mod. / ${p.points} pt`).join(' · ')}</small></div><button class="builder-add" data-add="${esc(u.id)}" type="button" aria-label="Aggiungi ${esc(u.name)}">+</button></div>`).join('')||'<p class="builder-muted">Nessuna unità trovata.</p>'}</div>
      </div><div class="builder-panel"><div class="builder-heading"><h2>La tua armata</h2><span>${army.entries.length} righe</span></div>
        <div class="builder-fields"><label class="builder-field">Nome<input id="builder-name" maxlength="100" value="${esc(army.name)}"></label><label class="builder-field">Distaccamento<select id="builder-detachment">${(faction?.detachments||[]).map(d=>`<option value="${esc(d.id)}" ${d.id===army.detachmentId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="builder-field">Limite punti<input id="builder-limit" type="number" min="100" max="5000" step="50" value="${army.limit}"></label></div>
        <div class="builder-total"><div><small>Punti utilizzati</small><strong>${totals.total} <span>/ ${army.limit}</span></strong></div><div class="builder-meter"><span style="width:${Math.min(100,Math.round(totals.total/army.limit*100))}%" class="${totals.total>army.limit?'over':''}"></span></div></div>
        ${totals.issues.length?`<div class="builder-alert" role="status">${totals.issues.map(issue=>`<p>${esc(issue)}</p>`).join('')}</div>`:''}
        <div class="builder-entries">${army.entries.length?army.entries.map((entry,index)=>{const unit=builderUnit(entry.unitId);if(!unit)return '';return `<article class="builder-entry"><div class="builder-entry-head"><strong>${esc(unit.name)}</strong><button type="button" data-remove="${index}" aria-label="Rimuovi ${esc(unit.name)}">Rimuovi</button></div><div class="builder-entry-controls"><label>Miniature<select data-models="${index}">${unit.points.map(p=>`<option value="${p.models}" ${entry.models===p.models?'selected':''}>${p.models} · ${p.points} pt</option>`).join('')}</select></label><label>Squadre<input type="number" min="1" max="20" data-quantity="${index}" value="${entry.quantity}"></label></div>${unit.equipment.length?`<details><summary>Equipaggiamenti opzionali</summary><div class="builder-gear">${unit.equipment.map(g=>`<label><input type="checkbox" data-gear="${index}" value="${esc(g.id)}" ${entry.equipmentIds.includes(g.id)?'checked':''}>${esc(g.name)} ${g.points?`(+${g.points} pt)`:''}</label>`).join('')}</div></details>`:''}</article>`;}).join(''):'<p class="builder-muted">Aggiungi un’unità dal catalogo per iniziare.</p>'}</div>
        <div class="builder-actions"><button id="builder-save" class="primary" type="button">Salva armata</button><button id="builder-export" type="button">Esporta TXT</button><button id="builder-new" type="button">Nuova</button></div>
        <p class="builder-note">Controlli attivi: punti, composizioni e limite copie definito nel catalogo. Le regole speciali, le combinazioni di equipaggiamenti e i requisiti del distaccamento devono essere verificati a parte.</p>
      </div></div>`:''}
    <div class="builder-bottom"><section class="builder-panel"><div class="builder-heading"><h2>Armate salvate</h2><span>${builderUi.armies.length} / 100</span></div>
      ${builderUi.armies.length?`<div class="builder-saved">${builderUi.armies.filter(a=>a.edition===builderUi.edition).map(a=>`<div class="builder-saved-row"><div><strong>${esc(a.name)}</strong><small>${esc(a.edition)}ª ed. · ${esc(a.updated||'')}</small></div><button data-open="${esc(a.id)}" type="button">Apri</button><button data-delete="${esc(a.id)}" type="button">Elimina</button></div>`).join('')||'<p class="builder-muted">Nessuna lista per questa edizione.</p>'}</div>`:'<p class="builder-muted">Le tue armate salvate compariranno qui.</p>'}</section>
    ${state.user.admin?`<section class="builder-panel"><div class="builder-heading"><h2>Importazione cataloghi</h2><span>Solo amministratori</span></div><p class="builder-muted">Carica un file JSON secondo lo schema documentato nel repository. Ogni importazione crea una versione indipendente: le armate già salvate mantengono la precedente.</p><label class="builder-field">File catalogo JSON<input type="file" id="builder-file" accept=".json,application/json"></label><button id="builder-import" type="button">Importa catalogo</button></section>`:''}
    </div>
  </section>`;
  builderBind();
}
function builderBind(){
  const root=main.querySelector('.builder-shell');if(!root)return;
  root.querySelector('#builder-archive').onclick=builderArchive;
  root.querySelector('#builder-edition').onchange=async e=>{builderUi.edition=e.target.value;builderUi.search='';builderPage();};
  const faction=root.querySelector('#builder-faction');if(faction)faction.onchange=e=>{builderUi.army.factionId=e.target.value;builderUi.army.detachmentId=builderFaction().detachments[0].id;builderUi.army.entries=[];builderRender();};
  const search=root.querySelector('#builder-search');if(search)search.oninput=e=>{builderUi.search=e.target.value;const pos=e.target.selectionStart;builderRender();const next=main.querySelector('#builder-search');next?.focus();next?.setSelectionRange(pos,pos);};
  const name=root.querySelector('#builder-name');if(name)name.oninput=e=>builderUi.army.name=e.target.value;
  const detachment=root.querySelector('#builder-detachment');if(detachment)detachment.onchange=e=>builderUi.army.detachmentId=e.target.value;
  const limit=root.querySelector('#builder-limit');if(limit)limit.onchange=e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=100&&n<=5000)builderUi.army.limit=n;builderRender();};
  root.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const unit=builderUnit(b.dataset.add);if(!unit)return;builderUi.army.entries.push({unitId:unit.id,models:unit.points[0].models,quantity:1,equipmentIds:[]});builderRender();});
  root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{builderUi.army.entries.splice(Number(b.dataset.remove),1);builderRender();});
  root.querySelectorAll('[data-models]').forEach(el=>el.onchange=()=>{builderUi.army.entries[Number(el.dataset.models)].models=Number(el.value);builderRender();});
  root.querySelectorAll('[data-quantity]').forEach(el=>el.onchange=()=>{const n=Number(el.value);if(Number.isInteger(n)&&n>=1&&n<=20)builderUi.army.entries[Number(el.dataset.quantity)].quantity=n;builderRender();});
  root.querySelectorAll('[data-gear]').forEach(el=>el.onchange=()=>{const e=builderUi.army.entries[Number(el.dataset.gear)];e.equipmentIds=el.checked?[...e.equipmentIds,el.value]:e.equipmentIds.filter(id=>id!==el.value);builderRender();});
  const newButton=root.querySelector('#builder-new');if(newButton)newButton.onclick=builderArchive;
  const save=root.querySelector('#builder-save');if(save)save.onclick=builderLegacySave;
  const exported=root.querySelector('#builder-export');if(exported)exported.onclick=builderExport;
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>builderOpen(b.dataset.open));
  root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Eliminare definitivamente questa armata?'))return;try{await api('builderDelete',{id:b.dataset.delete});builderUi.armies=(await api('builderArmies')).armies;if(builderUi.army?.id===b.dataset.delete){builderUi.catalog=builderUi.active;builderUi.army=null;builderUi.view='archive';}builderRender();notify('Armata eliminata.');}catch(err){notify(err.message,true);}});
  const imported=root.querySelector('#builder-import');if(imported)imported.onclick=()=>builderImportFile(root.querySelector('#builder-file').files[0]);
}
function builderExport(){
  const army=builderUi.army, faction=builderFaction();if(!army||!faction)return;
  const totals=builderTotals();const lines=[army.name,`Edizione: ${army.edition}`,`Fazione: ${faction.name}`,`Distaccamento: ${faction.detachments.find(d=>d.id===army.detachmentId)?.name||army.detachmentId}`,`Catalogo: ${builderUi.catalog.version}`,`Punti: ${totals.total}/${army.limit}`,''];
  for(const e of army.entries){const u=builderUnit(e.unitId);if(!u)continue;const base=u.points.find(p=>p.models===e.models)?.points||0;const gear=u.equipment.filter(g=>e.equipmentIds.includes(g.id));const subtotal=(base+gear.reduce((sum,g)=>sum+g.points,0))*e.quantity;lines.push(`${e.quantity}x ${u.name} (${e.models} mod.) - ${subtotal} pt`);if(gear.length)lines.push('  Equipaggiamento: '+gear.map(g=>g.name).join(', '));}
  if(totals.issues.length)lines.push('','ATTENZIONE: '+totals.issues.join(' '));
  lines.push('','Controllare sempre le regole ufficiali e la licenza dei dati.');
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(army.name.replace(/[^a-z0-9_-]+/gi,'_').slice(0,60)||'armata')+'.txt';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
