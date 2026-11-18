'use strict';

function beModelCounts(recipe,models,requested=null){
  if(!recipe.flexibleModels)return {};
  const counts=requested?builderClone(requested):Object.fromEntries(recipe.models.map(m=>[m.id,m.min]));
  if(!requested){let left=models-Object.values(counts).reduce((a,b)=>a+b,0);for(const m of [...recipe.models].sort((a,b)=>(b.max-b.min)-(a.max-a.min))){const n=Math.min(Math.max(0,left),m.max-counts[m.id]);counts[m.id]+=n;left-=n;}}
  if(Object.keys(counts).length!==recipe.models.length||recipe.models.some(m=>!Number.isInteger(counts[m.id])||counts[m.id]<m.min||counts[m.id]>m.max)||Object.values(counts).reduce((a,b)=>a+b,0)!==models)return null;
  if((recipe.compositionRules||[]).some(r=>counts[r.model]>=r.count&&counts[r.requires]<r.minimum))return null;
  return counts;
}
function beCapacity(recipe,group,models,modelCounts=null){
  if(group.unitGear){const population=group.perModel?beCapacity(recipe,{model:group.perModel,per:0},models,modelCounts):models;return group.per?Math.floor(population/group.per):1;}
  const fixed=recipe.models.filter(m=>!m.variable).reduce((sum,m)=>sum+m.fixed,0),model=recipe.models.find(m=>m.id===group.model);
  if(recipe.flexibleModels&&!modelCounts)modelCounts=beModelCounts(recipe,models);
  const available=modelCounts?.[model.id]??model.countsBySize?.[models]??(model.variable?Math.max(0,models-fixed):model.fixed);
  return group.per?Math.min(available,Math.floor(models/group.per)):available;
}
function beSelections(unit,models){
  const recipe=unit.loadoutRecipe,counts=recipe?.flexibleModels?beModelCounts(recipe,models):null;
  const selections=Object.fromEntries((recipe?.groups||[]).map(g=>[g.id,{[g.default]:beCapacity(recipe,g,models,counts)}]));
  if(counts)selections._models=counts;return selections;
}
function beManagedWeapon(recipe,line){
  const weapon=recipe?.weapons?.find(w=>w.lines.includes(line));
  return Boolean(weapon&&recipe.groups.some(g=>g.choices.some(c=>Object.hasOwn(c.weapons,weapon.id))));
}
function beWeaponModes(unit,line){
  const weapon=unit.weapons.find(w=>w.line===line);if(!weapon)return [];
  const base=name=>String(name||'').split(/\s+[-–—]\s+/u)[0].toLowerCase();
  return unit.weapons.filter(w=>w.type===weapon.type&&w.enhancement_id===weapon.enhancement_id&&base(w.name)===base(weapon.name));
}
function beSync(unit,entry){
  const recipe=unit.loadoutRecipe;if(!recipe?.groups||!entry.loadoutSelections)return 0;
  const known=new Map(recipe.weapons.map(w=>[w.id,w]));let cost=0;
  for(const weapon of recipe.weapons)for(const line of weapon.lines)if(beManagedWeapon(recipe,line))entry.weaponCounts[line]=0;
  for(const group of recipe.groups)for(const [id,n] of Object.entries(entry.loadoutSelections[group.id]||{})){
    const choice=group.choices.find(c=>c.id===id);if(!choice)continue;
    for(const [wid,per] of Object.entries(choice.weapons)){const weapon=known.get(wid);for(const line of weapon.lines)entry.weaponCounts[line]+=n*per;cost+=n*per*weapon.cost;}
  }
  return cost;
}
function beChoiceAllowed(unit,entry,group,choiceId,delta){
  const current=entry.loadoutSelections?.[group.id]||{},n=current[choiceId]||0;
  if(delta<0)return choiceId!==group.default&&n>0&&Boolean(beNextChoices(unit,entry,group,choiceId,delta));
  if(n>=beCapacity(unit.loadoutRecipe,group,entry.models,entry.loadoutSelections?._models))return false;
  if(choiceId!==group.default&&group.sharedPer){
    const used=unit.loadoutRecipe.groups.filter(g=>g.sharedKey===group.sharedKey).reduce((s,g)=>s+Object.entries(entry.loadoutSelections?.[g.id]||{}).filter(([id])=>id!==g.default).reduce((a,[,q])=>a+q,0),0);
    if(used>=Math.floor(entry.models/group.sharedPer)&&(current[group.default]||0)>0)return false;
  }
  return Object.entries(current).some(([id,q])=>id!==choiceId&&q>0)&&Boolean(beNextChoices(unit,entry,group,choiceId,delta));
}
function beRuleLimit(rule,models,population=null){
  if(models<(rule.minimum||0)||rule.maximum!=null&&models>rule.maximum)return 0;
  if(rule.maxAt&&models>=rule.maxAt.models)return rule.maxAt.max;
  return rule.per?Math.floor((population??models)/rule.per)*(rule.max??1):(rule.max??1000);
}
function beRuleErrors(recipe,selections,models){
  const errors=[];
  for(const rule of recipe.rules||[]){
    let used=0,capacity=0;
    for(const g of recipe.groups){
      if(!g.choices.some(c=>c.rules?.includes(rule.id)))continue;
      capacity+=beCapacity(recipe,g,models,selections?._models);
      for(const c of g.choices)if(c.rules?.includes(rule.id))used+=selections?.[g.id]?.[c.id]||0;
    }
    const population=rule.perModel?beCapacity(recipe,{model:rule.perModel,per:0},models,selections?._models):null;
    if(used>beRuleLimit(rule,models,population))errors.push('Limite condiviso della dotazione superato.');
    if(rule.all&&used!==0&&used!==capacity)errors.push('La sostituzione deve riguardare tutti i modelli.');
  }
  return errors;
}
function beNextChoices(unit,entry,group,choiceId,delta){
  const recipe=unit.loadoutRecipe,next=builderClone(entry.loadoutSelections||beSelections(unit,entry.models)),current=next[group.id],choice=group.choices.find(c=>c.id===choiceId);
  const all=(recipe.rules||[]).find(r=>r.all&&choice.rules?.includes(r.id));
  if(all){
    for(const g of recipe.groups.filter(g=>g.choices.some(c=>c.rules?.includes(all.id)))){
      const c=delta<0?g.choices.find(c=>c.id===g.default):g.choices.find(c=>c.name===choice.name&&c.rules?.includes(all.id));
      if(!c)return null;next[g.id]={[c.id]:beCapacity(recipe,g,entry.models,next._models)};
    }
  }else if(delta>0){
    const others=Object.entries(current).filter(([id,n])=>id!==choiceId&&n>0);
    const donor=choiceId!==group.default&&current[group.default]>0?group.default:others.length===1?others[0][0]:null;
    if(!donor)return null;current[donor]--;current[choiceId]=(current[choiceId]||0)+1;
  }else{
    if(choiceId===group.default||!current[choiceId])return null;
    current[choiceId]--;current[group.default]=(current[group.default]||0)+1;
  }
  return beRuleErrors(recipe,next,entry.models).length?null:next;
}
function beWeaponLimit(unit,entry,line){
  const weapon=unit.weapons.find(w=>w.line===line);if(!weapon)return 0;
  if(weapon.enhancement_id)return entry.enhancementIds.includes(weapon.enhancement_id)?1:0;
  const recipe=unit.loadoutRecipe,w=recipe?.weapons.find(w=>w.lines.includes(line));if(!w)return entry.models;
  const groups=recipe.groups.filter(g=>g.choices.some(c=>c.weapons[w.id]));
  if(!groups.length)return entry.models;
  const shared=new Set();let max=0;
  for(const g of groups){if(g.sharedPer&&g.choices.some(c=>c.id!==g.default&&c.weapons[w.id])){if(shared.has(g.sharedKey))continue;shared.add(g.sharedKey);max+=Math.floor(entry.models/g.sharedPer);}else max+=beCapacity(recipe,g,entry.models,entry.loadoutSelections?._models)*Math.max(...g.choices.map(c=>c.weapons[w.id]||0));}
  return max;
}
function beSyncEnhancements(unit,entry){
  entry.enhancementModels??={};
  for(const id of Object.keys(entry.enhancementModels))if(!entry.enhancementIds.includes(id))delete entry.enhancementModels[id];
  const eligible=unit.models.filter(m=>/\bCharacter\b/i.test(m.keywords||''));
  for(const id of entry.enhancementIds)if(entry.models===1||eligible.length===1)entry.enhancementModels[id]=(eligible[0]||unit.models[0])?.line;
  for(const w of unit.weapons)if(w.enhancement_id){if(entry.enhancementIds.includes(w.enhancement_id))entry.weaponCounts[w.line]=1;else delete entry.weaponCounts[w.line];}
}
function beWeaponOwners(unit,entry,weapon){
  if(weapon._forModel!==undefined)return [{name:weapon._forModel,count:weapon._count}];
  if(!entry)return [{name:'',count:'—'}];
  if(weapon.enhancement_id){const bearer=unit.models.find(m=>m.line===entry.enhancementModels?.[weapon.enhancement_id]);return [{name:bearer?.name||(entry.models===1?unit.models[0]?.name:'Portatore da scegliere'),count:1}];}
  const recipe=unit.loadoutRecipe,w=recipe?.weapons.find(w=>w.lines.includes(weapon.line)),owners=new Map();
  if(w&&entry.loadoutSelections)for(const g of recipe.groups)for(const c of g.choices){const n=(entry.loadoutSelections[g.id]?.[c.id]||0)*(c.weapons[w.id]||0);if(n){const name=recipe.models.find(m=>m.id===g.model)?.name||'';owners.set(name,(owners.get(name)||0)+n);}}
  return owners.size?[...owners].map(([name,count])=>({name,count})):[{name:unit.models.length===1?unit.models[0].name:'',count:entry.weaponCounts[weapon.line]||0}];
}
function beGearErrors(entry){
  const unit=wbUnits().get(entry.unitId),errors=[];
  if(entry.loadoutSelections)errors.push(...beRuleErrors(unit.loadoutRecipe,entry.loadoutSelections,entry.models).map(x=>unit.name+': '+x));
  if(unit.loadoutRecipe?.flexibleModels&&entry.loadoutSelections&&!beModelCounts(unit.loadoutRecipe,entry.models,entry.loadoutSelections._models))errors.push(unit.name+': composizione dei modelli non valida.');
  for(const w of unit.weapons)if((entry.weaponCounts[w.line]||0)>beWeaponLimit(unit,entry,w.line))errors.push(`${unit.name}: limite superato per ${w.name}.`);
  for(const g of unit.loadoutRecipe?.groups||[])if(g.sharedPer){const used=unit.loadoutRecipe.groups.filter(x=>x.sharedKey===g.sharedKey).reduce((s,x)=>s+Object.entries(entry.loadoutSelections?.[x.id]||{}).filter(([id])=>id!==x.default).reduce((n,[,q])=>n+q,0),0);if(used>Math.floor(entry.models/g.sharedPer)){errors.push(`${unit.name}: limite condiviso delle sostituzioni superato.`);break;}}
  if(entry.warlord&&!/\bCharacter\b/i.test(unit.keywords))errors.push(`${unit.name}: solo un Character può essere Warlord.`);
  if(wbMustWarlord(unit)&&!entry.warlord)errors.push(`${unit.name}: questa unità deve essere il Warlord.`);
  if(entry.attachedTo){const target=wbEntry(entry.attachedTo);if(!target||target.attachedTo||!unit.leads.includes(target.unitId))errors.push(`${unit.name}: associazione a un'unità non valida.`);}
  if(entry.models>1)for(const id of entry.enhancementIds)if(unit.weapons.some(w=>w.enhancement_id===id)&&!entry.enhancementModels?.[id])errors.push(`${unit.name}: scegli il modello portatore del potenziamento.`);
  return errors;
}
function beChangeChoice(entry,groupId,choiceId,delta){
  const unit=wbUnits().get(entry.unitId),recipe=unit.loadoutRecipe,group=recipe?.groups?.find(g=>g.id===groupId);
  if(!group||![1,-1].includes(delta)||!group.choices.some(c=>c.id===choiceId))return false;
  if(!beChoiceAllowed(unit,entry,group,choiceId,delta)){notify('Limite della dotazione raggiunto.',true);return false;}
  const selections=beNextChoices(unit,entry,group,choiceId,delta);if(!selections)return false;const current=selections[groupId];
  const replaced=Object.entries(current).filter(([id])=>id!==group.default).reduce((s,[,n])=>s+n,0);
  if(group.choicePer&&replaced>Math.floor(entry.models/group.choicePer)){notify('Limite delle sostituzioni raggiunto.',true);return false;}
  entry.loadoutSelections=selections;beSync(unit,entry);return true;
}
function beResize(entry,models){
  const unit=wbUnits().get(entry.unitId),recipe=unit.loadoutRecipe;
  if(!entry.loadoutSelections||!recipe?.groups){entry.models=models;return true;}
  if(recipe.models.filter(m=>!m.variable).reduce((sum,m)=>sum+m.fixed,0)>models){notify('La taglia è inferiore ai modelli obbligatori.',true);return false;}
  const next=builderClone(entry.loadoutSelections);
  if(recipe.flexibleModels){
    const counts=builderClone(next._models||beModelCounts(recipe,entry.models));let left=models-entry.models;
    for(const m of [...recipe.models].sort((a,b)=>(b.max-b.min)-(a.max-a.min))){const n=left>0?Math.min(left,m.max-counts[m.id]):-Math.min(-left,counts[m.id]-m.min);counts[m.id]+=n;left-=n;}
    if(!beModelCounts(recipe,models,counts)){notify('Taglia non consentita dalla composizione.',true);return false;}next._models=counts;
  }
  for(const group of recipe.groups){
    const current=next[group.id],capacity=beCapacity(recipe,group,models,next._models),alternatives=Object.entries(current).filter(([id,n])=>id!==group.default&&n>0);
    const total=alternatives.reduce((sum,[,n])=>sum+n,0),max=Math.min(capacity,group.choicePer?Math.floor(models/group.choicePer):capacity);
    if(total>max){if(alternatives.length>1){notify('Riduci le dotazioni alternative prima di ridurre la squadra.',true);return false;}if(alternatives.length)current[alternatives[0][0]]=max;}
    current[group.default]=capacity-Object.entries(current).filter(([id])=>id!==group.default).reduce((sum,[,n])=>sum+n,0);
  }
  for(const group of recipe.groups)if(group.sharedPer){const used=recipe.groups.filter(g=>g.sharedKey===group.sharedKey).reduce((s,g)=>s+Object.entries(next[g.id]||{}).filter(([id])=>id!==g.default).reduce((n,[,q])=>n+q,0),0);if(used>Math.floor(models/group.sharedPer)){notify('Riduci le dotazioni che condividono il limite prima di ridurre la squadra.',true);return false;}}
  if(beRuleErrors(recipe,next,models).length){notify('Riduci le dotazioni prima di cambiare la taglia.',true);return false;}
  entry.models=models;entry.loadoutSelections=next;beSync(unit,entry);return true;
}
function beStandard(entry){
  const unit=wbUnits().get(entry.unitId);if(!unit.loadoutRecipe?.groups){notify('Dotazione guidata non disponibile per questa scheda.',true);return false;}
  entry.loadoutSelections=beSelections(unit,entry.models);beSync(unit,entry);return true;
}
function beModelChange(unit,entry,modelId,delta){
  const recipe=unit.loadoutRecipe;if(!recipe?.flexibleModels||!entry.loadoutSelections)return null;
  const body=[...recipe.models].filter(m=>m.variable).sort((a,b)=>(b.max-b.min)-(a.max-a.min))[0];
  if(!body||body.id===modelId||![1,-1].includes(delta))return null;
  const next=builderClone(entry.loadoutSelections),counts=next._models||beModelCounts(recipe,entry.models);if(!counts)return null;
  counts[modelId]+=delta;counts[body.id]-=delta;if(!beModelCounts(recipe,entry.models,counts))return null;next._models=counts;
  for(const g of recipe.groups){const cap=beCapacity(recipe,g,entry.models,counts),other=Object.entries(next[g.id]).filter(([id])=>id!==g.default).reduce((a,[,n])=>a+n,0);if(other>cap)return null;next[g.id][g.default]=cap-other;}
  return beRuleErrors(recipe,next,entry.models).length?null:next;
}
function beCompositionHtml(unit,entry){
  const recipe=unit.loadoutRecipe;if(!recipe?.flexibleModels||!entry.loadoutSelections)return '';
  const counts=entry.loadoutSelections._models||beModelCounts(recipe,entry.models),body=[...recipe.models].filter(m=>m.variable).sort((a,b)=>(b.max-b.min)-(a.max-a.min))[0];
  if(!counts)return '<p class="wb-warning">Composizione da verificare.</p>';
  return `<details><summary>Modelli della squadra</summary>${recipe.models.map(m=>`<div class="wb-loadout-choice"><span>${esc(m.name)}</span><div class="wb-quantity">${m.variable&&m.id!==body?.id?`<button type="button" data-wb-model="${m.id}" data-wb-model-step="-1" aria-label="Diminuisci ${esc(m.name)}" ${beModelChange(unit,entry,m.id,-1)?'':'disabled'}>−</button><output>${counts[m.id]}</output><button type="button" data-wb-model="${m.id}" data-wb-model-step="1" aria-label="Aumenta ${esc(m.name)}" ${beModelChange(unit,entry,m.id,1)?'':'disabled'}>+</button>`:`<output>${counts[m.id]}</output>`}</div></div>`).join('')}</details>`;
}
function beLoadoutHtml(unit,entry){
  const recipe=unit.loadoutRecipe;
  if(!unit.options.length)return '';
  const buttons='<div class="builder-actions"><button id="wb-default-save">Salva come mio default</button><button id="wb-default-delete">Rimuovi mio default</button></div>';
  if(!recipe?.groups)return '<p class="wb-warning">Dotazione da verificare manualmente: la fonte non è strutturata per questa scheda.</p>'+buttons;
  if(!entry.loadoutSelections)return '<button id="wb-standard" type="button">Applica dotazione standard</button><p class="wb-muted">Questa istanza conserva la dotazione manuale salvata.</p>'+buttons;
  return `${recipe.groups.filter(g=>g.choices.length>1).map(g=>`<fieldset class="wb-loadout-group"><legend>${esc(g.name)}${g.sharedPer?' · massimo '+Math.floor(entry.models/g.sharedPer)+' nella squadra':''}</legend>${g.choices.map(c=>{const n=entry.loadoutSelections[g.id]?.[c.id]||0;return `<div class="wb-loadout-choice"><span>${esc(c.name)}</span><div class="wb-quantity"><button id="choice-${g.id}-${c.id}-minus" data-wb-choice="${g.id}" data-wb-option="${c.id}" data-wb-delta="-1" aria-label="Diminuisci ${esc(g.name+' '+c.name)}" ${!beChoiceAllowed(unit,entry,g,c.id,-1)?'disabled':''}>−</button><output>${n}</output><button id="choice-${g.id}-${c.id}-plus" data-wb-choice="${g.id}" data-wb-option="${c.id}" data-wb-delta="1" aria-label="Aumenta ${esc(g.name+' '+c.name)}" ${!beChoiceAllowed(unit,entry,g,c.id,1)?'disabled':''}>+</button></div></div>`;}).join('')}</fieldset>`).join('')}${recipe.optionsCovered<recipe.optionsTotal?'<p class="wb-warning">Alcune restrizioni richiedono verifica nel testo delle opzioni.</p>':''}<div class="builder-actions"><button id="wb-default-save">Salva come mio default</button><button id="wb-standard">Dotazione standard</button><button id="wb-manual">Configurazione manuale</button>${builderUi.defaults.some(d=>d.unitId===unit.id)?'<button id="wb-default-delete">Rimuovi mio default</button>':''}</div>`;
}
function beEnhancementsHtml(unit,entry){
  const allowed=unit.enhancements.filter(x=>!x.detachment_id||builderUi.army.detachmentIds.includes(x.detachment_id)||entry.enhancementIds.includes(x.id));
  return ['Enhancement','Upgrade'].map(kind=>{const rows=allowed.filter(x=>(x.upgrade==='true'?'Upgrade':'Enhancement')===kind);return rows.length?`<h4>${kind}</h4>${rows.map(x=>`<label class="wb-check"><input data-wb-enhancement="${esc(x.id)}" type="checkbox" ${entry.enhancementIds.includes(x.id)?'checked':''} ${entry.enhancementIds.length&&!entry.enhancementIds.includes(x.id)?'disabled':''}><span>${esc(x.name)} · ${esc(x.cost)} pt</span></label>${entry.enhancementIds.includes(x.id)&&entry.models>1?`<label>Modello portatore<select data-wb-enhancement-model="${esc(x.id)}"><option value="">Scegli il modello</option>${unit.models.filter(m=>/\bCharacter\b/i.test(m.keywords||unit.keywords)).map(m=>`<option value="${esc(m.line)}" ${entry.enhancementModels?.[x.id]===m.line?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`:''}`).join('')}`:'';}).join('');
}
function beAllyRules(){
  const ids=builderUi.army.detachmentIds;
  return (wbFaction().allies||[]).filter(r=>(!r.detachmentIds.length||r.detachmentIds.some(id=>ids.includes(id)))&&!r.excludedDetachmentIds.some(id=>ids.includes(id)));
}
function beAllyRule(id){
  return beAllyRules().filter(r=>r.unitIds.includes(id)).sort((a,b)=>Number(Boolean(b.detachmentIds.length))-Number(Boolean(a.detachmentIds.length)))[0];
}
function beCatalogIds(){
  const ids=[...new Set([...wbFaction().unitIds,...beAllyRules().flatMap(r=>r.unitIds)])];
  if(!beAllyRules().some(r=>r.id==='shadow_legion'))return ids;
  const units=wbUnits();return ids.filter(id=>{const u=units.get(id);return /^Be[’']lakor$/i.test(u.name)||(!/Daemon Prince/i.test(u.name)&&!/(?:^|,\s*)Epic Hero(?:,|$)/i.test(u.keywords));});
}
function beEffects(unit,entry){
  if(!entry)return {unit,sources:[]};
  const parent=entry.attachedTo?wbEntry(entry.attachedTo):null,root=parent&&!parent.attachedTo?parent:entry,members=wbGroup(root),sources=[],derived=builderClone(unit),seen=new Set(),candidates=[];
  derived.models=beModelVariants(unit,entry);
  for(const member of members){
    const from=wbUnits().get(member.unitId),enhancements=from.enhancements.filter(x=>member.enhancementIds.includes(x.id));
    const rules=[...(from.effects||[]),...enhancements.flatMap(x=>{try{return JSON.parse(x.effectsJson||'[]').map(effect=>({...effect,_bearerModel:from.models.find(m=>m.line===member.enhancementModels?.[x.id])?.name}));}catch{return [];}})];
    for(const effect of rules){
      if(effect.gear&&!beHasGear(from,member,effect.gear))continue;
      if(effect.gear&&effect.scope==='bearer'&&member.entryId!==entry.entryId)continue;
      if(effect.scope==='bearer'&&!effect.gear&&(member.entryId!==entry.entryId||entry.models!==1&&!effect._bearerModel))continue;
      if(effect.condition==='leading'&&!member.attachedTo)continue;
      if(effect.condition&&effect.condition!=='leading')continue;
      candidates.push({effect,from});
    }
  }
  if(entry.models>1&&candidates.some(({effect})=>effect.scope==='bearer'&&effect._bearerModel))for(const weapon of derived.weapons)weapon._variants=beWeaponOwners(unit,entry,weapon).map(owner=>({...weapon,_forModel:owner.name,_count:owner.count}));
  const order={set:0,add:1,min:2,keyword:3};candidates.sort((a,b)=>(order[a.effect.operation]??9)-(order[b.effect.operation]??9));
  for(const {effect,from} of candidates){
      const identity=effect.source+':'+effect.field+':'+effect.value;if(seen.has(identity))continue;seen.add(identity);let changed=false;
      if(['A','S','AP','D','keywords'].includes(effect.field))for(const weapon of derived.weapons.flatMap(w=>w._variants||[w])){
        if(effect.weaponType&&weapon.type.toLowerCase()!==effect.weaponType)continue;
        if(effect.gear&&effect.scope==='bearer')continue; // A model-specific weapon effect needs a separate recipient mapping.
        if(effect.scope==='bearer'&&entry.models>1){const owners=beWeaponOwners(unit,entry,weapon);if(owners.some(o=>o.name!==effect._bearerModel))continue;}
        if(effect.field==='keywords'){
          const keyword=String(effect.value),stem=keyword.replace(/\s+\d+$/,'');let names=(wbDescription(weapon)||'').split(/,\s*/).filter(Boolean);
          const existing=names.find(n=>n.toUpperCase().startsWith(stem));
          if(!existing)names.push(keyword);else if((Number(keyword.match(/\d+$/)?.[0])||0)>(Number(existing.match(/\d+$/)?.[0])||0))names=names.map(n=>n===existing?keyword:n);
          const before=wbDescription(weapon);weapon.description=names.join(', ');delete weapon.descriptionRef;
          if(before!==weapon.description){weapon._addedKeywords=[...(weapon._addedKeywords||[]),keyword];changed=true;}
        }else{
          const old=String(weapon[effect.field]||''),n=Number(old);
          weapon[effect.field]=Number.isFinite(n)?String(effect.operation==='set'?effect.value:n+effect.value):/^D\d+(?:\+\d+)?$/i.test(old)?old+'+'+effect.value:old;
          if(old!==weapon[effect.field]){weapon._changed=[...(weapon._changed||[]),effect.field];changed=true;}
        }
      }else for(const model of derived.models){
        if(effect.gear&&effect.scope==='bearer'&&!model._gear?.includes(effect.gear))continue;
        if(effect._bearerModel&&effect.scope==='bearer'&&(model._baseName||model.name)!==effect._bearerModel)continue;
        const old=parseInt(model[effect.field],10),value=Number(effect.value);
        const result=effect.operation==='min'?Math.min(Number.isFinite(old)?old:99,value):effect.operation==='set'?value:old+value;
        if(Number.isFinite(result)&&result!==old){model[effect.field]=String(effect.field==='Sv'?Math.max(1,result):result)+(effect.field==='Sv'?'+':effect.field==='M'?'"':'');model._changed=[...(model._changed||[]),effect.field];changed=true;}
      }
      if(changed)sources.push(`${from.name} · ${effect.source}`);
  }
  return {unit:derived,sources:[...new Set(sources)]};
}
function beHasGear(unit,entry,name){
  const recipe=unit.loadoutRecipe;if(!recipe||!entry.loadoutSelections)return false;
  const gear=recipe.weapons.find(w=>w.ability===name);if(!gear)return false;
  return recipe.groups.some(g=>g.choices.some(c=>c.weapons[gear.id]&&(entry.loadoutSelections[g.id]?.[c.id]||0)>0));
}
function beModelName(name){
  return String(name).replace(/\s+models?$/i,'').replace(/^(?:the|every|each|a|an|Saint) /i,'').replace(/\b[a-z]{4,}\b/gi,word=>{
    word=word.toLowerCase();if(word==='chaos')return word;if(word==='knives')return 'knife';if(word==='wolves')return 'wolf';if(word.endsWith('men'))return word.slice(0,-3)+'man';if(word.endsWith('heroes'))return word.slice(0,-2);if(word.endsWith('ies'))return word.slice(0,-3)+'y';return word.replace(/s+$/,'');
  }).toLowerCase().replace(/[^a-z0-9]/g,'').replace(/s+$/,'').replace('hastariifusiller','hastariifusilier');
}
function beModelVariants(unit,entry){
  const recipe=unit.loadoutRecipe,key=beModelName;
  return unit.models.flatMap(sourceBase=>{
    const matched=recipe?.models.filter(m=>key(m.baseName||m.name)===key(sourceBase.name));
    if(!matched?.length||!entry.loadoutSelections)return [{...sourceBase}];
    return matched.flatMap(m=>{
    let base={...sourceBase};
    const groups=recipe.groups.filter(g=>g.model===m.id),capacity=groups.length?beCapacity(recipe,groups[0],entry.models,entry.loadoutSelections._models):m.fixed;
    if(!capacity)return [];
    if(m.baseName)base={...base,name:m.name,_baseName:base.name};
    const equipped=[];
    for(const g of groups)for(const c of g.choices)for(const [id,per] of Object.entries(c.weapons)){
      const gear=recipe.weapons.find(w=>w.id===id&&w.ability),n=(entry.loadoutSelections[g.id]?.[c.id]||0)*per;
      if(gear&&n)equipped.push({name:gear.ability,n});
    }
    if(!equipped.length)return [{...base,_count:capacity}];
    // Avoid assigning overlapping independent gear selections to invented individual models.
    if(equipped.length>1&&equipped.some(g=>g.n!==capacity))return [{...base,_count:capacity}];
    const n=equipped[0].n,names=equipped.map(g=>g.name),out=[{...base,name:base.name+' · '+names.join(', '),_baseName:base.name,_gear:names,_count:n}];
    if(n<capacity)out.push({...base,_count:capacity-n});return out;
    });
  });
}
function beEffectControls(entry){
  return '';
}
function beRich(text,unitId=''){
  const render=line=>typeof wbRuleInline==='function'?wbRuleInline(line,unitId):esc(line);
  text=String(text||'').replace(/([A-Z ]+DOCTRINE)(?=[A-Z][a-z])/g,'$1\n\n').replace(/(^•[^\n]*)\n\s*\n(?=• )/gm,'$1\n');
  return text.split(/\n\s*\n/).map(block=>{
    const lines=block.trim().split('\n');if(lines.every(line=>line.startsWith('• ')))return '<ul>'+lines.map(line=>'<li>'+render(line.slice(2))+'</li>').join('')+'</ul>';
    if(lines.length===1&&/^[A-Z][A-Z’ ,:()\-]{5,}$/.test(lines[0]))return '<h5>'+esc(lines[0])+'</h5>';
    return '<p>'+lines.map(render).join('<br>')+'</p>';
  }).join('');
}
function beAllyErrors(){
  if((builderUi.catalog.featuresVersion||0)<3)return [];
  const native=new Set(wbFaction().unitIds),units=wbUnits(),buckets=new Map(),errors=[];
  const has=(u,key)=>u.keywords.split(',').some(k=>k.trim().toLowerCase()===key.toLowerCase());
  for(const entry of builderUi.army.entries){
    if(native.has(entry.unitId))continue;
    const rule=beAllyRule(entry.unitId),unit=units.get(entry.unitId);
    if(!rule){errors.push(`${unit.name}: alleato non autorizzato dai distaccamenti selezionati.`);continue;}
    if(entry.warlord&&!rule.warlord)errors.push(`${unit.name}: questo alleato non può essere Warlord.`);
    if(entry.enhancementIds.length&&!rule.enhancements)errors.push(`${unit.name}: questo contingente non ammette potenziamenti.`);
    if(rule.id==='deathwatch_support'&&has(unit,'Kill Team'))for(const member of builderUi.army.entries.filter(e=>e.entryId===entry.entryId||e.attachedTo===entry.entryId))for(const id of member.enhancementIds){const x=units.get(member.unitId).enhancements.find(x=>x.id===id);if(!rule.detachmentIds.includes(x?.detachment_id))errors.push(`${unit.name}: il Kill Team può usare solo potenziamenti Deathwatch Support.`);}
    if(!buckets.has(rule.id))buckets.set(rule.id,{rule,entries:[]});buckets.get(rule.id).entries.push(entry);
  }
  const size=builderUi.army.limit;
  for(const {rule,entries} of buckets.values()){
    const total=entries.reduce((s,e)=>s+(wbPrice(e)||0)+e.enhancementIds.reduce((n,id)=>n+Number(units.get(e.unitId).enhancements.find(x=>x.id===id)?.cost||0),0),0),limit=rule.points[size];
    if(Object.keys(rule.points).length&&limit===undefined)errors.push(`${rule.name}: limite alleati non definito per questo formato personalizzato.`);
    if(limit!==undefined&&total>limit)errors.push(`${rule.name}: ${total} / ${limit} punti alleati.`);
    if(rule.kind==='titan'&&entries.reduce((s,e)=>s+e.models,0)>1)errors.push('Titanic Support: massimo un modello.');
    if(rule.kind==='knights'){const big=entries.filter(e=>has(units.get(e.unitId),'Titanic')).reduce((s,e)=>s+e.models,0),small=entries.reduce((s,e)=>s+e.models,0)-big;if((big&&(big>1||small))||small>3)errors.push(`${rule.name}: scegli un Titanic oppure fino a tre Armiger/War Dog.`);}
    if(rule.kind==='agents'){
      const limits={1000:[1,1,1],2000:[2,2,1],3000:[3,3,2]}[size],counts=[0,0,0];
      for(const e of entries){const u=units.get(e.unitId);if(has(u,'Requisitioned'))counts[2]++;else if(has(u,'Character'))counts[1]++;else if(has(u,'Retinue'))counts[0]++;else if(!has(u,'Dedicated Transport'))errors.push(`${u.name}: categoria Assigned Agents non risolta.`);}
      counts.forEach((n,i)=>{if(limits&&n>limits[i])errors.push(`Assigned Agents: limite ${['Retinue','Character','Requisitioned'][i]} superato.`);});
      if(!limits)errors.push('Assigned Agents: limiti non definiti per il formato personalizzato.');
    }
    if(rule.kind==='daemons')for(const god of ['Khorne','Tzeentch','Nurgle','Slaanesh']){const same=entries.filter(e=>has(units.get(e.unitId),god)),battleline=same.filter(e=>has(units.get(e.unitId),'Battleline')).length;if(same.length-battleline>battleline)errors.push(`Daemonic Pact: serve un’unità Battleline ${god} per ogni altra unità ${god}.`);}
  }
  if(beAllyRules().some(r=>r.id==='shadow_legion'))for(const e of builderUi.army.entries){const u=units.get(e.unitId);if((/Daemon Prince/i.test(u.name)||has(u,'Epic Hero'))&&!/^Be[’']lakor$/i.test(u.name))errors.push(`Shadow Legion: ${u.name} non è ammesso.`);}
  if(beAllyRules().some(r=>r.id==='ynnari')&&!builderUi.army.entries.some(e=>e.warlord&&['Yvraine','The Yncarne'].includes(units.get(e.unitId).name)))errors.push('Devoted of Ynnead: Yvraine o The Yncarne deve essere il Warlord.');
  return [...new Set(errors)];
}
function beGearLines(entry){
  const unit=wbUnits().get(entry.unitId),seen=new Set(),lines=[];
  for(const weapon of unit.weapons){if(!entry.weaponCounts[weapon.line]&&!(weapon.enhancement_id&&entry.enhancementIds.includes(weapon.enhancement_id)))continue;const group=unit.loadoutRecipe?.weapons.find(w=>w.lines.includes(weapon.line));const key=group?.id||weapon.line;if(seen.has(key))continue;seen.add(key);for(const owner of beWeaponOwners(unit,entry,weapon))lines.push(`${owner.count}x ${group?.name||weapon.name}${owner.name?' · '+owner.name:''}`);}
  for(const g of unit.loadoutRecipe?.groups||[])for(const c of g.choices)for(const [id,per] of Object.entries(c.weapons)){const gear=unit.loadoutRecipe.weapons.find(w=>w.id===id&&w.ability),n=(entry.loadoutSelections?.[g.id]?.[c.id]||0)*per;if(gear&&n)lines.push(`${n}x ${gear.name} · ${unit.loadoutRecipe.models.find(m=>m.id===g.model)?.name||''}`);}
  return lines;
}
function beExportText(format){
  const a=builderUi.army,units=wbUnits(),t=builderWorkbenchTotals(),detachments=wbDetachments().map(d=>d.name).join(', '),warlord=a.entries.find(e=>e.warlord);
  if(format==='names')return a.entries.map(e=>units.get(e.unitId).name).join('\n');
  if(format==='units'||format==='short'){
    const lines=[a.name,`${t.total} / ${a.limit} pt`,`Detachments: ${detachments||'—'}`,''];
    for(const e of a.entries){const u=units.get(e.unitId),cost=(wbPrice(e)??0)+e.enhancementIds.reduce((sum,id)=>sum+Number(u.enhancements.find(x=>x.id===id)?.cost||0),0);lines.push(`${e.models}x ${u.name} · ${cost} pt`);for(const id of e.enhancementIds){const item=u.enhancements.find(x=>x.id===id);if(item)lines.push(`  ${item.upgrade==='true'?'Upgrade':'Enhancement'}: ${item.name} · ${item.cost} pt`);}}
    return lines.join('\n');
  }
  const enhancements=a.entries.flatMap(e=>e.enhancementIds.map(id=>units.get(e.unitId).enhancements.find(x=>x.id===id)?.name).filter(Boolean));
  let lines;
  if(format==='wtc')lines=[`PLAYER NAME: ${state.user.name||''}`,`ARMY NAME: ${a.name}`,`FACTION: ${wbFaction().name}`,`TOTAL POINTS: ${t.total}/${a.limit}`,`DETACHMENTS: ${detachments}`,`DETACHMENT POINTS: ${wbDpSummary()}`,`FORCE DISPOSITION: ${a.disposition}`,`WARLORD: ${warlord?units.get(warlord.unitId).name:'—'}`,`ENHANCEMENTS / UPGRADES: ${enhancements.join(', ')||'—'}`,''];
  else if(format==='short')lines=[`${a.name} · ${wbFaction().name} · ${t.total}/${a.limit} pts`,detachments,a.disposition,''];
  else lines=[`${a.name} (${t.total} Points)`,wbFaction().name,`${{1000:'Incursion',2000:'Strike Force',3000:'Onslaught'}[a.limit]||'Custom'} (${a.limit} Points)`,detachments,`Force Disposition: ${a.disposition}`,''];
  for(const e of a.entries){const u=units.get(e.unitId),cost=(wbPrice(e)||0)+e.enhancementIds.reduce((sum,id)=>sum+Number(u.enhancements.find(x=>x.id===id)?.cost||0),0);
    lines.push(format==='short'?`${e.models}x ${u.name} (${cost} pts)${e.warlord?' [Warlord]':''}`:`${u.name} (${cost} Points)`,`  ${e.models} models${e.warlord?' · Warlord':''}`);
    if(e.attachedTo&&wbEntry(e.attachedTo))lines.push('  Attached to: '+wbInstanceName(wbEntry(e.attachedTo)));
    for(const gear of beGearLines(e))lines.push('  • '+gear);
    for(const id of e.enhancementIds){const x=u.enhancements.find(x=>x.id===id);lines.push(`  ${x.upgrade==='true'?'Upgrade':'Enhancement'}: ${x.name} (${x.cost} pts)`);}
    if(e.notes)lines.push('  '+e.notes);lines.push('');
  }
  return lines.join('\n');
}
function beExport(){
  const dialog=wbModal('Esporta lista',`<label>Formato<select data-wb-export-format><option value="gw">GW app · testo</option><option value="wtc">WTC</option><option value="units">Unità · punti e quantità</option><option value="names">Solo nomi</option></select></label><label>Lista esportata<textarea data-wb-export-text readonly rows="16">${esc(beExportText('gw'))}</textarea></label><div class="builder-actions"><button data-wb-export-copy>Copia negli appunti</button><button data-wb-export-download>Scarica TXT</button></div><p data-wb-export-status role="status"></p>`,main.querySelector('#wb-export'));
  const format=dialog.querySelector('[data-wb-export-format]'),text=dialog.querySelector('textarea');
  format.onchange=()=>{text.value=beExportText(format.value);dialog.querySelector('[data-wb-export-status]').textContent='';};
  dialog.querySelector('[data-wb-export-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(text.value);dialog.querySelector('[data-wb-export-status]').textContent='Lista copiata negli appunti.';}catch{text.focus();text.select();dialog.querySelector('[data-wb-export-status]').textContent='Copia automatica non disponibile: usa Ctrl+C o il menu del dispositivo sul testo selezionato.';}};
  dialog.querySelector('[data-wb-export-download]').onclick=()=>wbDownload('armata-'+format.value+'.txt',text.value,'text/plain;charset=utf-8');
  return dialog;
}
function beCopyActive(){
  if(!builderDiscard())return;
  const active=builderUi.active;if(!active||active.schemaVersion!==2)return;
  const oldUnits=wbUnits(),nextUnits=new Map(active.units.map(u=>[u.id,u])),copy=builderClone(builderUi.army),ids=new Map(copy.entries.map(e=>[e.entryId,wbId()]));
  for(const entry of copy.entries){
    const old=oldUnits.get(entry.unitId),next=nextUnits.get(entry.unitId);if(!next){notify('Una scheda della lista non esiste nel catalogo attivo.',true);return;}
    const weapons={};for(const [line,n] of Object.entries(entry.weaponCounts)){if(!n)continue;const name=old.weapons.find(w=>w.line===line)?.name,weapon=next.weapons.find(w=>w.name===name);if(!weapon){notify('Una dotazione salvata non è presente nel nuovo catalogo: copia non creata.',true);return;}weapons[weapon.line]=n;}
    if(entry.enhancementIds.some(id=>!next.enhancements.some(x=>x.id===id))){notify('Un potenziamento non è più disponibile: copia non creata.',true);return;}
    if(entry.enhancementModels){const bearers={};for(const [id,line] of Object.entries(entry.enhancementModels)){const name=old.models.find(m=>m.line===line)?.name,model=next.models.find(m=>m.name===name);if(!model){notify('Il modello portatore non è presente nel nuovo catalogo: copia non creata.',true);return;}bearers[id]=model.line;}entry.enhancementModels=bearers;}
    entry.weaponCounts=weapons;entry.entryId=ids.get(entry.entryId);entry.attachedTo=entry.attachedTo?ids.get(entry.attachedTo):null;
    if(JSON.stringify(old.loadoutRecipe)!==JSON.stringify(next.loadoutRecipe))delete entry.loadoutSelections;
  }
  const faction=active.factions.find(f=>f.id===copy.factionId);if(!faction){notify('Fazione non presente nel catalogo attivo.',true);return;}
  if(copy.detachmentIds.some(id=>!faction.detachments.some(d=>d.id===id))){notify('Un distaccamento non è disponibile nel catalogo attivo.',true);return;}
  copy.id=null;copy.catalogId=active.catalogId;copy.name=(copy.name+' · aggiornata').slice(0,100);delete copy.created;delete copy.updated;
  builderUi.catalog=active;builderUi.army=copy;Object.assign(workbench,{dirty:true,revision:workbench.revision+1,mode:'build',pane:'roster',selected:null,preview:null,activeEffects:{}});builderRender();notify('Copia aperta come bozza. Controlla punti e dotazione, poi salva.');
}
async function beSaveDefault(){
  const entry=wbEntry(workbench.selected);if(!entry)return;
  try{await api('builderDefaultSave',{catalogId:builderUi.army.catalogId,factionId:builderUi.army.factionId,unitId:entry.unitId,entry});builderUi.defaults=(await api('builderDefaults')).defaults;notify('Default personale salvato per le nuove unità.');}catch(err){notify(err.message,true);}
}
async function beDeleteDefault(){
  const entry=wbEntry(workbench.selected);if(!entry)return;
  try{await api('builderDefaultDelete',{unitId:entry.unitId});builderUi.defaults=(await api('builderDefaults')).defaults;notify('Default personale rimosso.');}catch(err){notify(err.message,true);}
}
