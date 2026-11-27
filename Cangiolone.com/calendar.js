'use strict';

let calendarView=null;

function calendarProposalMarkup(){
  const pending=calendarView.data.fixtures.filter(f=>f.proposal?.pending&&(!calendarView.league||calendarView.league===f.leagueId));
  if(!pending.length)return '';
  return '<section class="calendar-pending"><h2>Date da approvare</h2><p>Le proposte non occupano ancora un giorno nel calendario.</p><ul>'+pending.map(f=>{
    const proposal=f.proposal.pending,own=proposal.by===state.user.id;
    const actions=own?[['calendarWithdraw','Ritira proposta']]:[['calendarApprove','Approva data'],['calendarReject','Rifiuta']];
    return '<li><div><strong>'+esc(name(f.a))+' vs '+esc(name(f.b))+'</strong><p>'+esc(calendarLabel(proposal.event.date))+(proposal.event.time?' · '+esc(proposal.event.time):'')+'</p><small>Proposta di '+esc(name(proposal.by))+(own?' · In attesa dell’avversario':'')+'</small></div><div class="actions">'+
      (calendarFixtureEditable(f)?actions.map(([action,label])=>'<button type="button" data-calendar-proposal="'+action+'" data-fixture="'+esc(f.id)+'">'+label+'</button>').join(''):'<span>Campionato non attivo.</span>')+'</div></li>';
  }).join('')+'</ul></section>';
}
async function calendarProposalMutation(action,fixtureId,button){
  const fixture=calendarView.data.fixtures.find(f=>f.id===fixtureId);
  if(!fixture)return;
  button.disabled=true;
  try{
    await api(action,{fixture:fixtureId,proposalVersion:fixture.proposal.version});
    if(action==='calendarApprove'){
      const date=fixture.proposal.pending.event.date;
      calendarView.selected=date;calendarView.year=Number(date.slice(0,4));calendarView.month=Number(date.slice(5,7))-1;
    }
    await calendarPage();
    notify(action==='calendarApprove'?'Data approvata: l’incontro è nel calendario.':action==='calendarReject'?'Data rifiutata.':'Proposta ritirata.');
  }catch(error){notify(error.message,true);await calendarPage();}
  finally{if(button.isConnected)button.disabled=false;}
}
async function calendarListsDialog(event){
  if(!event)return;
  const fixture=calendarFixture(event),readable=event.lineups?.readable;
  const mine=[event.a,event.b].includes(state.user.id);
  const canSubmit=mine&&!readable&&(!fixture||calendarFixtureEditable(fixture));
  const dialog=document.createElement('dialog');dialog.className='calendar-dialog';dialog.setAttribute('aria-labelledby','calendar-lists-title');
  const links=readable?[event.a,event.b].map(player=>'<p><a href="api.php?action=calendarDownload&amp;id='+encodeURIComponent(event.id)+'&amp;player='+encodeURIComponent(player)+'" target="_blank" rel="noopener">Scarica la lista di '+esc(name(player))+'</a></p>').join(''):'';
  dialog.innerHTML='<div class="heading"><h2 id="calendar-lists-title">Liste esercito</h2><button type="button" data-close>Chiudi</button></div><p>'+esc(calendarEventTitle(event))+'</p>'+
    (readable?'<p>Entrambe le liste sono consegnate e definitive.</p>'+links:'<p>'+(event.lineups?.mine?'La tua lista è consegnata. Puoi sostituirla fino alla consegna dell’avversario.':event.lineups?.opponent?'L’avversario ha consegnato. Consegna la tua lista per rivelare entrambe.':'Le liste diventano visibili dopo entrambe le consegne.')+'</p>')+
    (canSubmit?'<form><p role="alert" class="error-inline" hidden></p><label class="field">Lista dal tuo builder<select name="builderArmyId" '+(fixture?.rosterRequired?'required':'')+' disabled><option value="">Caricamento…</option></select></label>'+
      (fixture?.rosterRequired?'<p>Il campionato richiede una lista dal builder, verificata rispetto al tuo roster.</p>':'<label class="field">Oppure incolla la lista<textarea name="text" rows="7" maxlength="1048576"></textarea></label><label class="field">Oppure carica un file .txt<input type="file" name="file" accept=".txt,text/plain"></label>')+
      '<p class="muted">La consegna conserva una copia: modificare in seguito la lista nel builder non cambia quella consegnata.</p><button class="primary" type="submit">'+(event.lineups?.mine?'Sostituisci la tua lista':'Consegna la tua lista')+'</button></form>':'');
  document.body.append(dialog);
  const trigger=document.activeElement,form=dialog.querySelector('form');let busy=false;
  dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();},{once:true});
  dialog.showModal();
  if(!form)return;
  const select=form.elements.builderArmyId,error=form.querySelector('[role="alert"]');
  select.onchange=()=>{for(const field of form.querySelectorAll('[name=text],[name=file]'))field.disabled=Boolean(select.value);};
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;error.hidden=true;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
      if(fixture?.rosterRequired&&select.disabled)throw new Error('Attendi il caricamento delle liste dal builder.');
      const builderArmyId=select.value,file=form.elements.file?.files?.[0];
      let text=form.elements.text?.value||'',filename;
      if(builderArmyId){text='';}
      else if(file){
        if(text.trim())throw new Error('Scegli una sola fonte: testo o file.');
        if(file.size>1048576)throw new Error('Il file deve pesare al massimo 1 MB.');
        if(!file.name.toLowerCase().endsWith('.txt'))throw new Error('Scegli un file .txt.');
        try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
        catch{throw new Error('Salva la lista come testo UTF-8.');}
        filename=file.name;
      }
      await api('calendarLineup',{id:event.id,version:event.version,builderArmyId,text,...(filename?{filename}:{})});
      dialog.close();await calendarPage();notify('Lista consegnata.');
    }catch(err){error.textContent=err.message;error.hidden=false;error.scrollIntoView({block:'nearest'});}
    finally{busy=false;submit.disabled=false;}
  };
  try{
    const data=await api('builderArmies');
    if(!dialog.isConnected)return;
    select.innerHTML='<option value="">Scegli una lista salvata</option>'+(data.armies||[]).filter(a=>a.purpose!=='pool').map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
    select.disabled=false;
  }catch(err){
    if(dialog.isConnected){select.innerHTML='<option value="">Builder non disponibile</option>';error.textContent=err.message;error.hidden=false;}
  }
}

function calendarISO(date){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function calendarMonthDays(year,month){
  const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7;
  const count=new Date(year,month+1,0,12).getDate();
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>i<offset||i>=offset+count?null:calendarISO(new Date(year,month,i-offset+1,12)));
}
function calendarLabel(date,options={day:'numeric',month:'long',year:'numeric'}){
  return new Date(date+'T12:00:00').toLocaleDateString('it-IT',options);
}
function calendarCanEdit(event){
  return state.user.admin||[event.owner,event.a,event.b].includes(state.user.id);
}
function calendarFixture(event){
  return calendarView.data.fixtures.find(f=>f.id===event.fixture);
}
function calendarActive(event){
  if(!event.fixture)return !event.cancelled;
  const fixture=calendarFixture(event);
  return !event.cancelled&&Boolean(fixture);
}
function calendarEventTitle(event){
  return name(event.a)+(event.b?' vs '+name(event.b):' · Avversario cercasi');
}
function calendarEventState(event){
  const fixture=calendarFixture(event);
  if(fixture?.result&&!fixture.result.void)return 'Giocato · '+fixture.result.scoreA+' : '+fixture.result.scoreB;
  if(fixture?.played)return 'Risultato annullato';
  if(fixture?.awaiting)return 'Risultato da confermare';
  if(event.date<calendarView.data.today)return 'Data trascorsa';
  return event.b?'Programmato':'Posto libero';
}
function calendarFixtureEditable(fixture){
  const league=calendarView.data.leagues.find(l=>l.id===fixture.leagueId);
  return !fixture.played&&league?.start&&!league.closed&&!league.paused&&[fixture.a,fixture.b].includes(state.user.id);
}
function calendarCanPropose(fixture){
  return calendarFixtureEditable(fixture)&&(!fixture.proposal?.pending||fixture.proposal.pending.by===state.user.id);
}
async function calendarPage(){
  if(page()!=='calendario')return;
  document.getElementById('calendar-dialog')?.close();
  main.innerHTML='<section class="panel"><h1>Calendario</h1><p role="status">Caricamento degli incontri…</p></section>';
  const panel=main.firstElementChild;
  try{
    const data=await api('calendar');
    if(page()!=='calendario'||main.firstElementChild!==panel)return;
    const selected=calendarView?.selected||data.today;
    calendarView={data,selected,year:calendarView?.year??Number(selected.slice(0,4)),month:calendarView?.month??Number(selected.slice(5,7))-1,league:calendarView?.league||'',mine:calendarView?.mine||false};
    panel.className='panel calendar-page';
    panel.innerHTML='<div class="heading"><div><h1>Calendario</h1><p class="intro">Trova un avversario. Organizza la prossima battaglia.</p></div><button type="button" class="primary" data-calendar-new>Programma partita</button></div>'+
      '<div class="calendar-toolbar"><div class="calendar-month-nav"><button type="button" data-calendar-month="-1" aria-label="Mese precedente">←</button><h2 id="calendar-month-title"></h2><button type="button" data-calendar-month="1" aria-label="Mese successivo">→</button><button type="button" data-calendar-today>Oggi</button></div>'+
      '<div class="calendar-filters"><label>Campionato<select id="calendar-league"><option value="">Tutti gli incontri</option><option value="friendly">Partite libere</option>'+data.leagues.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>').join('')+'</select></label><label class="calendar-check"><input id="calendar-mine" type="checkbox"> Solo i miei</label></div></div>'+
      '<p class="calendar-help muted">Premi un giorno per creare una partita. Premi un incontro per consultarne i dettagli. Gli orari sono quelli italiani.</p>'+
      '<div class="calendar-legend"><span><i class="calendar-dot friendly"></i>Partita libera</span><span><i class="calendar-dot league"></i>Campionato</span><span><i class="calendar-dot open"></i>Posto libero</span></div>'+
      '<div id="calendar-grid"></div><section class="calendar-agenda" id="calendar-agenda" aria-live="polite"></section>'+
      '<section class="calendar-unscheduled" id="calendar-unscheduled"></section><section class="calendar-open" id="calendar-open"></section>';
    panel.querySelector('#calendar-league').value=calendarView.league;
    panel.querySelector('#calendar-mine').checked=calendarView.mine;
    panel.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-calendar-new'))calendarOpenDialog(calendarView.selected);
      if(button.dataset.calendarDay){calendarView.selected=button.dataset.calendarDay;calendarDraw();calendarOpenDialog(calendarView.selected);}
      if(button.dataset.calendarEvent){const item=calendarView.data.events.find(e=>e.id===button.dataset.calendarEvent);calendarView.selected=item.date;calendarDraw();panel.querySelector('#calendar-agenda').scrollIntoView({block:'nearest',behavior:'smooth'});}
      if(button.dataset.calendarEdit){const item=calendarView.data.events.find(e=>e.id===button.dataset.calendarEdit);calendarOpenDialog(item.date,item);}
      if(button.dataset.calendarFixture){const fixture=calendarView.data.fixtures.find(f=>f.id===button.dataset.calendarFixture);calendarOpenDialog(calendarView.selected,null,fixture);}
      if(button.dataset.calendarProposal)calendarProposalMutation(button.dataset.calendarProposal,button.dataset.fixture,button);
      if(button.dataset.calendarLists)calendarListsDialog(calendarView.data.events.find(e=>e.id===button.dataset.calendarLists));
      if(button.hasAttribute('data-calendar-month')){
        const date=new Date(calendarView.year,calendarView.month+Number(button.dataset.calendarMonth),1,12);
        calendarView.year=date.getFullYear();calendarView.month=date.getMonth();calendarView.selected=calendarISO(date);calendarDraw();
      }
      if(button.hasAttribute('data-calendar-today')){
        calendarView.selected=calendarView.data.today;calendarView.year=Number(calendarView.selected.slice(0,4));calendarView.month=Number(calendarView.selected.slice(5,7))-1;calendarDraw();
      }
      if(button.dataset.calendarJoin)calendarMutation('calendarJoin',button.dataset.calendarJoin,button);
      if(button.dataset.calendarCancel&&confirm('Annullare la programmazione? L’incontro di campionato e i risultati rimangono invariati.'))calendarMutation('calendarCancel',button.dataset.calendarCancel,button);
    });
    panel.querySelectorAll('.calendar-filters input,.calendar-filters select').forEach(input=>input.addEventListener('change',()=>{
      calendarView.league=panel.querySelector('#calendar-league').value;calendarView.mine=panel.querySelector('#calendar-mine').checked;calendarDraw();
    }));
    calendarDraw();
  }catch(error){
    if(page()!=='calendario'||main.firstElementChild!==panel)return;
    panel.innerHTML='<h1>Calendario</h1><p role="alert">'+esc(error.message)+'</p><button type="button">Riprova</button>';
    panel.querySelector('button').onclick=()=>calendarPage();
  }
}
function calendarFilteredEvents(){
  return calendarView.data.events.filter(event=>{
    const fixture=calendarFixture(event);
    return calendarActive(event)&&(!calendarView.mine||[event.a,event.b].includes(state.user.id))&&
      (!calendarView.league||(calendarView.league==='friendly'?!event.fixture:fixture?.leagueId===calendarView.league));
  });
}
function calendarDraw(){
  if(page()!=='calendario')return;
  const view=calendarView,events=calendarFilteredEvents(),panel=main.querySelector('.calendar-page');
  const month=calendarLabel(calendarISO(new Date(view.year,view.month,1,12)),{month:'long',year:'numeric'});
  panel.querySelector('#calendar-month-title').textContent=month;
  const days=calendarMonthDays(view.year,view.month),weekdays=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  panel.querySelector('#calendar-grid').innerHTML='<table class="calendar-table" aria-labelledby="calendar-month-title"><thead><tr>'+weekdays.map(day=>'<th scope="col">'+day+'</th>').join('')+'</tr></thead><tbody>'+
    Array.from({length:days.length/7},(_,row)=>'<tr>'+days.slice(row*7,row*7+7).map(date=>{
      if(!date)return '<td class="calendar-outside"></td>';
      const items=events.filter(e=>e.date===date).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
      return '<td class="'+(date===view.selected?'calendar-selected ':'')+(date===view.data.today?'calendar-today':'')+'"><button type="button" class="calendar-day" data-calendar-day="'+date+'" aria-label="'+esc(calendarLabel(date))+', '+items.length+' incontri. Crea partita." '+(date===view.data.today?'aria-current="date"':'')+'><span>'+Number(date.slice(-2))+'</span><small>'+items.length+'<span class="sr-only"> incontri</span></small></button>'+
        '<div class="calendar-day-events">'+items.slice(0,3).map(e=>'<button type="button" class="calendar-event '+(e.fixture?'league':!e.b?'open':'friendly')+'" data-calendar-event="'+esc(e.id)+'" title="'+esc(calendarEventTitle(e))+'">'+(e.time?'<b>'+esc(e.time)+'</b> ':'')+esc(calendarEventTitle(e))+'</button>').join('')+(items.length>3?'<button type="button" class="calendar-more" data-calendar-event="'+esc(items[3].id)+'">Altri '+(items.length-3)+'</button>':'')+'</div></td>';
    }).join('')+'</tr>').join('')+'</tbody></table>';
  const selected=events.filter(e=>e.date===view.selected).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  panel.querySelector('#calendar-agenda').innerHTML='<div class="heading"><h2>'+esc(calendarLabel(view.selected,{weekday:'long',day:'numeric',month:'long'}))+'</h2><button type="button" data-calendar-new>+ Programma qui</button></div>'+
    (selected.length?selected.map(e=>{
      const fixture=calendarFixture(e),league=view.data.leagues.find(l=>l.id===fixture?.leagueId);
      const editable=e.fixture?calendarCanPropose(fixture):calendarCanEdit(e);
      const joinable=!e.fixture&&!e.b&&e.a!==state.user.id&&e.date>=view.data.today;
      return '<article class="calendar-agenda-event"><div class="calendar-event-time">'+(e.time?esc(e.time):'Da definire')+'</div><div class="calendar-event-details"><p class="calendar-event-kind">'+(fixture?esc(league.name)+' · Giornata '+fixture.round:'Partita libera')+'</p><h3>'+esc(calendarEventTitle(e))+'</h3><p>'+esc(calendarEventState(e))+'</p>'+
        (e.location?'<p>Luogo: '+esc(e.location)+'</p>':'')+(e.notes?'<p class="calendar-notes">'+esc(e.notes)+'</p>':'')+
        (e.fixture?'<p><a href="campionato.php?id='+encodeURIComponent(fixture.leagueId)+'&amp;fixture='+encodeURIComponent(fixture.id)+'">Apri incontro di campionato</a></p>':'')+
        '<div class="actions">'+(joinable?'<button class="primary" type="button" data-calendar-join="'+esc(e.id)+'">Partecipa</button>':'')+([e.a,e.b].includes(state.user.id)||e.lineups?.readable?'<button type="button" data-calendar-lists="'+esc(e.id)+'">Liste esercito</button>':'')+(editable?'<button type="button" data-calendar-edit="'+esc(e.id)+'">'+(e.fixture?'Proponi nuova data':'Modifica')+'</button><button type="button" data-calendar-cancel="'+esc(e.id)+'">Annulla programmazione</button>':'')+'</div></div></article>';
    }).join(''):'<p class="muted">Nessun incontro per questo giorno con i filtri attuali.</p>');
  const undated=view.data.fixtures.filter(f=>!f.played&&!view.data.events.some(e=>e.fixture===f.id&&!e.cancelled)&&
    (!view.mine||[f.a,f.b].includes(state.user.id))&&(!view.league||view.league===f.leagueId));
  panel.querySelector('#calendar-unscheduled').innerHTML=calendarProposalMarkup()+'<h2>Campionati · Data da concordare</h2><p class="muted">Uno dei giocatori propone una data, l’altro la approva. Solo allora l’incontro compare nel calendario.</p>'+
    (undated.length?'<ul>'+undated.map(f=>{
      const league=view.data.leagues.find(l=>l.id===f.leagueId);
      return '<li><div><strong>'+esc(name(f.a))+' vs '+esc(name(f.b))+'</strong><small>'+esc(league.name)+' · Giornata '+f.round+(league.closed?' · Concluso':league.paused?' · In pausa':'')+'</small></div>'+(calendarCanPropose(f)?'<button type="button" data-calendar-fixture="'+esc(f.id)+'">Proponi data</button>':'<a href="campionato.php?id='+encodeURIComponent(f.leagueId)+'&amp;fixture='+encodeURIComponent(f.id)+'">Apri incontro</a>')+'</li>';
    }).join('')+'</ul>':'<p>Nessun incontro in attesa di una data con i filtri attuali.</p>');
  const open=view.data.leagues.filter(l=>!l.start&&!l.closed&&!l.paused);
  panel.querySelector('#calendar-open').innerHTML=open.length?'<h2>Iscrizioni ai campionati</h2>'+open.map(l=>'<p><a href="campionato.php?id='+encodeURIComponent(l.id)+'">'+esc(l.name)+' · '+(l.joined?'Sei iscritto':'Iscriviti al campionato')+'</a></p>').join(''):'';
}
async function calendarMutation(action,id,button){
  const event=calendarView.data.events.find(e=>e.id===id);if(!event)return;
  button.disabled=true;
  try{await api(action,{id:event.id,version:event.version});await calendarPage();notify(action==='calendarJoin'?'Partecipazione confermata.':'Programmazione annullata.');}
  catch(error){notify(error.message,true);await calendarPage();}
  finally{if(button.isConnected)button.disabled=false;}
}
function calendarOpenDialog(date,event=null,fixture=null){
  const existingFixture=fixture?calendarView.data.events.find(e=>e.fixture===fixture.id):null;
  if(existingFixture)event=existingFixture;
  fixture=fixture||(event?.fixture?calendarFixture(event):null);
  const dialog=document.createElement('dialog');dialog.id='calendar-dialog';dialog.className='calendar-dialog';dialog.setAttribute('aria-labelledby','calendar-dialog-title');
  const id=event?.id||crypto.randomUUID().replaceAll('-','').slice(0,24);
  const editablePlayers=!event||state.user.admin||event.owner===state.user.id;
  const available=calendarView.data.fixtures.filter(f=>calendarCanPropose(f)&&!calendarView.data.events.some(e=>e.fixture===f.id&&!e.cancelled));
  const playerOptions=(selected,empty)=>'<option value="">'+empty+'</option>'+state.users.map(u=>'<option value="'+esc(u.id)+'" '+(u.id===selected?'selected':'')+'>'+esc(u.name)+'</option>').join('');
  dialog.innerHTML='<div class="heading"><h2 id="calendar-dialog-title">'+(event&&!event.cancelled?'Modifica incontro':'Programma una partita')+'</h2><button type="button" data-calendar-close>Chiudi</button></div><form id="calendar-event-form"><p class="error-inline" role="alert" hidden></p>'+
    '<label class="field">Tipo di incontro<select name="fixture" '+(event||fixture?'disabled':'')+'><option value="">Partita libera</option>'+
    (fixture?[fixture]:available).map(f=>'<option value="'+esc(f.id)+'" '+(fixture?.id===f.id?'selected':'')+'>'+esc(calendarView.data.leagues.find(l=>l.id===f.leagueId).name)+' · G'+f.round+' · '+esc(name(f.a))+' vs '+esc(name(f.b))+'</option>').join('')+'</select></label>'+
    '<div class="form-grid"><label class="field">Data<input type="date" name="date" required min="'+calendarView.data.today+'" max="2100-12-31" value="'+esc(date)+'"></label><label class="field">Orario italiano (facoltativo)<input type="time" name="time" value="'+esc(event?.time||'')+'"></label>'+
    '<label class="field">Giocatore A<select name="a" required '+(!editablePlayers||fixture?'disabled':'')+'>'+playerOptions(event?.a||fixture?.a||state.user.id,'Scegli un giocatore')+'</select></label><label class="field">Giocatore B<select name="b" '+(!editablePlayers||fixture?'disabled':'')+'>'+playerOptions(event?.b||fixture?.b||'','Posto libero · cerca un avversario')+'</select></label>'+
    '<label class="field full">Luogo (facoltativo)<input name="location" maxlength="160" value="'+esc(event?.location||'')+'"></label><label class="field full">Note (facoltative)<textarea name="notes" rows="3" maxlength="1000">'+esc(event?.notes||'')+'</textarea></label></div>'+
    '<p class="muted">Serve almeno un giocatore. Lasciando libero il secondo posto, un altro giocatore può partecipare dal calendario. Per i campionati si usano gli abbinamenti già pubblicati.</p><button type="submit" class="primary wide">Salva programmazione</button></form>';
  document.body.append(dialog);
  const trigger=document.activeElement,form=dialog.querySelector('form'),error=form.querySelector('[role="alert"]');
  let busy=false,version=event?.version||0;
  dialog.querySelector('[data-calendar-close]').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();},{once:true});
  const syncPlayers=()=>{
    const f=calendarView.data.fixtures.find(f=>f.id===form.elements.fixture.value);
    form.querySelector('[type=submit]').textContent=f?'Invia proposta all’avversario':'Salva programmazione';
    if(f){form.elements.a.value=f.a;form.elements.b.value=f.b;}
    form.elements.a.disabled=form.elements.b.disabled=Boolean(f)||!editablePlayers;
    for(const option of form.elements.b.options)option.disabled=Boolean(option.value)&&option.value===form.elements.a.value;
    if(!f&&form.elements.a.value===form.elements.b.value)form.elements.b.value='';
  };
  form.elements.fixture.onchange=syncPlayers;form.elements.a.onchange=syncPlayers;syncPlayers();
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;error.hidden=true;
    const selectedFixture=calendarView.data.fixtures.find(f=>f.id===form.elements.fixture.value);
    const existing=selectedFixture?calendarView.data.events.find(e=>e.fixture===selectedFixture.id):event;
    const data={id:existing?.id||id,version:existing?.version||version,proposalVersion:selectedFixture?.proposal?.version||0,fixture:form.elements.fixture.value,date:form.elements.date.value,time:form.elements.time.value,a:form.elements.a.value,b:form.elements.b.value,location:form.elements.location.value,notes:form.elements.notes.value};
    dialog.querySelectorAll('button').forEach(b=>b.disabled=true);form.setAttribute('aria-busy','true');
    try{
      await api('calendarSave',data);calendarView.selected=data.date;calendarView.year=Number(data.date.slice(0,4));calendarView.month=Number(data.date.slice(5,7))-1;
      dialog.close();await calendarPage();notify(data.fixture?'Data proposta. L’avversario deve approvarla prima che compaia nel calendario.':'Incontro programmato.');
    }catch(err){
      error.textContent=err.message;error.hidden=false;error.scrollIntoView({block:'nearest'});
      // Refresh the revision after a rejected concurrent edit, without silently overwriting it.
      if(err.status===409){error.textContent+=' Chiudi e riapri il calendario prima di riprovare.';}
    }finally{busy=false;form.removeAttribute('aria-busy');dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  dialog.showModal();
}
