'use strict';

const workbench={mode:'build',pane:'roster',detailTab:'profiles',selected:null,preview:null,dirty:false,revision:0,search:'',catalogFaction:null,filters:{legends:true,allies:true,titanic:true},categoryOpen:{},hiddenErrors:[],activeEffects:{},exportFormat:'gw',scrollPositions:{}};
const wbUnits=()=>new Map((builderUi.catalog?.units||[]).map(u=>[u.id,u]));
const wbEntry=id=>builderUi.army.entries.find(e=>e.entryId===id);
const wbFaction=()=>builderUi.catalog.factions.find(f=>f.id===builderUi.army.factionId);
const wbText=value=>esc(String(value??'').replace(/<br\s*\/?>|<\/p>|<\/li>/gi,'\n').replace(/<[^>]*>/g,''));
const wbId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const wbDescription=row=>row.description||(builderUi.catalog.texts||[]).find(t=>t.id===row.descriptionRef)?.description||'';
const wbPlus=value=>/^\d+$/.test(String(value))?value+'+':value;
const wbCategories=['Epic Hero','Character','Battleline','Infantry','Mounted/Beast','Vehicle','Other'];
const wbMobileCategories=['Character','Battleline','Infantry','Mounted','Vehicle','Other','Alleati'];
const wbIsPhone=()=>typeof matchMedia==='function'&&matchMedia('(max-width:850px)').matches;
function wbMobileCategory(unit){
  if(!unit)return 'Other';
  if(unit.id&&!wbFaction().unitIds.includes(unit.id))return 'Alleati';
  const category=wbCategory(unit);return category==='Epic Hero'?'Character':category==='Mounted/Beast'?'Mounted':category;
}
function wbAllyLabel(unit){return (beAllyRule(unit.id)?.name||'Alleato')+(unit.factionId==='aoi'?' · Imperial Agents':'');}
function wbMobileHeader(totals){
  const a=builderUi.army,detail=workbench.pane==='detail';
  return `<div class="wb-mobile-header">${detail?'<button data-wb-return-roster type="button" aria-label="Torna all’armata">←</button>':''}<div class="wb-mobile-title"><strong>${esc(a.name)}</strong><small>${totals.total} / ${a.limit} pt · ${workbench.mode==='play'?'Play':esc(wbFaction().name)}</small></div><button data-wb-mobile-save class="primary" ${builderUi.pending?'disabled':''}>${builderUi.pending?'Salvo…':'Salva'}</button><button data-wb-mobile-menu aria-label="Menu lista" aria-haspopup="dialog">☰</button></div>`;
}
function wbMobileCatalogList(category='',search=''){
  const units=wbUnits(),native=new Set(wbFaction().unitIds),term=search.trim().toLocaleLowerCase();
  const rows=beCatalogIds().map(id=>units.get(id)).filter(u=>u&&(workbench.filters.legends||!u.legends)&&(workbench.filters.allies||native.has(u.id))&&(workbench.filters.titanic||!/(?:^|,\s*)Titanic(?:,|$)/i.test(u.keywords))&&(!category||wbMobileCategory(u)===category)&&(u.name+' '+u.keywords).toLocaleLowerCase().includes(term));
  return wbMobileCategories.filter(c=>rows.some(u=>wbMobileCategory(u)===c)).map(c=>`<details class="wb-category" ${category||term?'open':''}><summary>${esc(c)} <small>${rows.filter(u=>wbMobileCategory(u)===c).length}</small></summary>${rows.filter(u=>wbMobileCategory(u)===c).map(u=>`<div class="wb-catalog-row"><div class="wb-unit-name">${esc(u.name)}<small>${u.points[0]?.points??'?'} pt${!native.has(u.id)?' · Alleato: '+esc(wbAllyLabel(u)):''}${u.legends?' · Legends':''} · ${builderUi.army.entries.filter(e=>e.unitId===u.id).length} in lista</small></div><button type="button" data-wb-mobile-add="${esc(u.id)}" aria-label="Aggiungi ${esc(u.name)}">+</button></div>`).join('')}</details>`).join('')||'<p>Nessuna unità trovata.</p>';
}
function wbOpenMobileCatalog(category='',trigger){
  const dialog=wbModal(category||'Catalogo unità',`<div class="wb-popup-search-toolbar"><label class="wb-popup-search">Cerca unità<span class="wb-search-field"><input type="search" data-wb-popup-search placeholder="Nome o keyword" autocomplete="off"><button type="button" data-wb-clear-search aria-label="Cancella ricerca" hidden>×</button></span></label><button type="button" data-wb-popup-filters aria-haspopup="dialog">Filtri</button></div><div class="wb-popup-catalog">${wbMobileCatalogList(category)}</div><p data-wb-added role="status" aria-live="polite"></p>`,trigger);
  dialog.classList.add('wb-mobile-catalog-dialog');
  const list=dialog.querySelector('.wb-popup-catalog'),search=dialog.querySelector('[data-wb-popup-search]');
  const clear=dialog.querySelector('[data-wb-clear-search]');
  search.addEventListener('input',()=>{list.innerHTML=wbMobileCatalogList(category,search.value);clear.hidden=!search.value;});
  clear.addEventListener('click',()=>{search.value='';list.innerHTML=wbMobileCatalogList(category);clear.hidden=true;search.focus();});
  const filterButton=dialog.querySelector('[data-wb-popup-filters]');
  const filterPanel=document.createElement('div');filterPanel.hidden=true;filterPanel.innerHTML=wbFiltersHtml();filterButton.closest('.wb-popup-search-toolbar').after(filterPanel);
  filterPanel.id='wb-mobile-catalog-filters';filterButton.setAttribute('aria-controls',filterPanel.id);filterButton.setAttribute('aria-expanded','false');filterButton.removeAttribute('aria-haspopup');
  filterButton.addEventListener('click',()=>{filterPanel.hidden=!filterPanel.hidden;filterButton.setAttribute('aria-expanded',String(!filterPanel.hidden));});
  filterPanel.addEventListener('change',event=>{const key=event.target.dataset.wbFilter;if(!Object.hasOwn(workbench.filters,key))return;workbench.filters[key]=event.target.checked;list.innerHTML=wbMobileCatalogList(category,search.value);wbSearch(workbench.search);});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-wb-mobile-add]');if(!button)return;const before=builderUi.army.entries.length,top=dialog.scrollTop;wbAdd(button.dataset.wbMobileAdd);if(builderUi.army.entries.length===before)return;dialog.querySelector('[data-wb-added]').textContent=wbUnits().get(button.dataset.wbMobileAdd).name+' aggiunta';list.innerHTML=wbMobileCatalogList(category,search.value);dialog.scrollTop=top;list.querySelector(`[data-wb-mobile-add="${button.dataset.wbMobileAdd}"]`)?.focus({preventScroll:true});});
}
function wbOpenMobileSettings(trigger){
  const dialog=wbModal('Configura armata',wbArmySettings(true),trigger);dialog.classList.add('wb-mobile-settings-dialog');
  wbBind(dialog);
  const refresh=()=>{const top=dialog.scrollTop,body=dialog.querySelector('.wb-army-settings');body.outerHTML=wbArmySettings(true);wbBind(dialog);dialog.scrollTop=top;};
  dialog.addEventListener('change',refresh);
  dialog.addEventListener('click',event=>{if(event.target.closest('[data-wb-adjust]'))refresh();if(event.target.closest('#wb-detachments'))document.querySelector('dialog[aria-labelledby="wb-detachment-title"]')?.addEventListener('close',refresh,{once:true});});
}
function wbOpenMobileMenu(trigger){
  const a=builderUi.army;
  const dialog=wbModal('Menu lista',`<label>Nome lista<input data-wb-mobile-name maxlength="100" value="${esc(a.name)}"></label><div class="wb-mobile-actions"><button data-wb-menu-mode="build" aria-pressed="${workbench.mode==='build'}">Build</button><button data-wb-menu-mode="play" aria-pressed="${workbench.mode==='play'}">Play mode</button>${workbench.mode==='build'?'<button data-wb-menu-action="settings">Configura armata e distaccamenti</button>':'<button data-wb-menu-action="stratagems">Stratagemmi</button>'}<button data-wb-menu-action="export">Esporta lista</button><button data-wb-menu-action="backup">Backup JSON</button>${builderUi.active&&a.catalogId!==builderUi.active.catalogId?'<button data-wb-menu-action="copy">Crea copia col catalogo attivo</button>':''}<button data-wb-menu-action="archive">Torna alle armate</button></div>`,trigger);
  dialog.querySelector('[data-wb-mobile-name]').addEventListener('change',event=>{const value=event.target.value.trim();if(!value){event.target.value=a.name;return;}a.name=value;wbChanged();});
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-wb-menu-mode],[data-wb-menu-action]');if(!button)return;dialog.close();if(button.dataset.wbMenuMode){wbSetMode(button.dataset.wbMenuMode);return;}switch(button.dataset.wbMenuAction){case 'settings':wbOpenMobileSettings(main.querySelector('[data-wb-mobile-menu]'));break;case 'export':beExport();break;case 'backup':wbDownload('armata-11.json',JSON.stringify(a,null,2),'application/json');break;case 'stratagems':wbModal('Stratagemmi · Core e distaccamenti',wbStratagems(wbAllStratagems()),main.querySelector('[data-wb-mobile-menu]'));break;case 'copy':beCopyActive();break;case 'archive':builderArchive();break;}});
}
function wbCategory(unit){
  const keys=(unit.category+' '+unit.keywords).toLowerCase();
  if(/\bepic hero\b/.test(keys))return 'Epic Hero';
  if(/\bcharacter\b/.test(keys))return 'Character';
  if(/\bbattleline\b/.test(keys))return 'Battleline';
  if(/\binfantry\b/.test(keys))return 'Infantry';
  if(/\b(mounted|beast)\b/.test(keys))return 'Mounted/Beast';
  if(/\b(vehicle|walker|transport|transports|aircraft)\b/.test(keys))return 'Vehicle';
  return 'Other';
}
function wbCatalogList(){
  const units=wbUnits(),native=new Set(wbFaction().unitIds),category=u=>native.has(u.id)?wbCategory(u):'Other';
  const filtered=beCatalogIds().map(id=>units.get(id)).filter(u=>u&&(workbench.filters.legends||!u.legends)&&(workbench.filters.allies||native.has(u.id))&&(workbench.filters.titanic||!/(?:^|,\s*)Titanic(?:,|$)/i.test(u.keywords))&&(u.name+' '+u.category+' '+u.keywords).toLocaleLowerCase().includes(workbench.search.toLocaleLowerCase()));
  return wbCategories.filter(c=>filtered.some(u=>category(u)===c)).map(c=>`<details ${workbench.search.trim()||workbench.categoryOpen[builderUi.army.factionId+':'+c]?'open':''} class="wb-category" data-wb-category="${esc(c)}"><summary>${esc(c)} <small>${filtered.filter(u=>category(u)===c).length}</small></summary>${filtered.filter(u=>category(u)===c).map(u=>`<div class="wb-catalog-row"><button data-wb-preview="${esc(u.id)}" class="wb-unit-name">${esc(u.name)}<small>${u.points[0]?.points??'?'} pt${u.legends?' · Legends':''}${!native.has(u.id)?' · Alleato: '+esc(wbAllyLabel(u)):''} · ${builderUi.army.entries.filter(e=>e.unitId===u.id).length} in lista</small></button><button data-wb-add="${esc(u.id)}" aria-label="Aggiungi ${esc(u.name)}">+</button></div>`).join('')}</details>`).join('')||'<p>Nessuna unità trovata.</p>';
}
function wbSearch(value){
  workbench.search=value;
  main.querySelector('#wb-catalog-list').innerHTML=wbCatalogList();
  const clear=main.querySelector('[data-wb-desktop-clear]');if(clear)clear.hidden=!value;
}
function wbChangeWeapon(line,delta){
  const entry=wbEntry(workbench.selected),unit=wbUnits().get(entry?.unitId);
  const weapon=unit?.weapons.find(w=>w.line===line&&(!w.enhancement_id||entry.enhancementIds.includes(w.enhancement_id)));
  if(!entry||!weapon||![1,-1].includes(delta))return;
  if(entry.loadoutSelections&&beManagedWeapon(unit.loadoutRecipe,line)){notify('Usa i gruppi di dotazione per cambiare questa arma.',true);return;}
  const quantity=Number(entry.weaponCounts[line]||0)+delta;
  if(weapon.enhancement_id||quantity<0||quantity>beWeaponLimit(unit,entry,line))return;
  for(const mode of beWeaponModes(unit,line))entry.weaponCounts[mode.line]=quantity;wbChanged();
}
function wbAttachmentTargets(entry){
  const units=wbUnits(),unit=units.get(entry.unitId);
  if(builderUi.army.entries.some(x=>x.attachedTo===entry.entryId))return [];
  return builderUi.army.entries.filter(target=>target.entryId!==entry.entryId&&!target.attachedTo&&unit.leads.includes(target.unitId)&&
    !builderUi.army.entries.some(member=>member.entryId!==entry.entryId&&member.attachedTo===target.entryId&&Boolean(units.get(member.unitId)?.support)===Boolean(unit.support)));
}
function wbSupportErrors(){
  const units=wbUnits();
  return builderUi.army.entries.filter(e=>units.get(e.unitId)?.support&&!e.attachedTo).map(e=>`${units.get(e.unitId).name}: un Support deve essere associato a un’unità compatibile.`);
}
function wbSetMode(mode){
  if(mode==='play'&&builderWorkbenchTotals().errors.length){notify('Correggi gli errori della lista prima di passare alla partita.',true);return false;}
  workbench.mode=mode;workbench.preview=null;
  if(mode==='play'){const entry=wbEntry(workbench.selected);if(entry?.attachedTo)workbench.selected=entry.attachedTo;workbench.pane='roster';}
  builderWorkbenchRender();workbench.scrollPositions={};if(typeof main!=='undefined')main.querySelectorAll?.('[data-wb-scroll]').forEach(panel=>{panel.scrollTop=0;});return true;
}
function wbDetachments(){return wbFaction().detachments.filter(d=>builderUi.army.detachmentIds.includes(d.id));}
function wbIncursionException(detachments=wbDetachments()){
  return builderUi.army.limit===1000&&detachments.length===1&&Number(detachments[0].dp)===3;
}
function wbDpSummary(){
  const selected=wbDetachments(),used=selected.reduce((sum,d)=>sum+Number(d.dp),0);
  return wbIncursionException(selected)?'3 DP · eccezione Incursion':`${used} / ${builderUi.army.dpLimit} DP`;
}
function wbDetachmentConflict(candidate){
  if(builderUi.army.detachmentIds.includes(candidate.id))return '';
  const selected=wbDetachments(),tag=(candidate.unique||'').trim();
  if(tag&&selected.some(d=>(d.unique||'').trim()===tag))return tag;
  if(wbIncursionException([...selected,candidate]))return '';
  if(selected.reduce((n,d)=>n+Number(d.dp),0)+Number(candidate.dp)>builderUi.army.dpLimit)return 'Budget DP insufficiente';
  return '';
}
function wbDetachmentChoices(){return wbFaction().detachments.map(d=>{const conflict=wbDetachmentConflict(d);return `<div class="wb-detachment-choice ${conflict?'is-disabled':''}"><input aria-label="Seleziona ${esc(d.name)}" data-wb-detachment="${esc(d.id)}" type="checkbox" ${builderUi.army.detachmentIds.includes(d.id)?'checked':''} ${conflict?'disabled':''}><details><summary>${esc(d.name)} <small>${esc(d.dp)} DP${d.unique?' · '+esc(d.unique):''}</small></summary><p class="wb-muted">${esc(d.force_disposition||'')}</p>${wbDetachmentSections(d)}</details><small data-wb-conflict="${esc(d.id)}" class="wb-warning">${esc(conflict)}</small></div>`;}).join('');}
function wbDispositionOptions(){
  return '<option value="">Seleziona disposizione</option>'+[...new Set(wbDetachments().flatMap(d=>(d.force_disposition||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)))].map(s=>`<option value="${esc(s)}" ${builderUi.army.disposition===s?'selected':''}>${esc(s)}</option>`).join('');
}
function wbToggleDetachment(id,checked){
  const a=builderUi.army,d=wbFaction().detachments.find(d=>d.id===id);
  if(!d||(checked&&wbDetachmentConflict(d)))return false;
  a.detachmentIds=checked?[...new Set([...a.detachmentIds,id])]:a.detachmentIds.filter(x=>x!==id);
  const available=wbDetachments().flatMap(d=>(d.force_disposition||'').split(/[,;]/).map(s=>s.trim()));
  if(!available.includes(a.disposition))a.disposition='';
  wbChanged();return true;
}
function wbDetachmentDialogContent(){
  return `<div class="wb-dialog-head"><div><h2 id="wb-detachment-title">Distaccamenti</h2><p class="wb-muted">${esc(wbFaction().name)}</p></div><button data-wb-close type="button" autofocus>Chiudi</button></div>
    <p data-wb-dp-status role="status">${esc(wbDpSummary())}</p>${builderUi.army.limit===1000?'<p class="wb-muted">Incursion: puoi scegliere un singolo distaccamento da 3 DP.</p>':''}
    <div class="wb-dialog-body">${wbDetachmentChoices()}</div><label>Disposizione<select data-wb-dialog-disposition>${wbDispositionOptions()}</select></label><p class="wb-muted">Le scelte sono applicate alla lista. Salva l’armata per conservarle.</p>`;
}
function wbRefreshDetachmentDialog(dialog){
  dialog.querySelector('[data-wb-dp-status]').textContent=wbDpSummary();
  for(const input of dialog.querySelectorAll('[data-wb-detachment]')){
    const d=wbFaction().detachments.find(d=>d.id===input.dataset.wbDetachment),conflict=wbDetachmentConflict(d);
    input.checked=builderUi.army.detachmentIds.includes(d.id);input.disabled=Boolean(conflict);
    input.closest('.wb-detachment-choice').classList.toggle('is-disabled',Boolean(conflict));
    dialog.querySelector(`[data-wb-conflict="${d.id}"]`).textContent=conflict;
  }
  dialog.querySelector('[data-wb-dialog-disposition]').innerHTML=wbDispositionOptions();
}
function wbOpenDetachments(trigger){
  if(document.querySelector('dialog[open][aria-labelledby="wb-detachment-title"]'))return;
  const dialog=document.createElement('dialog');dialog.className='workbench wb-detachment-dialog';
  dialog.setAttribute('aria-labelledby','wb-detachment-title');dialog.innerHTML=wbDetachmentDialogContent();
  dialog.querySelector('[data-wb-close]').onclick=()=>dialog.close();
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-wb-detachment]')){wbToggleDetachment(event.target.dataset.wbDetachment,event.target.checked);wbRefreshDetachmentDialog(dialog);}
    if(event.target.matches('[data-wb-dialog-disposition]')){builderUi.army.disposition=event.target.value;wbChanged();}
  });
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-wb-rule]');if(button)wbOpenRule(button);});
  wbCloseOnBackdrop(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();(trigger?.isConnected?trigger:main.querySelector('#wb-detachments'))?.focus({preventScroll:true});});
  document.body.appendChild(dialog);dialog.showModal();
}
function wbArmyRules(){return wbDetachments().map(d=>`<details class="wb-detachment-resources"><summary>${esc(d.name)} · ${esc(d.dp)} DP</summary>${wbDetachmentSections(d)}</details>`).join('');}
function wbDetachmentSections(d){
  const strats=(builderUi.catalog.stratagems||[]).filter(s=>s.detachment_id===d.id&&!/boarding|combat patrol/i.test(s.type||'')),enhancements=new Map();
  for(const u of wbUnits().values())for(const e of u.enhancements)if(e.detachment_id===d.id)enhancements.set(e.id,e);
  const lines=String(d.description||'Regola non disponibile nel catalogo.').split('\n'),title=lines[0],hasTitle=lines.length>1&&title.length<100&&!/[.!?]$/.test(title);
  const body=hasTitle?`<h4>${wbText(title)}</h4>${beRich(lines.slice(1).join('\n'))}`:beRich(lines.join('\n'));
  return `<article class="wb-detachment-rule-card"><div class="wb-rule-card-heading"><span>DETACHMENT RULE</span><h3>${wbText(d.name)}</h3></div><div class="wb-rule">${body}</div></article><details><summary>Stratagemmi (${strats.length})</summary>${wbStratagems(strats,d.id)}</details>${enhancements.size?`<details><summary>Enhancement / Upgrade (${enhancements.size})</summary>${wbRules([...enhancements.values()])}</details>`:''}`;
}
function wbCosts(unit){
  const seen=new Set(),rows=[];
  const add=(label,cost)=>{const key=label+'|'+cost;if(!seen.has(key)){seen.add(key);rows.push([label,cost]);}};
  const layouts=unit.loadoutRecipe?.layouts||[];
  if(layouts.some(l=>l.prices))for(const l of layouts)for(const p of l.prices||[])add(`${l.name} · copie ${p.first}–${p.last}`,p.points);
  else for(const p of unit.points){const first=p.first??1,last=p.last??200;add(`${p.models} models${first>1||last<200?' · copies '+first+'–'+last:''}`,p.points);}
  for(const row of unit.costs)if(row.cost!==undefined&&row.cost!==''&&(!unit.points.length||/^per /i.test(row.description)))add(row.description,row.cost);
  return wbTable(['Composizione / fascia','Punti'],rows)+[...new Set(unit.composition.map(wbDescription))].map(text=>`<p>${wbText(text)}</p>`).join('');
}
function wbCloseOnBackdrop(dialog){
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
}
function wbModal(title,body,trigger){
  const dialog=document.createElement('dialog'),titleId='wb-reference-title-'+wbId();dialog.className='workbench wb-detachment-dialog wb-reference-dialog';dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML=`<div class="wb-dialog-head"><h2 id="${titleId}">${esc(title)}</h2><button data-wb-modal-close type="button" autofocus>Chiudi</button></div>${body}`;
  dialog.querySelector('[data-wb-modal-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{const button=event.target.closest('[data-wb-rule]');if(button)wbOpenRule(button);});
  wbCloseOnBackdrop(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus({preventScroll:true});},{once:true});document.body.appendChild(dialog);dialog.showModal();return dialog;
}
function wbAllStratagems(){return (builderUi.catalog.stratagems||[]).filter(s=>wbPlayableStratagem(s)&&(!s.detachment_id?/^Core Stratagem$/i.test(s.type):builderUi.army.detachmentIds.includes(s.detachment_id)));}
function wbNumber(label,field,value,min,max,step=1,disabled=false){return `<div class="wb-number"><span>${esc(label)}</span><div class="wb-quantity" role="group" aria-label="${esc(label)}"><button type="button" data-wb-adjust="${field}" data-wb-step="-${step}" aria-label="Diminuisci ${esc(label)}" ${disabled||value<=min?'disabled':''}>−</button><output>${value}</output><button type="button" data-wb-adjust="${field}" data-wb-step="${step}" aria-label="Aumenta ${esc(label)}" ${disabled||value>=max?'disabled':''}>+</button></div></div>`;}
function wbSizes(unit){return [...new Set(unit.points.map(p=>p.models))].sort((a,b)=>a-b);}
function wbInstanceName(entry){const unit=wbUnits().get(entry.unitId),copies=builderUi.army.entries.filter(e=>e.unitId===entry.unitId);return unit.name+(copies.length>1?' · squadra '+(copies.indexOf(entry)+1):'');}
function wbArmySettings(open=false){
  const a=builderUi.army,f=wbFaction();
  return `<details class="wb-configuration wb-army-settings" ${open?'open':''}><summary><strong>${esc(f.name)}</strong><span>${a.limit} pt · ${a.dpLimit} DP</span><span>Configura armata</span></summary><div class="wb-army-settings-grid"><label>Fazione<select id="wb-faction">${builderUi.catalog.factions.filter(x=>x.id===f.id||builderPlayableFactions().some(p=>p.id===x.id)).map(x=>`<option value="${x.id}" ${x.id===f.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><div class="wb-fields">${wbNumber('Limite punti','limit',a.limit,100,5000,100)}${wbNumber('DP','dpLimit',a.dpLimit,0,20,1,[1000,2000].includes(a.limit))}</div><div class="wb-detachment-summary"><button id="wb-detachments" type="button">Distaccamenti · ${a.detachmentIds.length} selezionati</button><label>Disposizione<select id="wb-disposition">${wbDispositionOptions()}</select></label><div class="wb-detachment-recap">${wbDetachments().map(d=>`<button class="wb-detachment-link" data-wb-detachment-rule="${esc(d.id)}">${esc(d.name)}</button>`).join('')||'<p class="wb-muted">Nessun distaccamento selezionato</p>'}</div></div></div></details>`;
}
function wbFiltersHtml(){return `<fieldset class="wb-filters"><legend>Mostra unità</legend>${[['legends','Legends'],['allies','Alleati'],['titanic','Titanic']].map(([key,label])=>`<label class="wb-check"><input type="checkbox" data-wb-filter="${key}" ${workbench.filters[key]?'checked':''}>${label}</label>`).join('')}</fieldset>`;}
function wbOpenFilters(trigger){
  const dialog=wbModal('Filtri del catalogo',wbFiltersHtml(),trigger);
  dialog.addEventListener('change',event=>{const key=event.target.dataset.wbFilter;if(!Object.hasOwn(workbench.filters,key))return;workbench.filters[key]=event.target.checked;wbSearch(workbench.search);});
  return dialog;
}
function wbProfileWeapons(unit,entry,type,origin=''){
  return unit.weapons.flatMap(w=>w._variants||[w]).filter(w=>w.name&&w.type===type&&(!entry||Number(entry.weaponCounts[w.line]||0)>0||w.enhancement_id&&entry.enhancementIds.includes(w.enhancement_id))).filter(w=>!w.enhancement_id||entry?.enhancementIds.includes(w.enhancement_id)).flatMap(weapon=>beWeaponOwners(unit,entry,weapon).map(owner=>({weapon,count:owner.count,origin,model:owner.name,unitId:unit.id})));
}
function wbRosterRows(category=null,totals=builderWorkbenchTotals()){
  const units=wbUnits(),a=builderUi.army;
  if(category===null)return wbMobileCategories.filter(c=>!['Other','Alleati'].includes(c)||a.entries.some(e=>wbMobileCategory(units.get(e.unitId))===c)||beCatalogIds().some(id=>wbMobileCategory(units.get(id))===c)).map(c=>`<section class="wb-roster-category"><div class="wb-roster-category-head"><h3>${esc(c)}</h3>${workbench.mode==='build'?`<button data-wb-open-catalog="${esc(c)}" aria-label="Aggiungi ${esc(c)}" aria-haspopup="dialog">+</button>`:''}</div>${wbRosterRows(c,totals)||'<p class="wb-muted">Nessuna unità</p>'}</section>`).join('');
  return a.entries.filter(e=>(!e.attachedTo||!wbEntry(e.attachedTo)||wbEntry(e.attachedTo).attachedTo)&&(!category||wbMobileCategory(units.get(e.unitId))===category)).map(root=>{
    const group=wbGroup(root),groupSelected=group.some(e=>e.entryId===workbench.selected);
    return `<div class="wb-roster-group ${group.length>1?'is-attached':''} ${groupSelected?'is-selected':''}">${group.length>1?'<p class="wb-group-label">Unità attached</p>':''}${group.map(e=>{
      const selected=workbench.mode==='play'?groupSelected:e.entryId===workbench.selected,u=units.get(e.unitId),messages=totals.issues.filter(message=>message.includes(u.name)),errors=beGearErrors(e),cost=(wbPrice(e)??0)+e.enhancementIds.reduce((sum,id)=>sum+Number(u.enhancements.find(x=>x.id===id)?.cost||0),0);
      return `<article class="wb-roster-row ${selected?'is-selected':''}"><button data-wb-select="${e.entryId}" class="wb-unit-name" aria-pressed="${selected}"><span>${messages.length||errors.length?`<span class="wb-invalid" role="img" aria-label="${esc([...new Set([...messages,...errors])].join(' '))}" title="${esc([...new Set([...messages,...errors])].join(' '))}">!</span>`:''}${wbText(wbInstanceName(e))}${e.warlord?' · Warlord':''}</span><small>${e===root?e.models+' modelli':u.support?'Support':'Leader'}</small><strong>${cost} pt</strong></button>${workbench.mode==='build'?`<div class="wb-row-actions"><button data-wb-duplicate="${e.entryId}" aria-label="Duplica ${esc(u.name)}">Duplica</button><button data-wb-remove="${e.entryId}" aria-label="Rimuovi ${esc(u.name)}">Rimuovi</button></div>`:''}</article>`;
    }).join('')}</div>`;
  }).join('')||(category?'':'<div class="wb-empty"><h3>La tua armata inizia qui</h3><p>Aggiungi le unità dal catalogo.</p></div>');
}
function builderWorkbenchNewArmy(){
  return {id:null,schemaVersion:2,name:'Nuova armata',edition:'11',catalogId:builderUi.catalog.catalogId,factionId:builderPlayableFactions()[0]?.id||'',detachmentIds:[],disposition:'',limit:2000,dpLimit:3,entries:[]};
}
function wbPrice(entry,entries=builderUi.army.entries){
  const u=wbUnits().get(entry.unitId), ordinal=entries.slice(0,entries.indexOf(entry)+1).filter(e=>e.unitId===entry.unitId).length;
  const price=beEntryBasePrice(u,entry,ordinal);
  if(entry.manualPoints!==null&&entry.manualPoints!==undefined)return entry.manualPoints;
  return price===null?null:price+(entry.loadoutSelections?beSync(u,entry):0);
}
function builderWorkbenchTotals(){
  const a=builderUi.army, units=wbUnits(), issues=[]; let total=0, enhancements=0;
  for(const e of a.entries){
    const u=units.get(e.unitId);if(!u)continue;
    const price=wbPrice(e);total+=price??0;
    if(price===null)issues.push(`${u.name}: costo da inserire manualmente.`);
    total+=e.enhancementIds.reduce((sum,id)=>sum+Number(u.enhancements.find(x=>x.id===id)?.cost||0),0);enhancements+=e.enhancementIds.length;
    if(!wbFaction().unitIds.includes(e.unitId)&&!beAllyRule(e.unitId))issues.push(`${u.name}: alleato non autorizzato dai distaccamenti selezionati.`);
    if(e.attachedTo&&!u.leads.includes(wbEntry(e.attachedTo)?.unitId))issues.push(`${u.name}: attachment da verificare.`);
  }
  const errors=[...wbSupportErrors(),...beAllyErrors(),...a.entries.flatMap(beGearErrors)];issues.push(...errors);
  if(total>a.limit)issues.push('La lista supera il limite di punti.');
  for(const uid of new Set(a.entries.map(e=>e.unitId))){const u=units.get(uid);if(!u)continue;const max=a.limit<=1000?Math.max(1,Math.floor(u.maxCopies*2/3)):u.maxCopies;if(a.entries.filter(e=>e.unitId===uid).length>max)issues.push(`Troppe copie di ${u.name} (limite ${max}).`);}
  const dp=wbFaction().detachments.filter(d=>a.detachmentIds.includes(d.id)).reduce((sum,d)=>sum+Number(d.dp||0),0);
  if(dp>a.dpLimit&&!wbIncursionException())issues.push('Budget Detachment Points superato.');
  const tags=wbDetachments().map(d=>d.unique).filter(Boolean);
  if(new Set(tags).size!==tags.length)issues.push('Distaccamenti incompatibili: stesso tag Unique.');
  if(!a.detachmentIds.length)issues.push('Seleziona i distaccamenti.');
  if(!a.disposition)issues.push('Seleziona la Force Disposition.');
  if(a.entries.filter(e=>e.warlord).length!==1)issues.push('Indica un solo Warlord.');
  if(enhancements>(a.limit<=1000?2:4))issues.push('Limite potenziamenti superato.');
  return {total,issues,errors,dp};
}
function wbChanged(render=true){workbench.dirty=true;workbench.revision++;if(render)builderWorkbenchRender();}
function wbDiscard(){if(builderUi.pending){notify('Attendi il salvataggio in corso.');return false;}return builderDiscard();}
function wbResetDetailScroll(){if(typeof main!=='undefined'){const detail=main.querySelector('.wb-detail');if(detail)detail.scrollTop=0;}}
function wbSelect(id,preview=false){workbench.preview=preview?id:null;workbench.selected=preview?null:id;workbench.pane='detail';workbench.detailTab='profiles';builderWorkbenchRender();wbResetDetailScroll();}
function wbAdd(id){
  const u=wbUnits().get(id);if(!u||builderUi.army.entries.length>=200||!beCatalogIds().includes(id))return;
  const e={entryId:wbId(),unitId:id,models:u.points[0]?.models||1,manualPoints:null,weaponCounts:{},enhancementIds:[],attachedTo:null,warlord:false,notes:''};
  if(u.loadoutRecipe?.groups){e.loadoutSelections=beSelections(u,e.models);beSync(u,e);}
  const preset=builderUi.defaults?.find(p=>p.unitId===id);
  if(preset){if(preset.catalogId===builderUi.army.catalogId&&u.points.some(p=>p.models===preset.entry.models)){
    e.models=preset.entry.models;e.weaponCounts=builderClone(preset.entry.weaponCounts);if(preset.entry.loadoutSelections)e.loadoutSelections=builderClone(preset.entry.loadoutSelections);else delete e.loadoutSelections;beSync(u,e);
  }else notify('Il default personale appartiene a un catalogo o una taglia diversi: applicata la dotazione standard.');}
  if(wbMustWarlord(u)){builderUi.army.entries.forEach(entry=>entry.warlord=false);e.warlord=true;}
  builderUi.army.entries.push(e);workbench.selected=e.entryId;workbench.preview=null;workbench.pane=wbIsPhone()?'roster':'detail';workbench.detailTab='config';wbChanged();wbResetDetailScroll();
}
function wbMustWarlord(unit){return [...unit.abilities,...unit.composition].some(rule=>/If this (?:model|unit) is in your army,?\s+it must be your Warlord\b/i.test(wbDescription(rule)));}
function wbApplyRequiredWarlord(){
  const entries=builderUi.army.entries,required=entries.filter(entry=>wbMustWarlord(wbUnits().get(entry.unitId)));
  if(required.length!==1||required[0].warlord&&entries.filter(entry=>entry.warlord).length===1)return false;
  entries.forEach(entry=>entry.warlord=entry===required[0]);return true;
}
function wbGroup(root){return [root,...builderUi.army.entries.filter(e=>e.attachedTo===root.entryId)];}
function wbTable(headers,rows){return `<div class="wb-table" tabindex="0" role="region" aria-label="Profili, tabella scorrevole"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((c,i)=>i===0?`<th scope="row">${wbText(c)}</th>`:`<td>${wbText(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function wbCoreRule(label){
  const key=String(label).trim().replace(/^\[|\]$/g,'').split(':')[0].trim().toUpperCase();
  const rules=builderUi.catalog?.coreRules||[];
  return rules.find(r=>r.name.toUpperCase()===key)||rules.find(r=>{
    const name=r.name.toUpperCase();
    if(name==='ANTI')return /^ANTI[- ][A-Z /-]+ \d\+$/.test(key);
    return key.startsWith(name+' ')&&/^(?:\d+|D\d+(?:\+\d+)?)(?:\+)?$/.test(key.slice(name.length+1));
  });
}
function wbWeaponAbility(label,unitId){
  let key=String(label).trim().toUpperCase().replace(/[’']/g,"'");
  if(key==="C'TAN POWER")key="POWERS OF THE C'TAN";
  return (wbUnits().get(unitId)?.abilities||[]).findIndex(a=>a.name.toUpperCase().replace(/[’']/g,"'")===key&&wbDescription(a).trim());
}
function wbKeywordButton(label,unitId='',added=false,brackets=true){
  const rule=wbCoreRule(label),ability=rule?-1:wbWeaponAbility(label,unitId),title=brackets?`[${label.toUpperCase()}]`:label;
  return rule||ability>=0?`<button type="button" class="wb-weapon-keyword ${added?'wb-bonus':''} ${brackets?'':'wb-inline-rule'}" data-wb-rule="${esc(rule?.id||'')}" ${ability>=0?`data-wb-rule-unit="${esc(unitId)}" data-wb-rule-ability="${ability}"`:''} data-wb-rule-label="${esc(label)}" aria-haspopup="dialog" aria-label="Consulta la regola ${esc(label)}">${esc(title)}</button>`:`<span class="wb-weapon-keyword ${added?'wb-bonus':''}" title="Testo della regola non disponibile nel catalogo">${esc(title)}</span>`;
}
function wbWeaponKeywords(text,unitId='',added=[]){
  return String(text||'').split(/[,;\n]+|\]\s*(?=\[)/).map(s=>s.trim().replace(/^\[|\]$/g,'')).filter(Boolean).map(label=>{
    return wbKeywordButton(label,unitId,added.some(k=>k.toUpperCase()===label.toUpperCase()));
  }).join(' ');
}
function wbRuleInline(text,unitId=''){
  const names=[...(builderUi.catalog?.coreRules||[]),...(wbUnits().get(unitId)?.abilities||[])].map(r=>r.name).filter(n=>n&&n.length>3).sort((a,b)=>b.length-a.length);
  if(!names.length)return esc(text);
  const quote=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('(?<![\\w])(?:ANTI[- ][A-Za-z /-]+ \\d\\+|'+names.map(quote).join('|')+')(?: (?:D\\d+(?:\\+\\d+)?|\\d+)\\+?)?(?![\\w])','gi');
  let html='',last=0;
  for(const m of String(text).matchAll(pattern)){const core=wbCoreRule(m[0]),ambiguous=['ASSAULT','HEAVY','LANCE','PSYCHIC','PRECISION','PISTOL','ANTI','TORRENT','BLAST','MELTA'].includes(core?.name),bracketed=text[m.index-1]==='[',explicit=/^\s+(?:ability|keyword)\b/i.test(text.slice(m.index+m[0].length));html+=esc(text.slice(last,m.index))+(ambiguous&&!bracketed&&!explicit?esc(m[0]):wbKeywordButton(m[0],unitId,false,false));last=m.index+m[0].length;}
  return html+esc(text.slice(last));
}
function wbOpenRule(button){
  const rule=button.dataset.wbRuleUnit?wbUnits().get(button.dataset.wbRuleUnit)?.abilities[Number(button.dataset.wbRuleAbility)]:(builderUi.catalog?.coreRules||[]).find(r=>r.id===button.dataset.wbRule);
  if(!rule||!wbDescription(rule).trim())return;
  document.querySelector('.wb-rule-dialog')?.close();
  const dialog=document.createElement('dialog');dialog.className='workbench wb-detachment-dialog wb-rule-dialog';dialog.setAttribute('aria-labelledby','wb-rule-title');
  dialog.innerHTML=`<div class="wb-dialog-head"><h2 id="wb-rule-title">${wbText(button.dataset.wbRuleLabel||rule.name)}</h2><button type="button" autofocus>Chiudi</button></div><article class="wb-rule">${beRich(wbDescription(rule),button.dataset.wbRuleUnit||'')}</article><p class="wb-muted">${button.dataset.wbRuleUnit?wbText(wbUnits().get(button.dataset.wbRuleUnit).name):'Core Rules · '+wbText(rule.reference||'')}</p>`;
  document.body.append(dialog);dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const target=event.target.closest('[data-wb-rule]');if(target)wbOpenRule(target);});
  wbCloseOnBackdrop(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();if(button.isConnected)button.focus();},{once:true});dialog.showModal();
}
function wbWeaponTable(rows){
  const grouped=new Map();
  for(const row of rows){const w=row.weapon,key=JSON.stringify([row.unitId,row.origin,w.name,w.type,w.range,w.A,w.BS_WS,w.S,w.AP,w.D,wbDescription(w),w._addedKeywords||[],w._changed||[],w.enhancement_id||'']);const existing=grouped.get(key);if(existing){existing.count+=row.count;if(row.model&&!existing.models.includes(row.model))existing.models.push(row.model);}else grouped.set(key,{...row,models:row.model?[row.model]:[]});}
  rows=[...grouped.values()].map(row=>({...row,model:row.models.join(', ')}));
  const families=new Map();
  for(const row of rows){const parts=row.weapon.name.split(/\s+[–—-]\s+/),base=parts.length>1?parts[0]:row.weapon.name,key=JSON.stringify([row.unitId,row.origin,row.model,row.count,row.weapon.type,base,row.weapon.enhancement_id||'']);if(!families.has(key))families.set(key,[]);families.get(key).push({...row,base,mode:parts.slice(1).join(' – ')});}
  const renderRow=({weapon:w,count,origin,model,unitId,mode},multi)=>`<tr class="${multi?'wb-weapon-mode':''}"><th scope="row">${origin||model?`<small class="wb-weapon-origin">${[origin,model].filter(Boolean).map(wbText).join(' · ')}</small>`:''}<span class="wb-weapon-name">${multi?`<span class="wb-mode-marker" aria-label="Profilo alternativo">↳</span> ${wbText(w.name.replace(/\s+[–—-]\s+/g," - "))}`:wbText(w.name)}${count>1?` <strong class="wb-weapon-count">(×${count})</strong>`:''}</span><div class="wb-weapon-keywords">${wbWeaponKeywords(wbDescription(w),unitId,w._addedKeywords||[])}</div></th>${[/^\d+$/.test(w.range)?w.range+'"':w.range,w.A,wbPlus(w.BS_WS),w.S,w.AP,w.D].map((v,i)=>`<td class="${w._changed?.includes(['range','A','BS_WS','S','AP','D'][i])?'wb-bonus':''}">${wbText(v)}</td>`).join('')}</tr>`;
  return `<div class="wb-table wb-weapon-table" tabindex="0" role="region" aria-label="Profili delle armi, tabella scorrevole"><table><thead><tr>${['Arma','Gittata','A','BS/WS','S','AP','D'].map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${[...families.values()].map(family=>{const multi=family.length>1&&family.some(row=>row.mode);return family.map(row=>renderRow(row,multi)).join('');}).join('')}</tbody></table></div>`;
}
function wbModelCards(rows){
  return `<div class="wb-table wb-defence-table" tabindex="0" role="region" aria-label="Profili difensivi, tabella scorrevole"><table><thead><tr>${['Modello','M','T','Sv','Inv','W','Ld','OC','Base'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${wbText(row[0])}</th>${row.slice(1,9).map((v,i)=>`<td class="${row[9]?.includes(['M','T','Sv','inv_sv','W','Ld','OC','base_size'][i])?'wb-bonus':''}">${wbText(v)||'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function wbStratagemTurn(turn){
  const key=String(turn||'').replace(/[’']/g,'').toLowerCase().trim();
  return key==='your turn'?'your':key==='opponents turn'?'opponent':key==='either players turn'?'either':'unknown';
}
function wbStratagemBody(text){
  const parts=String(text).split(/(?:^|\n)\s*(WHEN|TARGET|EFFECT|RESTRICTIONS|DURATION|COST):\s*/g);
  let html=parts[0].trim()?beRich(parts[0]):'';
  for(let i=1;i<parts.length;i+=2)html+=`<section class="wb-stratagem-field"><h5>${esc(parts[i])}</h5>${beRich(parts[i+1]||'')}</section>`;
  return html;
}
function wbStratagems(rows,contextDetachment=null){
  return `<div class="wb-stratagems">${rows.filter(s=>wbPlayableStratagem(s)||contextDetachment&&s.detachment_id===contextDetachment&&!/boarding|combat patrol/i.test(s.type||'')).map(s=>`<details class="wb-stratagem wb-turn-${wbStratagemTurn(s.turn)}"><summary><span>${wbText(s.name)}</span><strong class="wb-cp">${wbText(s.cp_cost??'—')} CP</strong></summary><div class="wb-stratagem-meta"><p>${wbText(s.type)}</p><p>${wbText(s.turn||'Turno non specificato')} · ${wbText(s.phase||'Fase non specificata')}</p></div><div class="wb-rule wb-stratagem-body">${wbStratagemBody(wbDescription(s))}</div>${s.usedBy?`<p class="wb-muted wb-stratagem-users">${wbText(s.usedBy)}</p>`:''}</details>`).join('')}</div>`;
}
function wbPlayableStratagem(s){return !/boarding|combat patrol/i.test(s.type||'')&&(!s.detachment_id||builderUi.army.detachmentIds.includes(s.detachment_id));}
function wbRules(rows,unitId=''){return rows.map(r=>{
  let description=wbDescription(r);const core=wbCoreRule(r.name);
  // Some old exports contain only a repeated title/reference in place of the rule.
  if(core&&(!description.trim()||description.replace(/\s|24\.\d{2}/g,'').toUpperCase()===String(r.name).replace(/\s/g,'').toUpperCase()))description=wbDescription(core);
  const name=r.name||description,parameter=String(r.parameter||'').trim();
  const ruleName=parameter&&!name.toUpperCase().endsWith(' '+parameter.toUpperCase())?wbText(name.replace(/\s+X$/i,''))+` <span class="wb-rule-parameter">${wbText(parameter)}</span>`:wbText(name);
  const label=(r._bearerModel?wbText(r._bearerModel)+' · ':'')+ruleName+(r.upgrade==='true'?' · Upgrade':''),title=r._added?`<span class="wb-bonus">${label}</span>`:label,body=r.name?beRich(description,unitId):'';
  const long=description.length>450;
  return `<details class="wb-rule wb-rule-card${long?' wb-rule-long':''}"${long?'':' open'}><summary><strong>${title}</strong>${long?'<span>Leggi regola</span>':''}</summary><div>${body}</div></details>`;
}).join('');}
function wbSheetRules(unit,enhancements=[]){
  const generic=r=>/^(Core|Faction|Army)$/i.test(r.type||''),own=unit.abilities.filter(r=>!generic(r)),other=unit.abilities.filter(generic);
  return `<div class="wb-own-rules">${wbRules(own,unit.id)}${wbRules(enhancements,unit.id)}</div>${other.length?`<details class="wb-other-rules"><summary>Altre regole <small>${other.length}</small></summary>${wbRules(other,unit.id)}</details>`:''}`;
}
function wbProfiles(u,e,play,controls=''){
  const effective=beEffects(u,e);u=effective.unit;
  const weapons=u.weapons.filter(w=>w.name&&(!e || Number(e.weaponCounts[w.line]||0)>0)&&(!w.enhancement_id||e?.enhancementIds.includes(w.enhancement_id)));
  const unconfigured=e && u.weapons.some(w=>w.name) && !Object.values(e.weaponCounts).some(n=>n>0);
  const models=wbModelCards(u.models.map(m=>[m.name+(m._count?' · '+m._count+'×':''),m.M,m.T,m.Sv,wbPlus(m.inv_sv)||'—',m.W,m.Ld,m.OC,m.base_size,m._changed]));
  const weaponTable=type=>{const rows=wbProfileWeapons(u,e,type);return rows.length?wbWeaponTable(rows):'';};
  const enhancements=e?u.enhancements.filter(x=>e.enhancementIds.includes(x.id)):[];
  const stratagems=u.stratagems.map(ref=>(builderUi.catalog.stratagems||[]).find(s=>s.id===ref.id)||ref).filter(s=>!s.detachment_id||builderUi.army.detachmentIds.includes(s.detachment_id));
  return `<section class="wb-profiles"><h3>${wbText(u.name)}${e?.warlord?' · Warlord':''}</h3>${models}${controls}${stratagems.length?`<details class="wb-unit-stratagems"><summary>Stratagemmi (${stratagems.filter(wbPlayableStratagem).length})</summary>${wbStratagems(stratagems)}</details>`:''}
    ${unconfigured?'<p class="wb-warning">Dotazione da configurare in Build: i profili delle armi non sono ancora selezionati.</p>':''}
    ${weaponTable('Ranged')?`<h4>Armi a distanza</h4>${weaponTable('Ranged')}`:''}${weaponTable('Melee')?`<h4>Armi da mischia</h4>${weaponTable('Melee')}`:''}
    ${effective.sources.length?`<details class="wb-effects"><summary>Bonus evidenziati in blu</summary><p>Il blu indica una differenza rispetto al profilo base. Fonti:</p>${effective.sources.map(s=>`<p>${esc(s)}</p>`).join('')}</details>`:''}<h4>Abilità e regole</h4>${wbSheetRules(u,enhancements)}
    ${u.leaderText.trim()?wbRules([{name:'Leader / Support',description:u.leaderText}],u.id):''}
    <p class="wb-keywords">${wbRuleInline(u.keywords,u.id)}</p>
    </section>`;
}
function wbAttachedProfiles(group,controls=''){
  const units=wbUnits(),members=group.map(entry=>({entry,...beEffects(units.get(entry.unitId),entry)}));
  const models=members.flatMap(({entry,unit})=>unit.models.map(model=>[`${unit.name} · ${model.name}${model._count?' · '+model._count+'×':''}`,model.M,model.T,model.Sv,wbPlus(model.inv_sv)||'—',model.W,model.Ld,model.OC,model.base_size,model._changed]));
  const weapons=type=>members.flatMap(({entry,unit})=>wbProfileWeapons(unit,entry,type,unit.name));
  const ranged=weapons('Ranged'),melee=weapons('Melee');
  const unconfigured=members.filter(({entry,unit})=>unit.weapons.some(w=>w.name)&&!Object.values(entry.weaponCounts).some(n=>n>0));
  const stratagemMap=new Map();
  for(const {unit} of members)for(const ref of unit.stratagems){
    const s=(builderUi.catalog.stratagems||[]).find(s=>s.id===ref.id)||ref;
    if(s.detachment_id&&!builderUi.army.detachmentIds.includes(s.detachment_id))continue;
    const existing=stratagemMap.get(s.id);if(existing){if(!existing.units.includes(unit.name))existing.units.push(unit.name);}else stratagemMap.set(s.id,{...s,units:[unit.name]});
  }
  const groupStratagems=[...stratagemMap.values()].map(s=>({...s,usedBy:s.units.join(' · ')}));
  return `<section class="wb-attached-profiles"><h3>Profili dei modelli</h3>${wbModelCards(models)}${controls}${groupStratagems.length?`<details class="wb-unit-stratagems"><summary>Stratagemmi del gruppo (${groupStratagems.filter(wbPlayableStratagem).length})</summary>${wbStratagems(groupStratagems)}</details>`:''}
    ${unconfigured.length?`<p class="wb-warning">Dotazione da configurare: ${unconfigured.map(({unit})=>wbText(unit.name)).join(', ')}.</p>`:''}
    <h3>Armi a distanza</h3>${ranged.length?wbWeaponTable(ranged):'<p class="wb-muted">Nessun profilo selezionato.</p>'}
    <h3>Armi da mischia</h3>${melee.length?wbWeaponTable(melee):'<p class="wb-muted">Nessun profilo selezionato.</p>'}
    ${members.some(m=>m.sources.length)?`<details class="wb-effects"><summary>Bonus evidenziati in blu · fonti</summary>${[...new Set(members.flatMap(m=>m.sources))].map(s=>`<p>${esc(s)}</p>`).join('')}</details>`:''}<h3>Abilità e regole del gruppo</h3>${members.map(({entry,unit})=>{
      const enhancements=unit.enhancements.filter(x=>entry.enhancementIds.includes(x.id));
      return `<section class="wb-member-rules"><h4>${wbText(unit.name)}${entry.warlord?' · Warlord':''}</h4>${wbSheetRules(unit,enhancements)}${unit.leaderText.trim()?wbRules([{name:"Leader · unità compatibili",description:unit.leaderText}],unit.id):''}<p class="wb-keywords">${wbRuleInline(unit.keywords,unit.id)}</p></section>`;
    }).join('')}</section>`;
}
function wbDetail(){
  const units=wbUnits(), e=wbEntry(workbench.selected), u=units.get(e?.unitId||workbench.preview);
  if(!u)return '<div class="wb-empty"><h2>Dettaglio unità</h2><p>Seleziona un’unità per leggere profili e regole.</p></div>';
  if(!e)return `<div class="wb-detail-head"><h2>${wbText(u.name)}</h2><button data-wb-add="${u.id}">Aggiungi unità</button></div>${wbProfiles(u,null,false)}`;
  const group=wbGroup(e.attachedTo?(wbEntry(e.attachedTo)||e):e),controls=workbench.mode==='build'?wbUnitControls(u,e):'';
  return workbench.mode==='play'?wbAttachedProfiles(group):wbProfiles(u,e,false,controls);
}
function wbOpenUnitOptions(entryId,trigger){
  const entry=wbEntry(entryId);if(!entry)return;const unit=wbUnits().get(entry.unitId);
  const dialog=wbModal('Opzioni · '+unit.name,`<label>Correzione temporanea dei punti<input data-wb-override-points type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Usa i punti del catalogo" value="${entry.manualPoints??''}"></label><p class="wb-muted">Lascia vuoto per ripristinare il costo automatico.</p><label>Note sull’unità<textarea data-wb-unit-notes maxlength="4000" rows="3">${esc(entry.notes)}</textarea></label><button data-wb-unit-options-save type="button">Applica</button><p data-wb-unit-options-status role="status"></p>`,trigger);
  dialog.querySelector('[data-wb-unit-options-save]').onclick=()=>{const text=dialog.querySelector('[data-wb-override-points]').value.trim(),n=Number(text);if(text!==''&&(!/^\d+$/.test(text)||!Number.isInteger(n)||n>20000)){dialog.querySelector('[data-wb-unit-options-status]').textContent='Inserisci punti interi fra 0 e 20000, oppure lascia vuoto.';return;}entry.manualPoints=text===''?null:n;entry.notes=dialog.querySelector('[data-wb-unit-notes]').value.slice(0,4000);dialog.close();wbChanged();};
}
function wbErrorNotices(errors){
  const a=builderUi.army,context=a.id||a.entries[0]?.entryId||'empty';
  if(workbench.errorNoticeContext!==context){workbench.errorNoticeContext=context;workbench.hiddenErrors=[];}
  workbench.hiddenErrors=workbench.hiddenErrors.filter(error=>errors.includes(error));
  const visible=errors.filter(error=>!workbench.hiddenErrors.includes(error));
  return visible.length?`<aside class="wb-error-notices" aria-label="Errori della lista">${visible.map(error=>`<div class="wb-error-notice" role="alert"><p>${esc(error)}</p><button type="button" data-wb-dismiss-error="${esc(error)}" aria-label="Chiudi avviso">×</button></div>`).join('')}</aside>`:'';
}
function wbUnitControls(u,e){
  const units=wbUnits(),upgrades=beEnhancementsHtml(u,e);
  const targets=wbAttachmentTargets(e),canAttach=u.support||u.leads.length>0||u.abilities.some(r=>/^Leader$/i.test(r.name||''));
  const unresolved=e.attachedTo&&!targets.some(x=>x.entryId===e.attachedTo);
  return `<section class="wb-unit-controls"><div class="wb-unit-control-head"><h4>${wbText(u.name)} · ${wbPrice(e)??'?'} pt</h4><button id="wb-unit-options-${esc(e.entryId)}" data-wb-unit-options="${esc(e.entryId)}" type="button" aria-label="Opzioni unità ${esc(u.name)}" aria-haspopup="dialog">⋯</button></div><div class="wb-control-row">
    ${wbSizes(u).length>1?wbNumber('Miniature','models',e.models,wbSizes(u)[0],wbSizes(u).at(-1)):`<p class="wb-muted">${e.models} modelli</p>`}
    ${/\bCharacter\b/i.test(u.keywords)?`<label class="wb-check"><input data-wb-field="warlord" type="checkbox" ${e.warlord?'checked':''}> Warlord</label>`:e.warlord?'<button id="wb-clear-warlord">Rimuovi Warlord non valido</button>':''}
    </div>
    ${canAttach||e.attachedTo?`<label>Associa a un’unità<select data-wb-field="attachedTo"><option value="">${u.support?'Da associare':'Unità indipendente'}</option>${unresolved?`<option value="${esc(e.attachedTo)}" selected>Associazione precedente da verificare</option>`:''}${targets.map(x=>`<option value="${esc(x.entryId)}" ${e.attachedTo===x.entryId?'selected':''}>${esc(wbInstanceName(x))}</option>`).join('')}</select></label>${!targets.length?'<p class="wb-muted">Nessuna destinazione compatibile disponibile nella lista.</p>':''}${unresolved?'<p class="wb-warning">L’associazione salvata richiede verifica. Puoi rimuoverla o scegliere una destinazione compatibile.</p>':''}`:''}
    ${beCompositionHtml(u,e)}<div class="wb-loadout">${beLoadoutHtml(u,e)}
    ${u.weapons.filter(w=>w.name&&(!w.enhancement_id||e.enhancementIds.includes(w.enhancement_id))&&((u.options.length>0&&(!e.loadoutSelections||!beManagedWeapon(u.loadoutRecipe,w.line)))||w.enhancement_id)).filter(w=>beWeaponModes(u,w.line)[0]?.line===w.line).map(w=>{const n=e.weaponCounts[w.line]||0;return `<div class="wb-weapon"><span>${wbText(w.name)}<small>${wbText(w.type)} · ${wbText(wbDescription(w))}</small></span>${w.enhancement_id?`<span>1 · ${u.enhancements.find(x=>x.id===w.enhancement_id)?.upgrade==='true'?'Upgrade':'Enhancement'}</span>`:`<div class="wb-quantity" role="group" aria-label="Quantità ${esc(w.name)}"><button id="wb-weapon-${esc(w.line)}-minus" data-wb-weapon-line="${esc(w.line)}" data-wb-weapon-step="-1" aria-label="Diminuisci ${esc(w.name)}" ${n===0?'disabled':''} type="button">−</button><output aria-label="Quantità ${esc(w.name)}">${n}</output><button id="wb-weapon-${esc(w.line)}-plus" data-wb-weapon-line="${esc(w.line)}" data-wb-weapon-step="1" aria-label="Aumenta ${esc(w.name)}" ${n>=beWeaponLimit(u,e,w.line)?'disabled':''} type="button">+</button></div>`}</div>`;}).join('')}
    </div>${upgrades?`<section class="wb-upgrades">${upgrades}</section>`:''}
    ${u.options.length?`<details class="wb-loadout-source"><summary>Opzioni di equipaggiamento</summary><p class="wb-rule-text">${wbText(u.loadout)}</p>${u.options.map(o=>`<p class="wb-rule-text">${wbText(wbDescription(o))}</p>`).join('')}</details>`:''}
    ${new Set(u.points.map(p=>[p.models,p.points,p.first??1,p.last??200].join(':'))).size>1||u.composition.length>1?`<details><summary>Costi e composizione</summary>${wbCosts(u)}</details>`:''}</section>`;
}
function builderWorkbenchRender(){
  if(page()!=='builder')return;
  if(builderUi.view==='archive'){builderArchiveRender();return;}
  const a=builderUi.army, f=wbFaction(), units=wbUnits(), totals=builderWorkbenchTotals();
  const old=main.querySelector('.workbench');
  if(old)for(const el of old.querySelectorAll('[data-wb-scroll]'))if(el.getClientRects().length)workbench.scrollPositions[el.dataset.wbScroll]=el.scrollTop;
  const positions=Object.entries(workbench.scrollPositions);
  const configurationOpen=old?.querySelector('.wb-configuration')?.open;
  const focused=document.activeElement;const focusKey=focused?.getAttribute('data-wb-weapon');
  const focusedId=old?.contains(focused)?focused?.id:null;
  const focusedDetachment=focused?.getAttribute('data-wb-detachment');
  const roots=workbench.mode==='play'?a.entries.filter(e=>!e.attachedTo):a.entries;
  main.innerHTML=`<section class="workbench" data-mode="${workbench.mode}" data-pane="${workbench.pane}" aria-label="Army Builder 11ª edizione">
    ${wbMobileHeader(totals)}
    <div class="wb-heading"><button id="wb-archive">Torna alle armate</button><div><p class="wb-muted">Warhammer 40.000 · 11ª edizione</p><h1>Army Builder</h1></div><div class="wb-mode" role="group" aria-label="Modalità"><button data-wb-mode="build" aria-pressed="${workbench.mode==='build'}">Build</button><button data-wb-mode="play" aria-pressed="${workbench.mode==='play'}">Play mode</button></div></div>
    <div class="wb-toolbar"><label class="wb-name">Nome armata<input id="wb-name" maxlength="100" value="${esc(a.name)}"></label><div class="wb-score" role="status"><strong>${totals.total}<small> / ${a.limit} pt</small></strong><span>${esc(wbDpSummary())}${totals.issues.length?` · ${totals.issues.length} avvisi`:''}</span></div><div class="wb-toolbar-actions"><span id="wb-save-state" role="status">${workbench.dirty?'Modifiche non salvate':'Bozza'}</span><button id="wb-save" class="primary" ${builderUi.pending?'disabled':''}>${builderUi.pending?'Salvataggio…':'Salva armata'}</button>${workbench.mode==='play'?'<button id="wb-stratagems">Stratagemmi</button>':''}<button id="wb-export">Esporta lista</button><button id="wb-backup">Backup JSON</button></div></div>
    ${workbench.mode==='build'?wbArmySettings(configurationOpen??false):''}
    ${builderUi.active&&a.catalogId!==builderUi.active.catalogId?'<div class="wb-catalog-update"><p>Questa lista conserva i dati originali. Crea una copia per usare le nuove dotazioni e gli alleati.</p><button id="wb-copy-active">Crea copia col catalogo attivo</button></div>':''}
    ${wbErrorNotices(totals.errors)}
    <div class="wb-mobile-tabs" role="group" aria-label="Pannelli">${workbench.mode==='build'?`<button data-wb-pane="catalog" aria-pressed="${workbench.pane==='catalog'}">Catalogo</button>`:''}<button data-wb-pane="roster" aria-pressed="${workbench.pane==='roster'}">Armata</button><button data-wb-pane="detail" aria-pressed="${workbench.pane==='detail'}">Dettaglio</button></div>
    <div class="wb-columns"><aside class="wb-panel wb-catalog" data-wb-scroll="catalog"><h2>Catalogo unità</h2><div class="wb-catalog-tools"><label>Cerca<span class="wb-search-field"><input id="wb-search" type="search" value="${esc(workbench.search)}" placeholder="Nome o keyword"><button type="button" data-wb-desktop-clear aria-label="Cancella ricerca" ${workbench.search?'':'hidden'}>×</button></span></label><button id="wb-filters" aria-haspopup="dialog">Filtri</button></div>
    <details><summary>Alleati disponibili · ${beAllyRules().length} contingenti</summary>${beAllyRules().map(r=>`<p class="wb-muted">${esc(r.name)}${r.points[a.limit]!==undefined?" · "+r.points[a.limit]+" pt":""} · ${r.unitIds.length} schede</p>`).join("")||"<p>Nessun contingente esterno per le selezioni attuali.</p>"}</details><div id="wb-catalog-list">${wbCatalogList()}</div></aside>
    <section class="wb-panel wb-roster" data-wb-scroll="roster"><h2>${workbench.mode==='play'?'Unità in campo':'La tua armata'}</h2>
    <div class="wb-roster-list">${wbRosterRows()}</div>
    <details class="wb-validation"><summary>Verifiche · ${totals.issues.length} avvisi</summary><p>Equipaggiamenti, eccezioni e combinazioni richiedono verifica manuale.</p>${totals.issues.map(i=>`<p class="wb-warning">${esc(i)}</p>`).join('')}</details></section>
    <aside class="wb-panel wb-detail" data-wb-scroll="detail" aria-label="Profili e regole">${wbIsPhone()&&workbench.pane!=='detail'?'':wbDetail()}</aside></div>
    ${workbench.mode==='build'&&workbench.pane!=='detail'?'<button class="wb-mobile-add" data-wb-open-catalog="" aria-label="Aggiungi unità dal catalogo" aria-haspopup="dialog">+</button>':''}
  </section>`;
  wbBind();
  for(const [key,top] of positions){const el=main.querySelector(`[data-wb-scroll="${key}"]`);if(el)el.scrollTop=top;}
  if(focusedId){const next=document.getElementById(focusedId);if(next?.disabled)next.closest('.wb-quantity')?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});else next?.focus({preventScroll:true});}
  if(focusedDetachment)main.querySelector(`[data-wb-detachment="${focusedDetachment}"]`)?.focus({preventScroll:true});
  if(focusKey!==null&&focusKey!==undefined)main.querySelector(`[data-wb-weapon="${focusKey}"]`)?.focus({preventScroll:true});
}
function wbDownload(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function wbSave(){
  if(builderUi.pending)return;
  const revision=workbench.revision, snapshot=builderClone(builderUi.army);builderUi.pending=true;builderWorkbenchRender();
  try{const r=await api('builderSave',snapshot);if(workbench.revision===revision){builderUi.army=r.army;workbench.dirty=false;}else builderUi.army.id=r.army.id;builderUi.armies=(await api('builderArmies')).armies;notify(r.validation?.errors?.length?'Bozza salvata. Correggi gli errori prima di giocare.':'Armata salvata. Restano i controlli manuali sulle regole.');}
  catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderWorkbenchRender();}
}
function wbBind(container=null){
  const root=container||main.querySelector('.workbench'),a=builderUi.army;
  const on=(selector,event,handler)=>root.querySelectorAll(selector).forEach(el=>el.addEventListener(event,()=>handler(el)));
  on('[data-wb-mobile-save]','click',wbSave);
  on('[data-wb-mobile-menu]','click',wbOpenMobileMenu);
  on('[data-wb-open-catalog]','click',el=>wbOpenMobileCatalog(el.dataset.wbOpenCatalog,el));
  on('[data-wb-return-roster]','click',()=>{workbench.pane='roster';workbench.selected=null;workbench.preview=null;builderWorkbenchRender();});
  on('[data-wb-mode]','click',el=>wbSetMode(el.dataset.wbMode));
  on('[data-wb-rule]','click',wbOpenRule);
  on('[data-wb-unit-options]','click',el=>wbOpenUnitOptions(el.dataset.wbUnitOptions,el));
  on('[data-wb-dismiss-error]','click',el=>{workbench.hiddenErrors.push(el.dataset.wbDismissError);builderWorkbenchRender();main.querySelector('.wb-validation>summary')?.focus({preventScroll:true});});
  on('[data-wb-detachment-rule]','click',el=>{const d=wbDetachments().find(d=>d.id===el.dataset.wbDetachmentRule);if(d)wbModal(d.name,wbDetachmentSections(d),el);});
  on('#wb-stratagems','click',el=>wbModal('Stratagemmi · Core e distaccamenti',wbStratagems(wbAllStratagems()),el));
  on('#wb-filters','click',wbOpenFilters);
  on('[data-wb-adjust]','click',el=>{
    const field=el.dataset.wbAdjust,delta=Number(el.dataset.wbStep);
    if(field==='models'){const entry=wbEntry(workbench.selected),sizes=wbSizes(wbUnits().get(entry.unitId)),next=delta>0?sizes.find(n=>n>entry.models):sizes.slice().reverse().find(n=>n<entry.models);if(next!==undefined)beResize(entry,next);}
    else {const value=a[field]+delta,min=field==='limit'?100:0,max=field==='limit'?5000:20;if(value<min||value>max)return;a[field]=value;if(field==='limit'&&[1000,2000].includes(value))a.dpLimit=value===1000?2:3;}
    wbChanged();
  });
  on('#wb-clear-warlord','click',()=>{wbEntry(workbench.selected).warlord=false;wbChanged();});
  on('[data-wb-pane]','click',el=>{workbench.pane=el.dataset.wbPane;builderWorkbenchRender();});
  on('[data-wb-detail]','click',el=>{workbench.detailTab=el.dataset.wbDetail;builderWorkbenchRender();});
  const catalog=root.querySelector('#wb-catalog-list');if(catalog){catalog.addEventListener('click',event=>{const button=event.target.closest('[data-wb-add],[data-wb-preview]');if(!button||!catalog.contains(button))return;if(button.dataset.wbAdd)wbAdd(button.dataset.wbAdd);else wbSelect(button.dataset.wbPreview,true);});catalog.addEventListener('toggle',event=>{if(event.target.dataset.wbCategory)workbench.categoryOpen[a.factionId+':'+event.target.dataset.wbCategory]=event.target.open;},true);}
  on('.wb-detail [data-wb-add]','click',el=>wbAdd(el.dataset.wbAdd));on('[data-wb-select]','click',el=>wbSelect(el.dataset.wbSelect));
  on('[data-wb-remove]','click',el=>{const id=el.dataset.wbRemove;a.entries=a.entries.filter(e=>e.entryId!==id);a.entries.forEach(e=>{if(e.attachedTo===id)e.attachedTo=null;});if(workbench.selected===id)workbench.selected=null;wbChanged();});
  on('[data-wb-duplicate]','click',el=>{if(a.entries.length>=200)return;const e=builderClone(wbEntry(el.dataset.wbDuplicate));e.entryId=wbId();e.attachedTo=null;e.warlord=false;a.entries.push(e);workbench.selected=e.entryId;wbChanged();});
  on('#wb-name','input',el=>{a.name=el.value;wbChanged(false);root.querySelector('#wb-save-state').textContent='Modifiche non salvate';});
  on('#wb-search','input',el=>wbSearch(el.value));
  on('[data-wb-desktop-clear]','click',()=>{const search=root.querySelector('#wb-search');search.value='';wbSearch('');search.focus();});
  on('#wb-archive','click',builderArchive);
  on('#wb-faction','change',el=>{if(a.entries.length&&!confirm('Cambiare fazione mantenendo le unità attuali come selezioni da verificare?')){el.value=a.factionId;return;}a.factionId=el.value;a.detachmentIds=[];a.disposition='';workbench.catalogFaction=el.value;wbChanged();});
  on('#wb-disposition','change',el=>{a.disposition=el.value;wbChanged();});
  on('#wb-detachments','click',wbOpenDetachments);
  on('[data-wb-field]','change',el=>{const e=wbEntry(workbench.selected),field=el.dataset.wbField;if(!e)return;if(field==='models'){const n=Number(el.value);if(Number.isInteger(n)&&n>=1&&n<=200)beResize(e,n);}else if(field==='manualPoints'){const n=Number(el.value);if(el.value==='')e.manualPoints=null;else if(Number.isInteger(n)&&n>=0&&n<=20000)e.manualPoints=n;}else if(field==='warlord'){a.entries.forEach(x=>x.warlord=false);e.warlord=el.checked;}else if(field==='attachedTo'){if(el.value&&!wbAttachmentTargets(e).some(x=>x.entryId===el.value)){notify('Questa unità non è una destinazione compatibile.',true);return;}e.attachedTo=el.value||null;}else e.notes=el.value;wbChanged();});
  on('[data-wb-weapon-step]','click',el=>wbChangeWeapon(el.dataset.wbWeaponLine,Number(el.dataset.wbWeaponStep)));
  on('[data-wb-choice-radio]','change',el=>{if(beChangeChoice(wbEntry(workbench.selected),el.dataset.wbChoiceRadio,el.value,1))wbChanged();else builderWorkbenchRender();});
  on('[data-wb-enhancement]','change',el=>{const e=wbEntry(workbench.selected),id=el.dataset.wbEnhancement;e.enhancementIds=el.checked?[...e.enhancementIds,id]:e.enhancementIds.filter(x=>x!==id);beSyncEnhancements(wbUnits().get(e.unitId),e);wbChanged();});
  on('[data-wb-enhancement-model]','change',el=>{const e=wbEntry(workbench.selected);e.enhancementModels??={};if(el.value)e.enhancementModels[el.dataset.wbEnhancementModel]=el.value;else delete e.enhancementModels[el.dataset.wbEnhancementModel];wbChanged();});
  on('#wb-save','click',wbSave);on('#wb-copy-active','click',beCopyActive);
  on('#wb-new','click',builderCreate);
  on('[data-wb-open]','click',el=>builderOpen(el.dataset.wbOpen));
  on('[data-wb-delete]','click',async el=>{if(!confirm('Eliminare questa armata salvata?'))return;try{await api('builderDelete',{id:el.dataset.wbDelete});builderUi.armies=(await api('builderArmies')).armies;if(a.id===el.dataset.wbDelete){a.id=null;wbChanged(false);}builderWorkbenchRender();}catch(e){notify(e.message,true);}});
  on('#wb-import','click',()=>builderImportFile(root.querySelector('#wb-import-file').files[0]));
  on('#wb-backup','click',()=>wbDownload('armata-11.json',JSON.stringify(a,null,2),'application/json'));
  on('#wb-restore','change',el=>builderRestoreFile(el.files[0]));
  on('#wb-export','click',beExport);
  on('[data-wb-filter]','change',el=>{workbench.filters[el.dataset.wbFilter]=el.checked;wbSearch(workbench.search);});
  on('[data-wb-choice]','click',el=>{const e=wbEntry(workbench.selected);if(beChangeChoice(e,el.dataset.wbChoice,el.dataset.wbOption,Number(el.dataset.wbDelta)))wbChanged();});
  on('[data-wb-loadout-picker]','change',el=>{const e=wbEntry(workbench.selected);if(el.value&&beChangeChoice(e,el.dataset.wbLoadoutPicker,el.value,1))wbChanged();});
  on('[data-wb-model-step]','click',el=>{const e=wbEntry(workbench.selected),u=wbUnits().get(e.unitId),next=beModelChange(u,e,el.dataset.wbModel,Number(el.dataset.wbModelStep));if(next){e.loadoutSelections=next;beSync(u,e);wbChanged();}});
  on('[data-wb-formation]','change',el=>{const e=wbEntry(workbench.selected),u=wbUnits().get(e.unitId),layout=u.loadoutRecipe.layouts[Number(el.value)];if(layout&&beResize(e,Object.values(layout.counts).reduce((a,b)=>a+b,0),layout.counts))wbChanged();});
  on('#wb-manual','click',()=>{const e=wbEntry(workbench.selected);delete e.loadoutSelections;wbChanged();});
  on('#wb-standard','click',()=>{const e=wbEntry(workbench.selected);if(beStandard(e))wbChanged();});
  on('#wb-default-save','click',beSaveDefault);on('#wb-default-delete','click',beDeleteDefault);
}
if(typeof window!=='undefined'){
  if(typeof matchMedia==='function')matchMedia('(max-width:850px)').addEventListener('change',()=>{if(builderUi.view==='editor'&&page()==='builder')builderWorkbenchRender();});
  window.addEventListener('beforeunload',event=>{if(builderHasUnsaved()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>document.querySelectorAll('dialog.workbench[open]').forEach(dialog=>dialog.close()));
}
