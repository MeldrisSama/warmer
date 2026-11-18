'use strict';

const workbench={mode:'build',pane:'roster',detailTab:'profiles',selected:null,preview:null,dirty:false,revision:0,search:'',catalogFaction:null};
const wbUnits=()=>new Map((builderUi.catalog?.units||[]).map(u=>[u.id,u]));
const wbEntry=id=>builderUi.army.entries.find(e=>e.entryId===id);
const wbFaction=()=>builderUi.catalog.factions.find(f=>f.id===builderUi.army.factionId);
const wbText=value=>esc(String(value??'').replace(/<br\s*\/?>|<\/p>|<\/li>/gi,'\n').replace(/<[^>]*>/g,''));
const wbId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const wbDescription=row=>row.description||(builderUi.catalog.texts||[]).find(t=>t.id===row.descriptionRef)?.description||'';
const wbPlus=value=>/^\d+$/.test(String(value))?value+'+':value;
function wbDetachments(){return wbFaction().detachments.filter(d=>builderUi.army.detachmentIds.includes(d.id));}
function wbDetachmentConflict(candidate){
  if(builderUi.army.detachmentIds.includes(candidate.id))return '';
  const selected=wbDetachments(),tag=(candidate.unique||'').trim();
  if(tag&&selected.some(d=>(d.unique||'').trim()===tag))return tag;
  if(selected.reduce((n,d)=>n+Number(d.dp),0)+Number(candidate.dp)>builderUi.army.dpLimit)return 'Budget DP insufficiente';
  return '';
}
function wbDetachmentChoices(){return wbFaction().detachments.map(d=>{const conflict=wbDetachmentConflict(d);return `<label class="wb-check"><input data-wb-detachment="${d.id}" type="checkbox" ${builderUi.army.detachmentIds.includes(d.id)?'checked':''} ${conflict?'disabled':''}><span>${esc(d.name)} <small>${esc(d.dp)} DP${d.unique?' · '+esc(d.unique):''}</small><small>${esc(d.force_disposition||'')}</small>${conflict?`<small class="wb-warning">${esc(conflict)}</small>`:''}</span></label>`;}).join('');}
function wbArmyRules(){return wbDetachments().map(d=>`<details><summary>${esc(d.name)} · ${esc(d.dp)} DP</summary><p>${esc(d.force_disposition||'')}${d.unique?' · '+esc(d.unique):''}</p><p class="wb-rule-text">${wbText(d.description||'')}</p></details>`).join('');}
function builderWorkbenchNewArmy(){
  return {id:null,schemaVersion:2,name:'Nuova armata',edition:'11',catalogId:builderUi.catalog.catalogId,factionId:builderUi.catalog.factions[0].id,detachmentIds:[],disposition:'',limit:2000,dpLimit:3,entries:[]};
}
function wbPrice(entry,entries=builderUi.army.entries){
  const u=wbUnits().get(entry.unitId), ordinal=entries.slice(0,entries.indexOf(entry)+1).filter(e=>e.unitId===entry.unitId).length;
  const p=u?.points.find(p=>p.models===entry.models && ordinal>=p.first && ordinal<=p.last);
  return entry.manualPoints??p?.points??null;
}
function builderWorkbenchTotals(){
  const a=builderUi.army, units=wbUnits(), issues=[]; let total=0, enhancements=0;
  for(const e of a.entries){
    const u=units.get(e.unitId);if(!u)continue;
    const price=wbPrice(e);total+=price??0;
    if(price===null)issues.push(`${u.name}: costo da inserire manualmente.`);
    total+=e.enhancementIds.reduce((sum,id)=>sum+Number(u.enhancements.find(x=>x.id===id)?.cost||0),0);enhancements+=e.enhancementIds.length;
    if(!wbFaction().unitIds.includes(e.unitId))issues.push(`${u.name}: alleato da verificare.`);
    if(u.support&&!e.attachedTo)issues.push(`${u.name}: associa il support a un’unità.`);
    if(e.attachedTo&&!u.leads.includes(wbEntry(e.attachedTo)?.unitId))issues.push(`${u.name}: attachment da verificare.`);
  }
  if(total>a.limit)issues.push('La lista supera il limite di punti.');
  for(const uid of new Set(a.entries.map(e=>e.unitId))){const u=units.get(uid);if(!u)continue;const max=a.limit<=1000?Math.max(1,Math.floor(u.maxCopies*2/3)):u.maxCopies;if(a.entries.filter(e=>e.unitId===uid).length>max)issues.push(`Troppe copie di ${u.name} (limite ${max}).`);}
  const dp=wbFaction().detachments.filter(d=>a.detachmentIds.includes(d.id)).reduce((sum,d)=>sum+Number(d.dp||0),0);
  if(dp>a.dpLimit)issues.push('Budget Detachment Points superato.');
  const tags=wbDetachments().map(d=>d.unique).filter(Boolean);
  if(new Set(tags).size!==tags.length)issues.push('Distaccamenti incompatibili: stesso tag Unique.');
  if(!a.detachmentIds.length)issues.push('Seleziona i distaccamenti.');
  if(!a.disposition)issues.push('Seleziona la Force Disposition.');
  if(a.entries.filter(e=>e.warlord).length!==1)issues.push('Indica un solo Warlord.');
  if(enhancements>(a.limit<=1000?2:4))issues.push('Limite potenziamenti superato.');
  return {total,issues,dp};
}
function wbChanged(render=true){workbench.dirty=true;workbench.revision++;if(render)builderWorkbenchRender();}
function wbDiscard(){if(builderUi.pending){notify('Attendi il salvataggio in corso.');return false;}return !workbench.dirty||confirm('Abbandonare le modifiche non salvate?');}
function wbResetDetailScroll(){if(typeof main!=='undefined'){const detail=main.querySelector('.wb-detail');if(detail)detail.scrollTop=0;}}
function wbSelect(id,preview=false){workbench.preview=preview?id:null;workbench.selected=preview?null:id;workbench.pane='detail';workbench.detailTab='profiles';builderWorkbenchRender();wbResetDetailScroll();}
function wbAdd(id){
  const u=wbUnits().get(id);if(!u||builderUi.army.entries.length>=200)return;
  const e={entryId:wbId(),unitId:id,models:u.points[0]?.models||1,manualPoints:null,weaponCounts:{},enhancementIds:[],attachedTo:null,warlord:false,notes:''};
  // shortcut: loadouts and replacement rules remain manual until curated mappings exist.
  builderUi.army.entries.push(e);workbench.selected=e.entryId;workbench.preview=null;workbench.pane='detail';workbench.detailTab='config';wbChanged();wbResetDetailScroll();
}
function wbGroup(root){return [root,...builderUi.army.entries.filter(e=>e.attachedTo===root.entryId)];}
function wbTable(headers,rows){return `<div class="wb-table" tabindex="0" role="region" aria-label="Profili, tabella scorrevole"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((c,i)=>i===0?`<th scope="row">${wbText(c)}</th>`:`<td>${wbText(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function wbRules(rows){return rows.map(r=>`<article class="wb-rule"><h4>${wbText(r.name||wbDescription(r))}</h4>${r.name?`<p>${wbText(wbDescription(r))}</p>`:''}</article>`).join('');}
function wbProfiles(u,e,play){
  const weapons=u.weapons.filter(w=>(!e || Number(e.weaponCounts[w.line]||0)>0)&&(!w.enhancement_id||e?.enhancementIds.includes(w.enhancement_id)));
  const unconfigured=e && !Object.values(e.weaponCounts).some(n=>n>0);
  const models=wbTable(['Modello','M','T','Sv','Inv','W','Ld','OC','Base'],u.models.map(m=>[m.name,m.M,m.T,m.Sv,wbPlus(m.inv_sv)||'—',m.W,m.Ld,m.OC,m.base_size]));
  const weaponTable=type=>{const rows=weapons.filter(w=>w.type===type);return rows.length?wbTable(['Arma','N.','Gittata','A','BS/WS','S','AP','D','Regole'],rows.map(w=>[w.name,e?.weaponCounts[w.line]??'—',/^\d+$/.test(w.range)?w.range+'"':w.range,w.A,wbPlus(w.BS_WS),w.S,w.AP,w.D,wbDescription(w)])):'';};
  const enhancements=e?u.enhancements.filter(x=>e.enhancementIds.includes(x.id)):[];
  const stratagems=u.stratagems.map(ref=>(builderUi.catalog.stratagems||[]).find(s=>s.id===ref.id)||ref).filter(s=>!s.detachment_id||builderUi.army.detachmentIds.includes(s.detachment_id));
  return `<section class="wb-profiles"><h3>${wbText(u.name)}${e?.warlord?' · Warlord':''}</h3>${models}
    ${unconfigured?'<p class="wb-warning">Dotazione da configurare in Build: i profili delle armi non sono ancora selezionati.</p>':''}
    ${weaponTable('Ranged')?`<h4>Armi a distanza</h4>${weaponTable('Ranged')}`:''}${weaponTable('Melee')?`<h4>Armi da mischia</h4>${weaponTable('Melee')}`:''}
    <h4>Abilità e regole</h4>${wbRules(u.abilities)}${wbRules(enhancements)}
    ${u.leaderText.trim()?`<h4>Leader / support</h4><p class="wb-rule-text">${wbText(u.leaderText)}</p>`:''}
    <p class="wb-keywords">${wbText(u.keywords)}</p>
    ${stratagems.length?`<details><summary>Stratagemmi (${stratagems.length})</summary>${wbRules(stratagems)}</details>`:''}</section>`;
}
function wbDetail(){
  const units=wbUnits(), e=wbEntry(workbench.selected), u=units.get(e?.unitId||workbench.preview);
  if(!u)return '<div class="wb-empty"><h2>Dettaglio unità</h2><p>Seleziona un’unità per leggere profili e regole.</p></div>';
  if(workbench.mode==='play'&&e)return `<div class="wb-detail-head"><h2>${wbGroup(e).map(x=>wbText(units.get(x.unitId)?.name)).join(' + ')}</h2><p>Profili della dotazione scelta · regole dei singoli membri</p></div>${wbGroup(e).map(x=>wbProfiles(units.get(x.unitId),x,true)).join('')}`;
  if(!e)return `<div class="wb-detail-head"><h2>${wbText(u.name)}</h2><button data-wb-add="${u.id}">Aggiungi unità</button></div>${wbProfiles(u,null,false)}`;
  const tabs=`<div class="wb-mode wb-detail-tabs" role="group" aria-label="Dettaglio unità"><button data-wb-detail="profiles" aria-pressed="${workbench.detailTab==='profiles'}">Profili e regole</button><button data-wb-detail="config" aria-pressed="${workbench.detailTab==='config'}">Configura unità</button></div>`;
  if(workbench.detailTab!=='config')return `${tabs}${wbProfiles(u,e,false)}`;
  const targets=builderUi.army.entries.filter(x=>x.entryId!==e.entryId&&!x.attachedTo&&!builderUi.army.entries.some(y=>y.attachedTo===e.entryId));
  return `${tabs}<div class="wb-detail-head"><h2>${wbText(u.name)}</h2><span>${wbPrice(e)??'?'} pt</span></div>
    <div class="wb-fields"><label>Miniature<input data-wb-field="models" type="number" min="1" max="200" value="${e.models}" list="wb-sizes"></label><datalist id="wb-sizes">${[...new Set(u.points.map(p=>p.models))].map(n=>`<option value="${n}"></option>`).join('')}</datalist>
    <label>Punti base manuali<input data-wb-field="manualPoints" type="number" min="0" max="20000" placeholder="Automatici" value="${e.manualPoints??''}"></label></div>
    <details><summary>Costi e composizione</summary>${wbTable(['Composizione / fascia','Punti'],u.costs.map(c=>[c.description,c.cost]))}${u.composition.map(c=>`<p>${wbText(c.description)}</p>`).join('')}</details>
    <label class="wb-check"><input data-wb-field="warlord" type="checkbox" ${e.warlord?'checked':''}> Warlord</label>
    <label>Attached a<select data-wb-field="attachedTo"><option value="">Unità indipendente</option>${targets.map(x=>`<option value="${x.entryId}" ${e.attachedTo===x.entryId?'selected':''}>${esc(units.get(x.unitId).name)} · ${builderUi.army.entries.indexOf(x)+1}${u.leads.includes(x.unitId)?' · compatibile':' · verifica manuale'}</option>`).join('')}</select></label>
    <section><h3>Dotazione</h3><p class="wb-rule-text">${wbText(u.loadout)}</p><p class="wb-muted">Indica la quantità per ogni profilo utilizzato. Per un’arma con più modalità ripeti la quantità su ciascun profilo pertinente.</p>
    ${u.weapons.filter(w=>!w.enhancement_id||e.enhancementIds.includes(w.enhancement_id)).map(w=>`<label class="wb-weapon"><span>${wbText(w.name)}<small>${wbText(w.type)} · ${wbText(wbDescription(w))}</small></span><input aria-label="Quantità ${esc(w.name)}" data-wb-weapon="${w.line}" type="number" min="0" max="1000" value="${e.weaponCounts[w.line]||0}"></label>`).join('')}
    <details><summary>Opzioni e restrizioni della scheda</summary>${u.options.map(o=>`<p class="wb-rule-text">${wbText(wbDescription(o))}</p>`).join('')||'<p>Nessuna opzione aggiuntiva.</p>'}</details></section>
    ${u.enhancements.length?`<section><h3>Potenziamenti</h3>${u.enhancements.filter(x=>!x.detachment_id||builderUi.army.detachmentIds.includes(x.detachment_id)||e.enhancementIds.includes(x.id)).map(x=>`<label class="wb-check"><input data-wb-enhancement="${x.id}" type="checkbox" ${e.enhancementIds.includes(x.id)?'checked':''}><span>${wbText(x.name)} · ${esc(x.cost)} pt</span></label>`).join('')}</section>`:''}
    <label>Note sull’unità<textarea data-wb-field="notes" maxlength="4000" rows="2">${esc(e.notes)}</textarea></label>
    ${wbProfiles(u,e,false)}`;
}
function builderWorkbenchRender(){
  if(page()!=='builder')return;
  const a=builderUi.army, f=wbFaction(), units=wbUnits(), totals=builderWorkbenchTotals();
  const old=main.querySelector('.workbench');const positions=old?[...old.querySelectorAll('[data-wb-scroll]')].map(el=>[el.dataset.wbScroll,el.scrollTop]):[];
  const focused=document.activeElement;const focusKey=focused?.getAttribute('data-wb-weapon');
  const catalogFaction=builderUi.catalog.factions.find(x=>x.id===workbench.catalogFaction)||f;
  const filtered=catalogFaction.unitIds.map(id=>units.get(id)).filter(u=>(u.name+' '+u.category+' '+u.keywords).toLocaleLowerCase().includes(workbench.search.toLocaleLowerCase()));
  const categories=[...new Set(filtered.map(u=>u.category))];
  const roots=workbench.mode==='play'?a.entries.filter(e=>!e.attachedTo):a.entries;
  main.innerHTML=`<section class="workbench" data-mode="${workbench.mode}" data-pane="${workbench.pane}" aria-label="Army Builder 11ª edizione">
    <div class="wb-heading"><div><p class="wb-muted">Warhammer 40.000 · 11ª edizione</p><h1>Army Builder</h1></div><div class="wb-mode" role="group" aria-label="Modalità"><button data-wb-mode="build" aria-pressed="${workbench.mode==='build'}">Build</button><button data-wb-mode="play" aria-pressed="${workbench.mode==='play'}">Play mode</button></div></div>
    <div class="wb-toolbar"><label class="wb-name">Nome armata<input id="wb-name" maxlength="100" value="${esc(a.name)}"></label><div class="wb-score" role="status"><strong>${totals.total}<small> / ${a.limit} pt</small></strong><span>${totals.dp} / ${a.dpLimit} DP${totals.issues.length?` · ${totals.issues.length} avvisi`:''}</span></div><div class="wb-toolbar-actions"><span id="wb-save-state" role="status">${workbench.dirty?'Modifiche non salvate':'Bozza'}</span><button id="wb-save" class="primary" ${builderUi.pending?'disabled':''}>${builderUi.pending?'Salvataggio…':'Salva armata'}</button><button id="wb-export">Esporta TXT</button><button id="wb-backup">Backup JSON</button></div></div>
    <div class="wb-mobile-tabs" role="group" aria-label="Pannelli">${workbench.mode==='build'?`<button data-wb-pane="catalog" aria-pressed="${workbench.pane==='catalog'}">Catalogo</button>`:''}<button data-wb-pane="roster" aria-pressed="${workbench.pane==='roster'}">Armata</button><button data-wb-pane="detail" aria-pressed="${workbench.pane==='detail'}">Dettaglio</button></div>
    <div class="wb-columns"><aside class="wb-panel wb-catalog" data-wb-scroll="catalog"><h2>Catalogo unità</h2><label>Fazione da consultare<select id="wb-catalog-faction">${builderUi.catalog.factions.map(x=>`<option value="${x.id}" ${x.id===catalogFaction.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Cerca unità<input id="wb-search" type="search" value="${esc(workbench.search)}" placeholder="Nome, ruolo o keyword"></label>
    ${categories.map(category=>`<details open class="wb-category"><summary>${esc(category)} <small>${filtered.filter(u=>u.category===category).length}</small></summary>${filtered.filter(u=>u.category===category).map(u=>`<div class="wb-catalog-row"><button data-wb-preview="${u.id}" class="wb-unit-name">${esc(u.name)}<small>${u.points[0]?.points??'?'} pt · ${a.entries.filter(e=>e.unitId===u.id).length} in lista</small></button><button data-wb-add="${u.id}" aria-label="Aggiungi ${esc(u.name)}">+</button></div>`).join('')}</details>`).join('')||'<p>Nessuna unità trovata.</p>'}</aside>
    <section class="wb-panel wb-roster" data-wb-scroll="roster"><h2>${workbench.mode==='play'?'Unità in campo':'La tua armata'}</h2>
    ${workbench.mode==='build'?`<details class="wb-configuration" ${a.entries.length?'':'open'}><summary>Configurazione armata</summary><label>Fazione<select id="wb-faction">${builderUi.catalog.factions.map(x=>`<option value="${x.id}" ${x.id===f.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><div class="wb-fields"><label>Limite punti<input id="wb-limit" type="number" min="100" max="5000" value="${a.limit}"></label><label>Budget DP<input id="wb-dp" ${[1000,2000].includes(a.limit)?'disabled':''} type="number" min="0" max="20" value="${a.dpLimit}"></label></div><h3>Distaccamenti</h3>${wbDetachmentChoices()}<label>Force Disposition<select id="wb-disposition"><option value="">Seleziona disposizione</option>${[...new Set(f.detachments.filter(d=>a.detachmentIds.includes(d.id)).flatMap(d=>(d.force_disposition||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)).concat(a.disposition?[a.disposition]:[]))].map(s=>`<option ${a.disposition===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label></details>`:`<p class="wb-muted">${esc(f.name)} · ${esc(a.disposition||'Disposizione da scegliere')}</p>`}
    ${wbArmyRules()}<div class="wb-roster-list">${roots.map(e=>{const u=units.get(e.unitId),group=workbench.mode==='play'?wbGroup(e):[e];return `<article class="wb-roster-row ${workbench.selected===e.entryId?'is-selected':''}"><button data-wb-select="${e.entryId}" class="wb-unit-name" aria-pressed="${workbench.selected===e.entryId}"><span>${wbText(u.name)}${e.warlord?' · Warlord':''}</span><small>${group.length>1?group.slice(1).map(x=>wbText(units.get(x.unitId).name)).join(' + '):`${e.models} modelli${e.attachedTo?' · attached':''}`}</small><strong>${group.reduce((sum,x)=>sum+(wbPrice(x)??0)+x.enhancementIds.reduce((n,id)=>n+Number(units.get(x.unitId).enhancements.find(y=>y.id===id)?.cost||0),0),0)} pt</strong></button>${workbench.mode==='build'?`<div class="wb-row-actions"><button data-wb-duplicate="${e.entryId}" aria-label="Duplica ${esc(u.name)}">Duplica</button><button data-wb-remove="${e.entryId}" aria-label="Rimuovi ${esc(u.name)}">Rimuovi</button></div>`:''}</article>`;}).join('')||'<div class="wb-empty"><h3>La tua armata inizia qui</h3><p>Aggiungi le unità dal catalogo. Selezionale per configurare la dotazione e leggere le regole.</p></div>'}</div>
    <details class="wb-validation"><summary>Verifiche · ${totals.issues.length} avvisi</summary><p>Equipaggiamenti, eccezioni e combinazioni richiedono verifica manuale.</p>${totals.issues.map(i=>`<p class="wb-warning">${esc(i)}</p>`).join('')}</details></section>
    <aside class="wb-panel wb-detail" data-wb-scroll="detail" aria-label="Profili e regole">${wbDetail()}</aside></div>
    <details class="wb-library"><summary>Armate salvate e catalogo</summary><div class="wb-library-grid"><section><h2>Armate salvate</h2><button id="wb-new">Crea nuova armata</button>${builderUi.armies.map(x=>`<div class="wb-saved-row"><span>${esc(x.name)} <small>${esc(x.edition)}ª ed.</small></span><button data-wb-open="${x.id}">Apri</button><button data-wb-delete="${x.id}">Elimina</button></div>`).join('')}<label>Ripristina backup JSON<input id="wb-restore" type="file" accept=".json,application/json"></label></section><section><h2>Catalogo Wahapedia</h2><p>${esc(builderUi.catalog.version)} · ${builderUi.catalog.units.length} schede</p><p>La lista conserva la versione del catalogo con cui è stata creata.</p>${state.user.admin?'<label>Importa catalogo JSON<input id="wb-import-file" type="file" accept=".json,application/json"></label><button id="wb-import">Importa catalogo</button>':''}</section></div></details>
  </section>`;
  wbBind();
  for(const [key,top] of positions){const el=main.querySelector(`[data-wb-scroll="${key}"]`);if(el)el.scrollTop=top;}
  if(focusKey!==null&&focusKey!==undefined)main.querySelector(`[data-wb-weapon="${focusKey}"]`)?.focus({preventScroll:true});
}
function wbDownload(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function wbSave(){
  if(builderUi.pending)return;
  const revision=workbench.revision, snapshot=builderClone(builderUi.army);builderUi.pending=true;builderWorkbenchRender();
  try{const r=await api('builderSave',snapshot);if(workbench.revision===revision){builderUi.army=r.army;workbench.dirty=false;}else builderUi.army.id=r.army.id;builderUi.armies=(await api('builderArmies')).armies;notify('Armata salvata. Restano i controlli manuali sulle regole.');}
  catch(err){notify(err.message,true);}finally{builderUi.pending=false;builderWorkbenchRender();}
}
function wbBind(){
  const root=main.querySelector('.workbench'),a=builderUi.army;
  const on=(selector,event,handler)=>root.querySelectorAll(selector).forEach(el=>el.addEventListener(event,()=>handler(el)));
  on('[data-wb-mode]','click',el=>{workbench.mode=el.dataset.wbMode;workbench.preview=null;if(workbench.mode==='play'){const e=wbEntry(workbench.selected);if(e?.attachedTo)workbench.selected=e.attachedTo;workbench.pane='roster';}builderWorkbenchRender();});
  on('[data-wb-pane]','click',el=>{workbench.pane=el.dataset.wbPane;builderWorkbenchRender();});
  on('[data-wb-detail]','click',el=>{workbench.detailTab=el.dataset.wbDetail;builderWorkbenchRender();});
  on('[data-wb-preview]','click',el=>wbSelect(el.dataset.wbPreview,true));on('[data-wb-select]','click',el=>wbSelect(el.dataset.wbSelect));on('[data-wb-add]','click',el=>wbAdd(el.dataset.wbAdd));
  on('[data-wb-remove]','click',el=>{const id=el.dataset.wbRemove;a.entries=a.entries.filter(e=>e.entryId!==id);a.entries.forEach(e=>{if(e.attachedTo===id)e.attachedTo=null;});if(workbench.selected===id)workbench.selected=null;wbChanged();});
  on('[data-wb-duplicate]','click',el=>{if(a.entries.length>=200)return;const e=builderClone(wbEntry(el.dataset.wbDuplicate));e.entryId=wbId();e.attachedTo=null;e.warlord=false;a.entries.push(e);workbench.selected=e.entryId;wbChanged();});
  on('#wb-name','input',el=>{a.name=el.value;wbChanged(false);root.querySelector('#wb-save-state').textContent='Modifiche non salvate';});
  on('#wb-search','input',el=>{workbench.search=el.value;const pos=el.selectionStart;builderWorkbenchRender();const next=main.querySelector('#wb-search');next.focus();next.setSelectionRange(pos,pos);});
  on('#wb-catalog-faction','change',el=>{workbench.catalogFaction=el.value;builderWorkbenchRender();});
  on('#wb-faction','change',el=>{if(a.entries.length&&!confirm('Cambiare fazione mantenendo le unità attuali come selezioni da verificare?')){el.value=a.factionId;return;}a.factionId=el.value;a.detachmentIds=[];a.disposition='';workbench.catalogFaction=el.value;wbChanged();});
  on('#wb-limit','change',el=>{const n=Number(el.value);if(Number.isInteger(n)&&n>=100&&n<=5000){a.limit=n;if(n===1000)a.dpLimit=2;if(n===2000)a.dpLimit=3;}wbChanged();});
  on('#wb-dp','change',el=>{const n=Number(el.value);if(Number.isInteger(n)&&n>=0&&n<=20)a.dpLimit=n;wbChanged();});
  on('#wb-disposition','change',el=>{a.disposition=el.value;wbChanged();});
  on('[data-wb-detachment]','change',el=>{const id=el.dataset.wbDetachment;if(el.checked&&wbDetachmentConflict(wbFaction().detachments.find(d=>d.id===id))){builderWorkbenchRender();return;}a.detachmentIds=el.checked?[...a.detachmentIds,id]:a.detachmentIds.filter(x=>x!==id);const available=wbDetachments().flatMap(d=>(d.force_disposition||'').split(',').map(s=>s.trim()));if(!available.includes(a.disposition))a.disposition='';wbChanged();});
  on('[data-wb-field]','change',el=>{const e=wbEntry(workbench.selected),field=el.dataset.wbField;if(!e)return;if(field==='models'){const n=Number(el.value);if(Number.isInteger(n)&&n>=1&&n<=200)e.models=n;}else if(field==='manualPoints'){const n=Number(el.value);if(el.value==='')e.manualPoints=null;else if(Number.isInteger(n)&&n>=0&&n<=20000)e.manualPoints=n;}else if(field==='warlord'){a.entries.forEach(x=>x.warlord=false);e.warlord=el.checked;}else if(field==='attachedTo')e.attachedTo=el.value||null;else e.notes=el.value;wbChanged();});
  on('[data-wb-weapon]','change',el=>{const n=Number(el.value),e=wbEntry(workbench.selected);if(e&&Number.isInteger(n)&&n>=0&&n<=1000)e.weaponCounts[el.dataset.wbWeapon]=n;wbChanged();});
  on('[data-wb-enhancement]','change',el=>{const e=wbEntry(workbench.selected),id=el.dataset.wbEnhancement;e.enhancementIds=el.checked?[...e.enhancementIds,id]:e.enhancementIds.filter(x=>x!==id);if(!el.checked)for(const w of wbUnits().get(e.unitId).weapons)if(w.enhancement_id===id)delete e.weaponCounts[w.line];wbChanged();});
  on('#wb-save','click',wbSave);
  on('#wb-new','click',()=>{if(!wbDiscard())return;builderUi.catalog=builderUi.active;builderUi.army=builderNewArmy();Object.assign(workbench,{dirty:false,selected:null,preview:null,mode:'build'});builderRender();});
  on('[data-wb-open]','click',async el=>{if(!wbDiscard())return;try{const army=builderUi.armies.find(x=>x.id===el.dataset.wbOpen),r=await api('builderCatalog&edition='+army.edition+'&catalogId='+encodeURIComponent(army.catalogId));if(!r.catalog)throw Error('Catalogo storico non disponibile.');builderUi.catalog=r.catalog;builderUi.army=builderClone(army);if(r.catalog.schemaVersion===2)builderUi.army.dpLimit??=army.limit<=1000?2:3;Object.assign(workbench,{dirty:false,selected:null,preview:null});builderRender();}catch(e){notify(e.message,true);}});
  on('[data-wb-delete]','click',async el=>{if(!confirm('Eliminare questa armata salvata?'))return;try{await api('builderDelete',{id:el.dataset.wbDelete});builderUi.armies=(await api('builderArmies')).armies;if(a.id===el.dataset.wbDelete){a.id=null;wbChanged(false);}builderWorkbenchRender();}catch(e){notify(e.message,true);}});
  on('#wb-import','click',async()=>{const file=root.querySelector('#wb-import-file').files[0];if(!file||file.size>28000000){notify('Seleziona un catalogo JSON entro 28 MB.',true);return;}if(!wbDiscard())return;try{await api('builderImport',{catalog:JSON.parse(await file.text())});builderUi.catalog=null;builderUi.army=null;workbench.dirty=false;builderLoad().catch(e=>notify(e.message,true));}catch(e){notify(e.message,true);}});
  on('#wb-backup','click',()=>wbDownload('armata-11.json',JSON.stringify(a,null,2),'application/json'));
  on('#wb-restore','change',async el=>{const file=el.files[0];if(!file||file.size>2000000||!wbDiscard())return;try{const data=JSON.parse(await file.text());if(data.schemaVersion!==2||data.edition!=='11')throw Error('Backup 11ª non valido.');data.id=null;data.name=String(data.name||'Armata ripristinata').slice(0,100);const result=await api('builderSave',data),catalog=await api('builderCatalog&edition=11&catalogId='+encodeURIComponent(result.army.catalogId));builderUi.catalog=catalog.catalog;builderUi.army=result.army;builderUi.armies=(await api('builderArmies')).armies;Object.assign(workbench,{dirty:false,selected:null,preview:null});builderWorkbenchRender();}catch(e){notify(e.message,true);}});
  on('#wb-export','click',()=>{const units=wbUnits(),t=builderWorkbenchTotals(),lines=[a.name,'Warhammer 40.000 · 11ª edizione',wbFaction().name,`${t.total}/${a.limit} pt · ${t.dp}/${a.dpLimit} DP`,a.disposition,...wbFaction().detachments.filter(d=>a.detachmentIds.includes(d.id)).map(d=>d.name),''];for(const e of a.entries){const u=units.get(e.unitId);lines.push(`${u.name} · ${e.models} modelli · ${wbPrice(e)??'?'} pt${e.warlord?' · Warlord':''}`);if(e.attachedTo)lines.push('  Attached a: '+units.get(wbEntry(e.attachedTo).unitId).name+' · '+e.attachedTo);for(const w of u.weapons)if(e.weaponCounts[w.line])lines.push(`  ${e.weaponCounts[w.line]}× ${w.name}`);for(const x of u.enhancements)if(e.enhancementIds.includes(x.id))lines.push(`  ${x.name} +${x.cost} pt`);if(e.notes)lines.push('  '+e.notes);}lines.push('','Verifica manuale di equipaggiamenti, attachment ed eccezioni richiesta.',...t.issues,'Catalogo: '+builderUi.catalog.version);wbDownload('armata-11.txt',lines.join('\n'),'text/plain;charset=utf-8');});
}
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(workbench.dirty){event.preventDefault();event.returnValue='';}});
