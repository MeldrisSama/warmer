'use strict';

// Catalog metadata and army drafts stay separate from the old .txt list archive.
const builderUi={edition:'10',active:null,catalog:null,armies:[],army:null,search:'',pending:false};
const builderClone=value=>JSON.parse(JSON.stringify(value));
const builderFaction=()=>builderUi.catalog?.factions.find(f=>f.id===builderUi.army?.factionId);
const builderUnit=id=>builderFaction()?.units.find(unit=>unit.id===id);
function builderTotals(){
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
  const faction=builderUi.catalog?.factions[0];
  return {id:null,name:'Nuova armata',edition:builderUi.edition,catalogId:builderUi.catalog?.catalogId||null,
    factionId:faction?.id||'',detachmentId:faction?.detachments[0]?.id||'',limit:2000,entries:[]};
}
async function builderLoad(){
  const edition=builderUi.edition;
  const [catalog,armies]=await Promise.all([api('builderCatalog&edition='+edition),api('builderArmies')]);
  if(edition!==builderUi.edition||page()!=='builder') return;
  builderUi.active=catalog.catalog;
  builderUi.catalog=catalog.catalog;
  builderUi.armies=armies.armies;
  builderUi.army=builderNewArmy();
  builderRender();
}
function builderPage(){
  main.innerHTML='<section class="panel"><h1>Army Builder</h1><p class="intro">Caricamento cataloghi…</p></section>';
  builderLoad().catch(err=>{if(page()==='builder')main.innerHTML=`<section class="panel"><h1>Army Builder</h1><p role="alert">${esc(err.message)}</p><button id="builder-retry" type="button">Riprova</button></section>`;
    const retry=document.querySelector('#builder-retry');if(retry)retry.onclick=builderPage;});
}
function builderRender(){
  if(page()!=='builder') return;
  const cat=builderUi.catalog, army=builderUi.army, faction=builderFaction(), totals=builderTotals();
  main.innerHTML=`<section class="panel builder-shell">
    <div class="builder-top"><div><p class="builder-eyebrow">CRONACHE DEL SETTORE / STRUMENTI</p><h1>Army Builder</h1><p class="intro">Crea e salva armate a partire da cataloghi importati con autorizzazione.</p></div>
    <label class="builder-edition">Edizione<select id="builder-edition"><option value="10" ${builderUi.edition==='10'?'selected':''}>10ª edizione</option><option value="11" ${builderUi.edition==='11'?'selected':''}>11ª edizione</option></select></label></div>
    ${cat ? `<div class="builder-source"><span><strong>Catalogo ${esc(cat.version)}</strong> · ${esc(cat.source)} · ${esc(cat.license)}</span>${cat.catalogId!==builderUi.active?.catalogId?'<span class="builder-warning">Versione storica della lista</span>':''}<span>Non sostituisce le regole ufficiali.</span></div>` : `<div class="builder-empty"><h2>Nessun catalogo per questa edizione</h2><p>Importa un JSON di dati utilizzabili legalmente. Il codice del builder non include datasheet o testi Games Workshop.</p></div>`}
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
    ${state.user.admin?`<section class="builder-panel"><div class="builder-heading"><h2>Importazione cataloghi</h2><span>Solo amministratori</span></div><p class="builder-muted">Carica un file JSON secondo lo schema documentato nel repository. Ogni importazione crea una versione indipendente: le armate già salvate mantengono la precedente.</p><label class="builder-field">File catalogo JSON<input type="file" id="builder-file" accept=".json,application/json"></label><label class="builder-rights"><input id="builder-rights" type="checkbox">Confermo di disporre dei diritti necessari per usare e pubblicare questi dati.</label><button id="builder-import" type="button">Importa catalogo</button></section>`:''}
    </div>
  </section>`;
  builderBind();
}
function builderBind(){
  const root=main.querySelector('.builder-shell');if(!root)return;
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
  const newButton=root.querySelector('#builder-new');if(newButton)newButton.onclick=()=>{builderUi.catalog=builderUi.active;builderUi.army=builderNewArmy();builderRender();};
  const save=root.querySelector('#builder-save');if(save)save.onclick=async()=>{save.disabled=true;try{const result=await api('builderSave',builderUi.army);builderUi.army=result.army;notify(result.validation.valid?'Armata salvata.':'Bozza salvata: alcune verifiche non sono soddisfatte.');const armies=await api('builderArmies');builderUi.armies=armies.armies;builderRender();}catch(err){notify(err.message,true);save.disabled=false;}};
  const exported=root.querySelector('#builder-export');if(exported)exported.onclick=builderExport;
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const army=builderUi.armies.find(a=>a.id===b.dataset.open);if(!army)return;try{if(army.catalogId!==builderUi.catalog?.catalogId){const r=await api('builderCatalog&edition='+army.edition+'&catalogId='+encodeURIComponent(army.catalogId));if(!r.catalog)throw new Error('Versione catalogo non disponibile.');builderUi.catalog=r.catalog;}builderUi.army=builderClone(army);builderUi.search='';builderRender();}catch(err){notify(err.message,true);}});
  root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Eliminare definitivamente questa armata?'))return;try{await api('builderDelete',{id:b.dataset.delete});builderUi.armies=(await api('builderArmies')).armies;if(builderUi.army?.id===b.dataset.delete){builderUi.catalog=builderUi.active;builderUi.army=builderNewArmy();}builderRender();notify('Armata eliminata.');}catch(err){notify(err.message,true);}});
  const imported=root.querySelector('#builder-import');if(imported)imported.onclick=async()=>{const file=root.querySelector('#builder-file').files[0];const rights=root.querySelector('#builder-rights').checked;if(!file){notify('Seleziona un file JSON.',true);return;}if(file.size>1048576){notify('Il file supera 1 MB.',true);return;}imported.disabled=true;try{const catalog=JSON.parse(await file.text());const r=await api('builderImport',{catalog,rightsConfirmed:rights});builderUi.edition=r.edition;notify('Catalogo importato e versione attivata.');builderPage();}catch(err){notify(err.message,true);imported.disabled=false;}};
}
function builderExport(){
  const army=builderUi.army, faction=builderFaction();if(!army||!faction)return;
  const totals=builderTotals();const lines=[army.name,`Edizione: ${army.edition}`,`Fazione: ${faction.name}`,`Distaccamento: ${faction.detachments.find(d=>d.id===army.detachmentId)?.name||army.detachmentId}`,`Catalogo: ${builderUi.catalog.version}`,`Punti: ${totals.total}/${army.limit}`,''];
  for(const e of army.entries){const u=builderUnit(e.unitId);if(!u)continue;const base=u.points.find(p=>p.models===e.models)?.points||0;const gear=u.equipment.filter(g=>e.equipmentIds.includes(g.id));const subtotal=(base+gear.reduce((sum,g)=>sum+g.points,0))*e.quantity;lines.push(`${e.quantity}x ${u.name} (${e.models} mod.) - ${subtotal} pt`);if(gear.length)lines.push('  Equipaggiamento: '+gear.map(g=>g.name).join(', '));}
  if(totals.issues.length)lines.push('','ATTENZIONE: '+totals.issues.join(' '));
  lines.push('','Controllare sempre le regole ufficiali e la licenza dei dati.');
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(army.name.replace(/[^a-z0-9_-]+/gi,'_').slice(0,60)||'armata')+'.txt';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
