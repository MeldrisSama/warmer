'use strict';

// Only the match archive contains played results; fixtures are metadata, never extra games.
function personalResults(matches,player,filters={}){
  const seen=new Set();
  return matches.filter(m=>{
    if(m.void||seen.has(m.id)||![m.a,m.b].includes(player))return false;
    seen.add(m.id);
    return (!filters.from||m.date>=filters.from)&&(!filters.to||m.date<=filters.to)
      &&(!filters.opponent||[m.a,m.b].includes(filters.opponent))
      &&(!filters.type||(filters.type==='league'?Boolean(m.leagueId):!m.leagueId))
      &&(!filters.league||m.leagueId===filters.league);
  }).map(m=>{
    const mine=m.a===player,scored=mine?m.scoreA:m.scoreB,conceded=mine?m.scoreB:m.scoreA;
    return {...m,opponent:mine?m.b:m.a,scored,conceded,result:scored>conceded?'V':scored<conceded?'S':'P'};
  }).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created||'').localeCompare(String(b.created||''))||a.id.localeCompare(b.id));
}

function summarizeResults(results){
  const played=results.length,w=results.filter(m=>m.result==='V').length,d=results.filter(m=>m.result==='P').length;
  const scored=results.reduce((n,m)=>n+m.scored,0),conceded=results.reduce((n,m)=>n+m.conceded,0);
  let winStreak=0;
  for(let i=results.length-1;i>=0&&results[i].result==='V';i--)winStreak++;
  return {played,w,d,l:played-w-d,winStreak,scored,conceded,diff:scored-conceded,winRate:played?100*w/played:null,averageFor:played?scored/played:null,averageAgainst:played?conceded/played:null};
}

function statisticsNumber(value){
  return value===null?'—':value.toLocaleString('it-IT',{maximumFractionDigits:1});
}

function statisticsSummary(summary){
  return `<dl class="statistics-summary" aria-label="Riepilogo dei risultati">
      ${[['Partite',summary.played],['Vittorie',summary.w],['Pareggi',summary.d],['Sconfitte',summary.l],['Vittorie %',summary.winRate===null?'—':statisticsNumber(summary.winRate)+'%'],['Differenza punti',(summary.diff>0?'+':'')+summary.diff],['Media punti fatti',statisticsNumber(summary.averageFor)],['Media punti subiti',statisticsNumber(summary.averageAgainst)],['Serie di vittorie attuale',summary.winStreak]].map(([label,value])=>`<div class="${label==='Vittorie'?'statistics-win':label==='Pareggi'?'statistics-draw':label==='Serie di vittorie attuale'?'statistics-streak':''}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
    </dl>`;
}

function statisticsPage(target=main){
  const params=new URLSearchParams(location.hash.split('?')[1]||'');
  const filters=Object.fromEntries(['from','to','opponent','type','league'].map(key=>[key,params.get(key)||'']));
  const results=personalResults(state.matches,state.user.id,filters),summary=summarizeResults(results);
  const names=new Map(state.users.map(u=>[u.id,u.name]));
  const leagues=new Map((state.leagues||[]).map(l=>[l.id,l.title||l.name||'Campionato']));
  const option=(value,label,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
  const opponents=[...new Set(personalResults(state.matches,state.user.id).map(m=>m.opponent))].sort((a,b)=>(names.get(a)||'').localeCompare(names.get(b)||'','it'));
  const headToHead=opponents.map(id=>({id,...summarizeResults(results.filter(m=>m.opponent===id))})).filter(r=>r.played);
  const invalidRange=filters.from&&filters.to&&filters.from>filters.to;
  target.innerHTML=`<section class="statistics-page">
    <h2>Statistiche personali</h2>
    <details class="statistics-filter-box"><summary>Filtri${Object.values(filters).filter(Boolean).length?' · '+Object.values(filters).filter(Boolean).length+' attivi':' · Tutte le partite'}</summary>
    <form id="statistics-filters" class="statistics-filters" aria-labelledby="statistics-filter-title">
      <h2 id="statistics-filter-title">Filtri</h2>
      <label class="field">Dal<input type="date" name="from" value="${esc(filters.from)}"></label>
      <label class="field">Al<input type="date" name="to" value="${esc(filters.to)}"></label>
      <label class="field">Tipo<select name="type">${option('','Tutte le partite',filters.type)}${option('friendly','Amichevoli',filters.type)}${option('league','Campionato',filters.type)}</select></label>
      <label class="field">Campionato<select name="league">${option('','Tutti i campionati',filters.league)}${[...leagues].map(([id,title])=>option(id,title,filters.league)).join('')}</select></label>
      <label class="field">Avversario<select name="opponent">${option('','Tutti gli avversari',filters.opponent)}${opponents.map(id=>option(id,names.get(id)||'Giocatore',filters.opponent)).join('')}</select></label>
      <div class="statistics-filter-actions"><button type="submit" class="primary">Applica filtri</button><a href="#profilo?sezione=statistiche">Azzera filtri</a><span data-filter-player>${filters.opponent?playerLink(filters.opponent):''}</span></div>
    </form></details>
    ${invalidRange?'<p role="alert" class="error-inline">La data iniziale deve precedere o coincidere con quella finale.</p>':''}
    <p class="statistics-note">Solo partite registrate e non annullate; i risultati del campionato compaiono dopo la conferma. Le percentuali includono i pareggi nel totale. La serie attuale conta le vittorie consecutive finali nei risultati filtrati; un pareggio o una sconfitta la interrompe.</p>
    ${statisticsSummary(summary)}
    ${!results.length?empty('trophy','Nessuna partita','Non ci sono risultati personali per i filtri selezionati.'):`
    <section class="statistics-section"><h2>Andamento recente</h2><p>Ultime ${Math.min(results.length,10)} partite dei risultati filtrati, dalla meno recente.</p><ol class="statistics-form">${results.slice(-10).map(m=>`<li class="statistics-result result-${m.result}"><strong>${m.result==='V'?'Vittoria':m.result==='S'?'Sconfitta':'Pareggio'}</strong><span>${esc(dateLabel(m.date))}</span><span>${playerLink(m.opponent)}</span><b>${m.scored}–${m.conceded}</b></li>`).join('')}</ol></section>
    <section class="statistics-section"><h2>Confronti diretti</h2><div class="statistics-table-scroll" tabindex="0" role="region" aria-label="Confronti diretti, scorri per tutte le colonne"><table><thead><tr><th scope="col">Avversario</th><th scope="col">Partite</th><th scope="col">Vinte</th><th scope="col">Pari</th><th scope="col">Perse</th><th scope="col">Vittorie %</th><th scope="col">Diff. punti</th></tr></thead><tbody>${headToHead.map(r=>`<tr><th scope="row">${playerLink(r.id)}</th><td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${statisticsNumber(r.winRate)}%</td><td>${r.diff>0?'+':''}${r.diff}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="statistics-section"><h2>Storico dei risultati</h2><ul class="statistics-history">${[...results].reverse().map(m=>`<li class="result-${m.result}"><div><strong>${playerLink(m.opponent)}</strong><span>${esc(dateLabel(m.date))} · ${esc(m.leagueId?(leagues.get(m.leagueId)||'Campionato'):'Amichevole')}</span>${m.mission?`<span>${esc(m.mission)}</span>`:''}</div><div><strong>${m.scored}–${m.conceded}</strong><span>${m.result==='V'?'Vittoria':m.result==='S'?'Sconfitta':'Pareggio'}</span></div></li>`).join('')}</ul></section>`}
  </section>`;
  const form=target.querySelector('#statistics-filters');
  const opponent=form.elements.opponent,opponentProfile=form.querySelector('[data-filter-player]');
  opponent.addEventListener('change',()=>{opponentProfile.innerHTML=opponent.value?playerLink(opponent.value):'';});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(form));
    if(data.from&&data.to&&data.from>data.to){form.elements.to.setCustomValidity('La data finale deve essere uguale o successiva a quella iniziale.');form.elements.to.reportValidity();return;}
    const query=new URLSearchParams([['sezione','statistiche'],...Object.entries(data).filter(([,v])=>v)]);
    location.hash='profilo?'+query;
  });
  form.elements.to.addEventListener('input',()=>form.elements.to.setCustomValidity(''));
  form.elements.from.addEventListener('input',()=>form.elements.to.setCustomValidity(''));
  form.elements.league.addEventListener('change',()=>{if(form.elements.league.value)form.elements.type.value='league';});
  form.elements.type.addEventListener('change',()=>{if(form.elements.type.value==='friendly')form.elements.league.value='';});
}
