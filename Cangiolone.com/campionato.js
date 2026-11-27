'use strict';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const dateFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = date => dateFormat.format(Date.parse(date));
const action = (name, label, kind = 'primary') =>
  `<button type="submit" class="${kind}" name="action" value="${name}">${label}</button>`;
const narrowLayout = matchMedia('(max-width: 850px)');
const panelHeadings = { classifica: 'standings-heading', giornate: 'round-heading' };
const leagueQuery = new URLSearchParams(window.location.search);

let state;
let leagueView = 'classifica';
let selectedRound;
let openFixture;
let lineupRequest;
let openingToken;
let announcementToken;
let builderArmies=[];
let builderListsLoaded=false;
let leagueSubmitting=false;
let leagueRefreshing=false;
let tournamentRefreshTimer=null;
let bracketObserver;
const rosterScans=new Map();
const leagueFactionKey=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const armyName=key=>Object.values(state.armyGroups||{}).find(group=>group[key])?.[key]||'';
const listsFor=(pool,faction)=>builderArmies.filter(a=>(a.purpose==='pool')===pool &&
  (!faction || leagueFactionKey(a.factionName)===leagueFactionKey(faction)));
const builderOption=(army,points)=>`<option value="${escapeHtml(army.id)}">${escapeHtml(army.name)} · ${escapeHtml(points===undefined?(army.factionName||army.edition+'ª ed.'):points+' pt')}</option>`;
function builderListOptions(pool=false,faction=''){
  return `<option value="">${pool?'Scegli un pool del campionato':'Scegli una lista salvata'}</option>`+
    listsFor(pool,faction).map(a=>builderOption(a)).join('');
}

async function request(name, data) {
  const id = leagueQuery.get('id') || state?.league?.id;
  const query = name !== 'league' ? '' : id ? '&id=' + encodeURIComponent(id)
    : leagueQuery.get('new') === '1' ? '&new=1' : '';
  const response = await fetch(`api.php?action=${name}${query}`, data ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
    body: JSON.stringify(data)
  } : undefined);
  const payload = await response.json();
  if (response.status === 401 && !data) return null;
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Operazione non riuscita.'),{status:response.status});
  return payload;
}

const player = id => escapeHtml(state.users.find(user => user.id === id)?.name || 'Giocatore');
const playerLink = id => {
  const hash = id === state.user.id ? '#profilo' : '#profilo?giocatore=' + encodeURIComponent(id);
  return `<a class="player-link" href="./${escapeHtml(hash)}">${player(id)}</a>`;
};
const armyLabel = id => armyName(state.armies[id]);
const playerArmy = id => armyLabel(id) ? `<small class="player-army">${escapeHtml(armyLabel(id))}</small>` : '';
const confirmed = fixture => fixture.result && !fixture.result.void;
const resolved = fixture => confirmed(fixture) || fixture.decision;
const playable = fixture => fixture.b !== null;
const mine = fixture => fixture.lineups !== null;
const formats = { round_robin: 'Girone unico · sola andata', round_robin_legs: 'Girone unico · andata e ritorno', knockout: 'Eliminazione diretta', knockout_legs: 'Eliminazione diretta · andata e ritorno', swiss: 'Torneo svizzero' };
const knockout = () => ['knockout','knockout_legs'].includes(state.league?.format);
const twoLegs = () => state.league?.format === 'knockout_legs';
const fixedEntryList = () => state.league?.entry_list_limit>0;
const requiresBuilderLineup = () => Boolean(state.rosters?.settings || state.league?.match_point_limit);
const builderLink = (pool=false,army='',edit='',newArmy=false) => {
  const params=new URLSearchParams({leagueReturn:state.league.id});
  if(pool)params.set('poolLimit',state.rosters.settings.rosterLimit);
  if(army)params.set('leagueFaction',army);
  if(edit)params.set('poolEdit',edit);
  if(newArmy)params.set('newArmy','1');
  return 'index.php?'+params+'#builder';
};

function roundLabel(round) {
  if (knockout()) {
    const stage = state.tournament.bracket[round-1];
    const previous = state.tournament.bracket[round-2];
    const players = stage?.series.length ? stage.series.reduce((count,series)=>count+(series.b?2:1),0)
      : previous ? previous.series.length || previous.feeds.length : state.players.length;
    if (players===2) return 'Finale';
    if (players===4) return 'Semifinali';
    if (players===8) return 'Quarti';
    if (players===16) return 'Ottavi';
    return `Turno a ${players}`;
  }
  const phase = state.league?.format==='round_robin_legs'
    ? (state.fixtures.find(fixture=>fixture.round===round)?.leg===2 ? ' · Ritorno' : ' · Andata') : '';
  return `${state.tournament ? 'Turno' : 'Giornata'} ${round}${phase}`;
}

function initialDrawFields(players) {
  const byes = players.length % 2;
  const maxRounds = players.length - 1 + players.length % 2;
  if (!state.tournament) {
    const double=state.league.format==='round_robin_legs';
    const rounds=maxRounds*(double?2:1);
    const rests=byes?(double?'due riposi per giocatore':'un riposo per giocatore'):'nessun riposo';
    return `<p class="tournament-draw-preview"><strong>Riepilogo del calendario</strong> · ${players.length} iscritti · ${rounds} ${rounds===1?'giornata':'giornate'} · ${rests}.</p>`;
  }
  const entrants = state.users.filter(user => players.includes(user.id)).sort((a,b) => a.name.localeCompare(b.name,'it'));
  return `<input type="hidden" name="signupRevision" value="${state.tournament.signupRevision}">
    ${knockout() ? '' : `<label>Numero di turni<input type="number" name="rounds" min="1" max="${maxRounds}" value="${Math.min(3,maxRounds)}" required></label>`}
    <p class="tournament-draw-preview" data-draw-preview aria-live="polite">${drawSummary(Math.min(3,maxRounds))}</p>
    ${byes ? `<fieldset class="tournament-options" data-max-byes="${byes}"><legend>Riposi del primo turno · ${byes}</legend>
      <p>Scegli chi riposa o lascia che venga sorteggiato.</p>
      <div class="tournament-byes">${entrants.map(user => `<label><input type="checkbox" name="byes" value="${escapeHtml(user.id)}"> ${escapeHtml(user.name)}</label>`).join('')}</div>
    </fieldset>` : ''}`;
}

function drawSummary(swissRounds,selected='') {
  const entrants=state.players.length;
  const rounds=knockout()?Math.ceil(Math.log2(entrants)):swissRounds;
  const rests=entrants%2 ? (selected?`riposa ${player(selected)}`:'un riposo da assegnare o sorteggiare'):'nessun riposo';
  let laterRests=0;
  if(knockout()) {
    for(let remaining=Math.ceil(entrants/2);remaining>1;remaining=Math.ceil(remaining/2)) laterRests+=remaining%2;
  } else if(entrants%2 && swissRounds>1) {
    laterRests=swissRounds-1;
  }
  return `<strong>Riepilogo del sorteggio</strong> · ${entrants} iscritti · ${rounds || '—'} ${rounds===1?'turno':'turni'} · Primo turno, ${rests}.${laterRests?` Nei turni successivi sono previsti ${laterRests===1?'un riposo':laterRests+' riposi'}.`:''}`;
}

function tournamentAction() {
  const tournament = state.tournament;
  if (!tournament || !state.user.admin) return '';
  const fixtures=state.fixtures.filter(fixture=>fixture.round===tournament.round && playable(fixture));
  const progress=`<p>${tournament.resolved} di ${fixtures.length} risultati definiti${tournament.open ? ` · ${tournament.open} in attesa` : ''}</p>`;
  const ties = state.fixtures.filter(fixture => tournament.ties.includes(fixture.id));
  return `<section class="tournament-management" aria-labelledby="tournament-management-heading">
    <h2 id="tournament-management-heading">Gestione turno · ${roundLabel(tournament.round)}</h2>
    ${progress}
    ${tournament.ready?`<form class="tournament-advance"><input type="hidden" name="round" value="${tournament.round}">
    <input type="hidden" name="revision" value="${tournament.revision}">
    ${ties.length ? `<fieldset class="tournament-options"><legend>Spareggi</legend>
      <p>Indica chi passa per ogni incontro in parità. Il punteggio giocato resta nel registro.</p>
      ${ties.map(({id,a,b}) => `<label>${player(a)} – ${player(b)}<select name="winner-${id}" required>
        <option value="">Scegli chi passa</option><option value="${a}">${player(a)}</option><option value="${b}">${player(b)}</option>
      </select></label>`).join('')}</fieldset>` : ''}
    ${tournament.nextRematches?`<p class="fine-print">${tournament.nextRematches===1?'Il prossimo turno contiene una rivincita.':`Il prossimo turno contiene ${tournament.nextRematches} rivincite.`}</p>`:''}
    ${action('leagueAdvance', tournament.final ? 'Pubblica il risultato finale' : 'Pubblica il turno successivo')}
    </form>`:`<a href="#giornate" class="jump" data-round="${tournament.round}">Vai agli incontri del turno</a>`}
    ${retirementForm()}
  </section>`;
}

function retirementForm() {
  const tournament=state.tournament;
  const current=knockout()
    ? state.fixtures.filter(f=>f.round===tournament.round).flatMap(f=>[f.a,f.b]).filter(Boolean)
    : state.players;
  const players=[...new Set(current)].filter(id=>!tournament.withdrawn.includes(id)).sort((a,b)=>player(a).localeCompare(player(b),'it'));
  const withdrawn=tournament.withdrawnThisRound;
  if(!players.length && !withdrawn.length) return '';
  const form=(ids,label,name,button,hint='')=>`<form class="tournament-advance">
      <input type="hidden" name="round" value="${tournament.round}">
      <label>${label}<select name="player" required><option value="">Scegli il giocatore</option>
        ${ids.map(id=>`<option value="${id}">${player(id)}</option>`).join('')}</select></label>
      ${hint?`<p class="fine-print">${hint}</p>`:''}${action(name,button,'secondary')}
    </form>`;
  const hint=knockout()?'L’avversario passa il turno. I punteggi già giocati restano visibili.'
    :'I risultati già giocati restano in classifica. Il giocatore esce dai prossimi abbinamenti.';
  return `<details class="tournament-retirement"><summary>Gestisci ritiri</summary>
    ${players.length?form(players,'Giocatore che si ritira','leagueRetire','Conferma ritiro',hint):''}
    ${withdrawn.length?form(withdrawn,'Giocatore da riammettere','leagueUndoRetire','Revoca ritiro'):''}
    </details>`;
}

const tournamentRefreshControl = () => liveCompetition()
  ? '<button type="button" class="secondary tournament-refresh" data-tournament-refresh>Aggiorna dati</button>' : '';

function renderOverview(total, current) {
  const { league, user, players } = state;
  const actions = $('season-actions');
  const board = $('season-board');
  if (!league) {
    $('season-caption').textContent = 'Le iscrizioni non sono ancora aperte.';
    if (user.admin) {
      $('season-title').textContent = 'Nuovo campionato o torneo';
      const formatOption = key => `<option value="${key}">${formats[key]}</option>`;
      actions.innerHTML = `<form class="inline-form competition-form">
        <label>Nome della competizione<input name="name" required maxlength="100"></label>
        <label>Formato<select name="format">
          <optgroup label="Campionati">${['round_robin','round_robin_legs'].map(formatOption).join('')}</optgroup>
          <optgroup label="Tornei">${['knockout','knockout_legs','swiss'].map(formatOption).join('')}</optgroup>
        </select></label>
        <label class="notify-option" data-roster-toggle><input name="useRoster" type="checkbox" aria-controls="competition-roster-limit"> Richiedi un roster all’iscrizione</label>
        <fieldset id="competition-roster-limits" class="competition-roster-limits">
          <legend>Limiti in punti</legend>
          <label>Singola partita<input name="matchLimit" type="number" min="100" max="5000" value="2000" required>
            <small>Le liste si consegnano dal Builder per verificare i punti.</small></label>
          <label id="competition-roster-limit" hidden>Roster<input name="rosterLimit" type="number" min="100" max="20000" value="3000" required disabled></label>
        </fieldset>
        <label data-tournament-limit hidden>Limite della lista · punti<input name="entryListLimit" type="number" min="100" max="5000" value="2000" required disabled>
          <small>Ogni giocatore consegna una lista valida per l’intero torneo.</small></label>
        ${state.mailEnabled ? '<label class="notify-option"><input type="checkbox" name="notify"> Avvisa i giocatori con email verificata</label>' : ''}
        ${action('leagueOpen', 'Apri le iscrizioni')}
      </form>`;
    } else {
      actions.replaceChildren();
    }
    return;
  }

  $('season-title').textContent = league.name;
  document.title = `${league.name} · Cronache del settore`;
  $('season-caption').textContent = 'Warhammer 40.000 · ' + (formats[league.format] || formats.round_robin) +
    (league.match_point_limit && !state.rosters?.settings ? ` · ${league.match_point_limit} pt a partita` : '');
  board.hidden = false;
  if (league.closed || league.paused) {
    const restore = league.closed ? action('leagueReopen', 'Riapri campionato')
      : action('leagueResume', 'Riprendi campionato') + action('leagueClose', 'Chiudi campionato', 'secondary');
    actions.innerHTML = (user.admin && !league.finished ? `<form class="action-row">${restore}</form>` : '') + tournamentRefreshControl();
    const status = state.tournament ? (league.finished ? 'Torneo concluso' : league.closed ? 'Torneo chiuso' : 'Torneo in pausa') : (league.closed ? 'Campionato concluso' : 'Campionato in pausa');
    board.innerHTML = `<p class="eyebrow">${status}</p>
      ${state.tournament?.champion ? `<p>Vincitore · ${playerLink(state.tournament.champion)}</p>` : ''}
      ${league.finished && knockout() && !state.tournament.champion ? '<p>Nessun vincitore.</p>' : ''}
      <p>${state.fixtures.filter(confirmed).length} risultati confermati</p>`;
    return;
  }
  const lifecycleForm = user.admin ? `<form class="action-row">
    ${action('leaguePause', 'Metti in pausa', 'secondary')}
    ${action('leagueClose', state.tournament?'Chiudi torneo':'Chiudi campionato', 'secondary')}
    ${tournamentRefreshControl()}
  </form>` : tournamentRefreshControl();
  if (!league.start) {
    const swissRules=league.format==='swiss'?'<p class="swiss-rules">La classifica ordina per vittorie, poi pareggi e differenza punti. Chi è pari anche lì condivide la posizione. Il riposo non conta come partita. Gli abbinamenti privilegiano avversari nuovi e possono includere rivincite.</p>':'';
    board.innerHTML = `<p class="eyebrow">Iscrizioni aperte</p>
      <strong class="display-number">${players.length}</strong>
      <p>${players.length === 1 ? 'Giocatore iscritto' : 'Giocatori iscritti'}</p>
      ${league.joined?swissRules:''}`;
    const joinLabel=state.rosters?.settings?'Conferma iscrizione e roster':fixedEntryList()?'Consegna la lista e iscriviti':state.tournament && user.admin?'Iscriviti come giocatore':'Iscriviti al campionato';
    actions.innerHTML = league.joined
      ? `<p>Iscrizione confermata.${armyLabel(user.id) ? ' · ' + escapeHtml(armyLabel(user.id)) : ''}</p>
        ${state.entryList?`<p><a class="jump" href="api.php?action=leagueDownload&entry=${escapeHtml(league.id)}">${escapeHtml(state.entryList.name)} · ${state.entryList.points} pt</a></p>`:''}
        <form>${action('leagueLeave','Ritira iscrizione','secondary')}</form>`
      : `<form class="army-signup${state.rosters?.settings?' roster-form':''}"><label>Il tuo esercito<select name="army" required>
          <option value="">Scegli l’esercito</option>
          ${Object.entries(state.armyGroups).map(([group, armies]) => `<optgroup label="${escapeHtml(group)}">
            ${Object.entries(armies).map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('')}
          </optgroup>`).join('')}
        </select></label>${state.rosters?.settings?rosterFormFields(true):fixedEntryList()?entryListFields():league.match_point_limit
    ? `<p class="fine-print">Per ogni incontro la consegna richiede una lista salvata nel Builder, entro ${league.match_point_limit} pt.</p>` : ''}${swissRules}${action('leagueJoin', joinLabel)}</form>`;
    if (user.admin && players.length < 2) {
      actions.insertAdjacentHTML('beforeend', '<p>Servono almeno due iscritti per pubblicare il calendario.</p>');
    }
    if (user.admin && players.length >= 2) {
      actions.insertAdjacentHTML('beforeend', `<form${state.tournament?' class="tournament-advance"':''}>
        ${initialDrawFields(players)}
        ${action('leagueStart', state.tournament ? 'Chiudi iscrizioni e pubblica il primo turno' : 'Chiudi iscrizioni e pubblica')}
      </form>`);
    }
    actions.insertAdjacentHTML('beforeend', lifecycleForm);
    return;
  }

  const next = state.fixtures.find(fixture => mine(fixture) && !resolved(fixture));
  actions.innerHTML = tournamentAction() + lifecycleForm;
  if(state.entryList)actions.insertAdjacentHTML('beforeend',`<p><a class="jump" href="api.php?action=leagueDownload&entry=${escapeHtml(league.id)}">Scarica la tua lista del torneo · ${state.entryList.points} pt</a></p>`);

  if (next) {
    const matchStatus=next.result?.void?'Risultato annullato · in attesa di riapertura'
      :next.pending?.by===user.id?'Risultato in attesa dell’avversario':next.awaiting?'Verifica il risultato'
      :state.rosters?.settings&&!next.lineups.mine?'Consegna la tua lista'
      :state.rosters?.settings&&!next.lineups.opponent?'Lista avversaria in attesa':'Da giocare';
    board.innerHTML = `
      <div class="board-top"><h2 class="eyebrow">Prossimo incontro</h2><span>${roundLabel(next.round)}${twoLegs() ? (next.leg===2?' · Ritorno':' · Andata') : ''}</span></div>
      <div class="matchup"><strong>${playerLink(user.id)}</strong><span>vs</span><strong>${playerLink(next.a === user.id ? next.b : next.a)}</strong></div>
      <div class="board-bottom">
        <span>${matchStatus}</span>
        <a href="#giornate" class="jump" data-round="${next.round}" data-fixture="${next.id}">Apri l’incontro <span aria-hidden="true">↗</span></a>
      </div>`;
  } else if(state.tournament?.withdrawn.includes(user.id)) {
    board.innerHTML = '<p class="eyebrow">Ritiro registrato</p><p>Puoi consultare i tuoi risultati e seguire il torneo.</p>';
  } else if (state.tournament && state.fixtures.some(f => f.round===total && !playable(f) && !f.decision && f.a===user.id)) {
    board.innerHTML = `<p class="eyebrow">${roundLabel(total)}</p>
      <p>${knockout() ? 'Passi il turno senza giocare.' : 'In questo turno riposi.'}</p>`;
  } else if (state.tournament) {
    const decisions=state.fixtures.filter(f=>f.round===total && f.leg===1 && f.decision);
    const decisionSummary=decisions.length ? `<p>${decisionLabel(decisions[0].decision)}
      ${decisions.length>1?` · altri esiti: ${decisions.length-1}`:''}</p>` : '';
    board.innerHTML = `<p class="eyebrow">${roundLabel(total)}</p>
      ${decisionSummary || `<p>${state.tournament.ready ? (state.tournament.final ? 'Risultato finale da pubblicare.' : 'Turno successivo da pubblicare.') : 'Incontri in corso.'}</p>`}`;
  } else {
    board.innerHTML = `<p class="eyebrow">${current ? 'Giornata corrente' : 'Giornate completate'}</p>
      <strong class="display-number">${current ?? total}</strong>
      <p>${state.fixtures.filter(confirmed).length} risultati confermati</p>`;
  }
}

function renderStandings() {
  if (knockout()) {
    renderBracket();
    return;
  }
  const entrants = state.users.filter(user => state.players.includes(user.id));
  const matches = state.fixtures.filter(confirmed).map(fixture => ({
    a: fixture.a, b: fixture.b, ...fixture.result
  }));
  const swiss = state.league.format==='swiss';
  const standings = swiss ? state.tournament.standings : rankStandings(entrants, matches);
  if (!standings.length) {
    const empty = state.league.closed || state.league.paused ? 'Nessun iscritto.' : 'In attesa delle prime iscrizioni.';
    $('league-standings').innerHTML = `<p class="fine-print">${empty}</p>`;
    return;
  }
  $('league-standings').innerHTML = `<table>
    <thead><tr><th scope="col">#</th><th scope="col">Giocatore</th>
      <th scope="col">${swiss?'<abbr title="Vittorie, pareggi, sconfitte">V–P–S</abbr>':'<abbr title="Partite giocate">PG</abbr>'}</th>
      <th scope="col"><abbr title="Differenza punti vittoria">Diff.</abbr></th>
      ${swiss?'':'<th scope="col">Punti</th>'}</tr></thead>
    <tbody>${standings.map(row => {
      const podium = matches.length && row.rank <= 3 ? ` podium podium-${row.rank}` : '';
      return `<tr class="${row.id === state.user.id ? 'you' : ''}${podium}">
        <td class="placement"><span>${row.rank}</span></td><th scope="row">${playerLink(row.id)}${row.id === state.user.id ? ' <small>Tu</small>' : ''}${swiss&&state.tournament.withdrawn.includes(row.id)?' <small>Ritirato</small>':''}${playerArmy(row.id)}</th>
        <td>${swiss?`${row.wins}–${row.draws}–${row.losses}`:row.played}</td>
        <td>${row.diff > 0 ? '+' : ''}${row.diff}</td>${swiss?'':`<td>${row.points}</td>`}</tr>`;
    }).join('')}</tbody>
    </table>
    <p class="fine-print">${swiss?'Ordine per vittorie, pareggi e differenza punti. Gli esiti a tavolino valgono per il record, senza punti vittoria.':'Vittoria 3 · Pareggio 1 · Sconfitta 0. A parità di punti conta la differenza punti vittoria.'}</p>`;
}

function bracketLinks(feeds, previousCount) {
  const center=(slot,count)=>(slot+0.5)*1000/count;
  return `<div class="bracket-links" aria-hidden="true"><svg viewBox="0 0 40 1000" preserveAspectRatio="none" focusable="false">
    ${feeds.flatMap((sources,to)=>sources.map(from=>{
      const start=center(from,previousCount),end=center(to,feeds.length);
      return `<path d="M0 ${start} H20 V${end} H40" />`;
    })).join('')}
  </svg></div>`;
}

function bracketCard(series, feeds, round, slot, previous) {
  const label=`<small class="bracket-match-label">Incontro ${slot+1}${twoLegs()&&series?.total?' · Totale':''}</small>`;
  if(!series) return `<li class="bracket-card is-pending">
    ${label}${feeds.map(source=>{
      const prior=previous.series[source];
      const qualifier=prior?.winner || (prior?.b===null ? prior.a : null);
      return `<span>${qualifier?playerLink(qualifier):`Vincitore incontro ${source+1}`}</span>`;
    }).join('')}
    <small>Abbinamento provvisorio</small></li>`;
  const entry=(id,index)=>`<span class="bracket-player${series.winner===id?' advances':''}">${playerLink(id)}${series.total?`<strong>${series.total[index]}</strong>`:''}</span>`;
  const legs=series.b===null?'':series.ids.map((id,index)=>`<a href="#giornate" data-round="${round}" data-fixture="${id}">
    ${twoLegs()?(index===0?'Andata':'Ritorno'):'Apri partita'}${twoLegs()&&series.scores[index]?` · ${series.scores[index].join('–')}`:''}</a>`).join('');
  return `<li class="bracket-card">${label}${entry(series.a,0)}
    ${series.b===null?(series.decision?'':'<small>Riposo · passa il turno</small>'):entry(series.b,1)}
    ${series.decision?`<small>${decisionLabel(series.decision)}</small>`:''}
    ${legs?`<span class="bracket-matches">${legs}</span>`:''}</li>`;
}

function renderBracket() {
  const {bracket,champion}=state.tournament;
  const results=$('league-standings');
  const scroll=results.querySelector('.bracket-scroll')?.scrollLeft || 0;
  const count=stage=>stage.series.length || stage.feeds.length;
  const next=state.fixtures.find(fixture=>mine(fixture)&&!resolved(fixture));
  const shortcut=state.league.closed?'':`<a class="jump" href="#giornate" data-round="${next?.round||state.tournament.round}"
    ${next?`data-fixture="${escapeHtml(next.id)}"`:''}>${next?'Vai al tuo incontro':'Vai al turno corrente'}</a>`;
  bracketObserver?.disconnect();
  results.innerHTML = bracket.length ? `${champion ? `<p class="bracket-winner">Vincitore · ${playerLink(champion)}</p>` : ''}
    <div class="bracket-tools">${shortcut}<p class="fine-print" data-bracket-hint hidden>Scorri di lato per vedere gli altri turni ↔</p></div>
    <div class="bracket-scroll" tabindex="0" role="region" aria-label="Tabellone dei turni">
    <div class="tournament-bracket">${bracket.map((stage,index)=>{
      const {round,series,feeds}=stage;
      return `${index?bracketLinks(feeds,count(bracket[index-1])):''}
        <section class="bracket-stage"><h3>${roundLabel(round)}</h3><ol>
          ${Array.from({length:count(stage)},(_,slot)=>bracketCard(series[slot],feeds[slot],round,slot,bracket[index-1])).join('')}
        </ol></section>`;
    }).join('')}</div></div>` : '<p class="fine-print">Il tabellone sarà visibile dopo la chiusura delle iscrizioni.</p>';
  const viewport=results.querySelector('.bracket-scroll');
  const hint=results.querySelector('[data-bracket-hint]');
  if(!viewport)return;
  viewport.scrollLeft=scroll;
  const update=()=>{hint.hidden=viewport.clientWidth===0 || viewport.scrollWidth<=viewport.clientWidth+1;};
  update();
  if(typeof ResizeObserver==='function'){
    bracketObserver=new ResizeObserver(update);
    bracketObserver.observe(viewport);
  }
}

function rosterFormFields(signup=false) {
  const faction=signup?'':armyLabel(state.user.id);
  return `<input type="hidden" name="poolRevision" value="">
    <label>Pool del campionato<select name="builderArmyId" required ${builderListsLoaded?'':'disabled'}>${builderListOptions(true,faction)}</select></label>
    <div class="roster-tools"><a class="jump" data-pool-builder href="${escapeHtml(builderLink(true,faction))}">Crea un pool nel Builder</a>
    <a class="jump" data-edit-pool hidden>Modifica il pool</a></div>
    <p class="fine-print">Pool fino a <strong>${state.rosters.settings.rosterLimit} pt</strong> · Lista da partita fino a <strong>${state.rosters.settings.matchLimit} pt</strong>. Le riserve si impostano nel pool.</p>
    <div data-roster-options role="status" aria-live="polite"></div><div data-roster-compatible></div>`;
}

function entryListFields(){
  return `<div class="entry-list-fields"><label>Lista da partita<select name="builderArmyId" required ${builderListsLoaded?'':'disabled'}>${builderListOptions()}</select></label>
    <p class="fine-print">Massimo ${state.league.entry_list_limit} pt. La copia vale per tutto il torneo. I giocatori con accesso al sito potranno leggerla dagli incontri pubblicati.</p>
    <p data-entry-list-empty role="status" hidden></p>
    <a class="jump" data-entry-builder href="${escapeHtml(builderLink())}">Apri Army Builder</a></div>`;
}

function renderRoster() {
  const panel=$('roster-panel'),data=state.rosters,settings=data?.settings;
  if(!panel)return;
  panel.hidden=!settings;
  if(!settings)return;
  const latest=data.versions[0],editable=state.league.joined&&!state.league.closed&&!state.league.paused&&(!state.league.start||settings.windowOpen);
  const missing=state.user.admin ? state.players.filter(id=>!data.submitted.includes(id)) : [];
  const summary=version=>`<p>${escapeHtml(version.roster.name)} · ${version.roster.points} / ${settings.rosterLimit} punti</p><ul>${version.roster.entries.map(entry=>`<li><strong>${escapeHtml(entry.name)}</strong> · ${entry.models} modelli · ${entry.points} pt${entry.equipmentPoints?`<br>Riserva equipaggiamenti: ${entry.equipmentPoints} pt — ${entry.options.filter(o=>entry.paidOptions[o.id]).map(o=>`${entry.paidOptions[o.id]}× ${escapeHtml(o.name)}`).join(', ')}`:''}</li>`).join('')}</ul>`;
  panel.innerHTML=`<div class="section-head"><h2 id="roster-heading">Roster del campionato</h2></div>
    <p>Roster: <strong>${settings.rosterLimit} punti</strong> · Partite: <strong>${settings.matchLimit} punti</strong></p>
    <p>${state.league.start?(settings.windowOpen?'Finestra di modifica aperta per tutti gli iscritti.':'Roster bloccati. Le modifiche richiedono una finestra aperta dall’amministratore.'):'Puoi preparare e sostituire il roster fino alla pubblicazione del calendario.'}</p>
    <p class="fine-print">I potenziamenti dei distaccamenti si scelgono e si pagano solo nelle liste degli incontri.</p>
    <p class="fine-print">Roster consegnati ${data.submitted.length} / ${state.players.length}.</p>
    ${missing.length?`<p class="roster-waiting"><strong>In attesa del roster</strong> · ${missing.map(player).join(', ')}</p>`:''}
    ${latest?`<div data-active-roster-compatible></div>`:''}
    ${latest?`<details><summary>Il tuo roster · versione ${latest.version}</summary>${summary(latest)}</details>`:state.league.joined?'<p>Devi ancora consegnare il roster.</p>':''}
    ${editable?`<details class="roster-editor"><summary>${latest?'Prepara una nuova versione':'Prepara il tuo roster'}</summary>
      <form class="roster-form"><input type="hidden" name="baseVersion" value="${escapeHtml(latest?.id||'')}">
      ${rosterFormFields()}
      ${action('leagueRosterSave','Consegna il roster')}
      </form></details>`:''}
    ${data.versions.length>1?`<details><summary>Versioni precedenti (${data.versions.length-1})</summary>${data.versions.slice(1).map(version=>`<details><summary>Versione ${version.version} · ${escapeHtml(formatDate(version.created))}</summary>${summary(version)}</details>`).join('')}</details>`:''}
    ${state.user.admin&&state.league.start&&!state.league.closed&&!state.league.paused?`<form class="action-row"><input name="open" type="hidden" value="${settings.windowOpen?'false':'true'}">${action('leagueRosterWindow',settings.windowOpen?'Chiudi finestra roster':'Apri finestra roster','secondary')}</form>`:''}`;
}

function listPanel(fixture) {
  const listAction = id => `<div class="fixture-list-action">${playerLink(id)}<button type="button" class="secondary" data-lineup="${id}" aria-label="Leggi la lista di ${player(id)}">Leggi lista</button></div>`;
  if (!mine(fixture)) return fixture.listsReadable ? `<div class="fixture-block"><h3>Liste esercito</h3><div class="action-row">${[fixture.a,fixture.b].map(listAction).join('')}</div></div>` : '';
  const { mine: submitted, opponent } = fixture.lineups;
  if (submitted && opponent) {
    const other = fixture.a === state.user.id ? fixture.b : fixture.a;
    return `<div class="fixture-block"><h3>Liste esercito</h3><p>${fixedEntryList()?'Liste consegnate all’iscrizione, valide per tutto il torneo.':'Entrambe le liste sono state consegnate.'}</p>
      <div class="action-row"><button type="button" class="secondary" data-lineup="${state.user.id}">Leggi la tua lista</button>
      ${listAction(other)}</div></div>`;
  }
  if(fixedEntryList())return '<div class="fixture-block"><h3>Liste del torneo</h3><p>Le liste sono quelle consegnate all’iscrizione.</p></div>';
  if(state.rosters?.settings&&fixture.result)return '<div class="fixture-block"><h3>Liste esercito</h3><p>L’incontro è già confermato. Le consegne restano definitive.</p></div>';
  if (state.league.closed) return '<div class="fixture-block"><h3>Liste esercito</h3><p>Liste non rivelate.</p></div>';
  if (state.league.paused) return '<div class="fixture-block"><h3>Liste esercito</h3><p>Le consegne riprendono quando il campionato torna attivo.</p></div>';
  return `<div class="fixture-block">
    <h3>Liste esercito</h3>
    <p>${submitted ? 'La tua lista è stata consegnata. In attesa dell’avversario.' : opponent
      ? 'L’avversario ha consegnato. Carica la tua lista per sbloccare entrambe.'
      : 'Le liste saranno visibili a tutti i giocatori dopo entrambe le consegne.'}</p>
    <form class="lineup-form">
      ${state.rosters?.versions?.[0]?`<input type="hidden" name="rosterVersion" value="${escapeHtml(state.rosters.versions[0].id)}">`:''}
      <label>Lista dal tuo List Builder<select name="builderArmyId" ${requiresBuilderLineup()?'required':''} ${state.rosters?.settings||!builderListsLoaded?'disabled':''}>${state.rosters?.settings?'<option value="">Scegli una lista compatibile</option>':builderListOptions()}</select></label>
      ${state.rosters?.settings?`<p data-lineup-compatibility role="status">Verifica delle liste in attesa.</p>
        <details data-lineup-excluded hidden><summary>Liste escluse</summary><ul></ul></details>
        <a class="jump" href="${escapeHtml(builderLink())}">Apri Army Builder</a>`:'<p class="fine-print">La lista consegnata resta una copia indipendente da quella del Builder.</p>'}
      <pre data-builder-preview hidden aria-live="polite"></pre>
      ${state.rosters?.settings?'<p>La lista deve rispettare il roster e il limite partita. Il server controlla copie, taglie e opzioni a pagamento.</p>'
    :state.league.match_point_limit?`<p class="fine-print">Alla consegna il sito verifica il limite di ${state.league.match_point_limit} pt.</p>
      <a class="jump" href="${escapeHtml(builderLink())}">Apri Army Builder</a>`
    :`<label>Incolla la lista esercito<textarea name="text" rows="5" spellcheck="false"></textarea></label>
      <label>Oppure carica un file .txt<input type="file" name="file" accept=".txt,text/plain"></label>`}
      ${action('leagueLineup', submitted ? 'Sostituisci la lista' : 'Consegna la lista', 'secondary')}
    </form>
  </div>`;
}

function resultPanel(fixture) {
  if (fixture.result) {
    return `<div class="fixture-block"><h3>Risultato</h3>
      <p>${fixture.result.void ? 'Partita annullata' : 'Risultato confermato'} · ${formatDate(fixture.result.date)}
      ${fixture.result.mission ? ` · ${escapeHtml(fixture.result.mission)}` : ''}</p></div>`;
  }
  if (fixture.decision) return '';
  if (state.league.closed) return '<div class="fixture-block"><p>Incontro chiuso senza risultato confermato.</p></div>';
  if (fixture.pending) {
    const { by, scoreA, scoreB, date, mission, token } = fixture.pending;
    const own = by === state.user.id;
    return `<div class="fixture-block"><h3>Risultato da confermare</h3>
      <p>${playerLink(fixture.a)} <strong>${scoreA} – ${scoreB}</strong> ${playerLink(fixture.b)} · ${formatDate(date)}
      ${mission ? ` · ${escapeHtml(mission)}` : ''}</p>
        <p>${state.league.paused ? 'La proposta resta in attesa fino alla ripresa.'
          : own ? 'In attesa della conferma dell’avversario.' : 'Verifica il punteggio proposto dall’avversario.'}</p>
        ${state.league.paused ? '' : `<form class="action-row">
        <input type="hidden" name="proposal" value="${token}">
        ${own ? action('leagueWithdraw', 'Ritira il risultato', 'secondary') :
          action('leagueConfirm', 'Conferma il risultato') + action('leagueReject', 'Rifiuta il risultato', 'secondary')}
        </form>`}</div>`;
  }
  if (state.league.paused) return '<div class="fixture-block"><p>Potrai proporre un risultato alla ripresa del campionato.</p></div>';
  if(state.rosters?.settings&&(!fixture.lineups?.mine||!fixture.lineups?.opponent))return '<div class="fixture-block"><h3>Risultato</h3><p>Consegnate entrambe le liste verificate prima di proporre il risultato.</p></div>';
  return `<div class="fixture-block"><h3>Proponi il risultato</h3>
    <form class="result-form">
      <div>${playerLink(fixture.a)}<label>Punti<input type="number" name="scoreA" aria-label="Punti di ${player(fixture.a)}" min="0" max="100" required></label></div>
      <div>${playerLink(fixture.b)}<label>Punti<input type="number" name="scoreB" aria-label="Punti di ${player(fixture.b)}" min="0" max="100" required></label></div>
      <label>Data della partita<input type="date" name="date" max="${state.today}" value="${state.today}" required></label>
      <label>Missione (facoltativa)<input name="mission" maxlength="120"></label>
      <p>L’avversario dovrà confermare il risultato.</p>
      ${action('leaguePropose', 'Invia il risultato')}
    </form></div>`;
}

function decisionLabel(decision) {
  if(!decision.winner) return 'Nessun vincitore · ritiro';
  const reason=decision.kind==='walkover'?'a tavolino':'per ritiro';
  return `Vince ${player(decision.winner)} ${reason}`;
}

function fixtureRecovery(fixture) {
  const {tournament,league,user}=state;
  if(!user.admin || league.closed || league.paused) return '';
  if(!tournament) return fixture.result?.id ? `<form class="fixture-block fixture-recovery">
    <input type="hidden" name="match" value="${escapeHtml(fixture.result.id)}">
    ${action('leagueResetResult','Riapri il risultato','secondary')}</form>` : '';
  if(fixture.round!==tournament.round ||
    fixture.decision?.kind==='withdrawal') return '';
  const revision=`<input type="hidden" name="revision" value="${tournament.revision}">`;
  const firstLeg=fixture.leg===1;
  if(fixture.decision) return firstLeg ? `<form class="fixture-block fixture-recovery">${revision}
    ${action('leagueUndoWalkover','Revoca esito a tavolino','secondary')}</form>` : '';
  const incomplete=state.fixtures.some(leg=>leg.round===fixture.round && leg.slot===fixture.slot && !confirmed(leg));
  const reset=(fixture.result||fixture.awaiting) ? `<form>${revision}
    ${action('leagueResetResult',fixture.result?'Riapri il risultato':'Rimuovi la proposta','secondary')}</form>` : '';
  const award=firstLeg && incomplete ? `<form>${revision}
    <label>Vittoria a tavolino<select name="winner" required><option value="">Scegli il giocatore</option>
    <option value="${fixture.a}">${player(fixture.a)}</option><option value="${fixture.b}">${player(fixture.b)}</option></select></label>
    <p class="fine-print">${twoLegs()?'Vale per andata e ritorno. I punteggi confermati restano nello storico.':'L’esito viene registrato senza inserire un punteggio.'}</p>
    ${action('leagueWalkover','Assegna vittoria','secondary')}</form>` : '';
  return reset||award ? `<div class="fixture-block fixture-recovery"><h3>Gestione incontro</h3>${reset}${award}</div>` : '';
}

function photoPanel(fixture) {
  if(!fixture.result)return '';
  const photo=fixture.result.photo;
  const upload=mine(fixture)&&!fixture.result.void;
  if(!photo&&!upload)return '';
  return `<div class="fixture-block fixture-photo"><h3>Foto della partita</h3>
    ${photo?`<a href="${escapeHtml(photo)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo)}" alt="Foto della partita tra ${player(fixture.a)} e ${player(fixture.b)}" loading="lazy"><span>Apri foto</span></a>`:''}
    ${upload?`<form><label>${photo?'Sostituisci la foto':'Aggiungi una foto'}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
    <p class="fine-print">JPG, PNG o WebP · massimo 5 MB. Visibile anche nelle ultime partite.</p>${action('leaguePhoto',photo?'Sostituisci foto':'Carica foto','secondary')}</form>`:''}</div>`;
}

async function matchPhotoData(file) {
  if(!file?.size)throw new Error('Scegli una foto da caricare.');
  if(file.size>5*1024*1024)throw new Error('La foto non può superare 5 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('La foto deve essere JPG, PNG o WebP.');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Impossibile leggere la foto. Riprova.'));reader.onabort=reader.onerror;reader.readAsDataURL(file);});
}

function fixtureRow(fixture) {
  const score = confirmed(fixture) ? `<strong>${fixture.result.scoreA} – ${fixture.result.scoreB}</strong>
    <time datetime="${fixture.result.date}">${formatDate(fixture.result.date)}</time>` : '';
  const status = fixture.result?.void ? 'Annullata' : state.league.closed ? 'Non disputata' : fixture.awaiting ? 'Da confermare'
    : state.rosters?.settings && fixture.lineupCount<2 ? `Liste ${fixture.lineupCount}/2` : 'Da giocare';
  const leg = state.league.format==='knockout_legs' ? `<small>${fixture.leg===2?'Ritorno':'Andata'}</small>` : '';
  const rematch=state.tournament?.rematches.includes(fixture.id);
  const contents = `<span class="pair"><strong>${playerLink(fixture.a)}${playerArmy(fixture.a)}</strong><span>vs</span><strong>${playerLink(fixture.b)}${playerArmy(fixture.b)}</strong></span>
    <span class="fixture-status${fixture.awaiting ? ' pending' : ''}">${leg}${score || (fixture.decision?'':status)}
    ${fixture.decision?`<small>${decisionLabel(fixture.decision)}</small>`:''}${rematch?'<small>Rivincita</small>':''}</span>`;
  if (!playable(fixture)) {
    return `<div class="fixture row bye"><span>${playerLink(fixture.a)}</span><span>${fixture.decision?'Ritiro':knockout()?'Riposo · passa il turno':'Riposa'}</span></div>`;
  }
  const recovery=state.tournament || (state.user?.admin && fixture.result?.id) ? fixtureRecovery(fixture) : '';
  if (!mine(fixture) && !fixture.listsReadable && !fixture.result?.photo && !recovery) return `<div class="fixture row" data-fixture="${fixture.id}" tabindex="-1">${contents}</div>`;
  return `<details class="fixture" data-fixture="${fixture.id}"${fixture.id === openFixture ? ' open' : ''}>
    <summary class="row">${contents}<span class="expand" aria-hidden="true">+</span></summary>
    ${fixture.decision || (state.tournament && fixture.round!==state.tournament.round) ? (fixture.listsReadable?listPanel(fixture):'') : listPanel(fixture)}
    ${mine(fixture)?resultPanel(fixture):''}${photoPanel(fixture)}${recovery}
  </details>`;
}

function renderRounds(total, current) {
  const rounds = Array.from({ length: total }, () => []);
  for (const fixture of state.fixtures) rounds[fixture.round - 1].push(fixture);
  $('round').innerHTML = rounds.map((fixtures, index) => {
    const number = index + 1;
    const active = number === current;
    return `<section class="round-group${active ? ' current-round' : ''}" id="giornata-${number}">
      <div class="round-head"><h3>${roundLabel(number)}${active ? ' <small>In corso</small>' : ''}</h3>
        <p class="round-meta">${fixtures.filter(f=>playable(f)&&resolved(f)).length}/${fixtures.filter(playable).length} ${state.tournament?'definite':'confermate'}
        ${state.rosters?.settings?` · ${fixtures.filter(f=>playable(f)&&!resolved(f)&&f.lineupCount<2).length} in attesa delle liste`:''}</p></div>
      <div class="match-list">${fixtures.map(fixtureRow).join('')}</div>
    </section>`;
  }).join('');
}

function goToRound(number) {
  selectedRound = number;
  $('round-picker').value = number;
  if (!$('giornate').hidden) $('round').scrollTop = $('giornata-' + number).offsetTop;
}

function showLeagueView(view) {
  leagueView = view;
  const hasCalendar = Boolean(state?.fixtures.length);
  const tabs = narrowLayout.matches && hasCalendar;
  $('league-tabs').hidden = !tabs;
  for (const [id, heading] of Object.entries(panelHeadings)) {
    const tab = $('tab-' + id);
    const panel = $(id);
    const active = id === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = (id === 'giornate' && !hasCalendar) || (tabs && !active);
    panel.setAttribute('aria-labelledby', tabs ? 'tab-' + id : heading);
    if (tabs) panel.setAttribute('role', 'tabpanel');
    else panel.removeAttribute('role');
  }
  if (tabs) $('classifica').tabIndex = 0;
  else $('classifica').removeAttribute('tabindex');
}

function render() {
  if (!state) {
    $('season-caption').textContent = 'Accedi alle Cronache del settore per vedere il campionato.';
    const id = leagueQuery.get('id');
    const fixture = leagueQuery.get('fixture');
    const target = /^[a-f0-9]{24}$/.test(id)
      ? 'campionato.php?id=' + id + (/^[a-f0-9]{24}$/.test(fixture) ? '&fixture=' + fixture : '') : '';
    $('season-actions').innerHTML = `<a class="primary" href="index.php${target ? '?next=' + encodeURIComponent(target) : ''}">Vai all’accesso</a>`;
    return;
  }
  const total = Math.max(0, ...state.fixtures.map(fixture => fixture.round));
  const current = state.league?.closed ? undefined : state.tournament
    ? (state.tournament.ready ? undefined : state.tournament.round)
    : state.fixtures.find(fixture => playable(fixture) && !confirmed(fixture))?.round;
  renderOverview(total, current);
  const refreshEnabled=liveCompetition() && !state.league.finished;
  if(refreshEnabled && tournamentRefreshTimer===null){
    tournamentRefreshTimer=window.setInterval(refreshTournament,8000);
  } else if(!refreshEnabled && tournamentRefreshTimer!==null) {
    window.clearInterval(tournamentRefreshTimer);
    tournamentRefreshTimer=null;
  }
  renderRoster();
  if(builderListsLoaded) prepareRosterViews();
  if (state.league && state.user.admin && state.mailEnabled && state.players.length) {
    $('season-actions').insertAdjacentHTML('beforeend', `<details class="season-mail">
      <summary>Scrivi agli iscritti</summary>
      <form>
        <label>Oggetto<input name="subject" required maxlength="140"></label>
        <label>Messaggio<textarea name="message" rows="4" required maxlength="4000"></textarea></label>
        ${action('leagueAnnounce', 'Invia agli iscritti')}
      </form>
    </details>`);
  }
  $('league-content').hidden = !state.league;
  if (state.league) {
    if(knockout()) $('league-content').classList.add('bracket-layout');
    const standingsTitle = knockout() ? 'Tabellone' : 'Classifica';
    $('standings-heading').textContent = standingsTitle;
    $('tab-classifica').textContent = standingsTitle;
    $('tab-classifica').setAttribute('data-theme-menu',standingsTitle);
    $('tab-giornate').textContent = state.tournament ? 'Turni' : 'Giornate';
    $('tab-giornate').setAttribute('data-theme-menu',$('tab-giornate').textContent);
    $('round-picker-label').textContent = state.tournament ? 'Turno' : 'Giornata';
  }
  showLeagueView(leagueView);
  if (state.league) renderStandings();
  if (!total) return;
  const liveCurrent = state.league.paused ? undefined : current;
  $('round-picker').innerHTML = Array.from({ length: total }, (_, index) =>
    `<option value="${index + 1}">${state.tournament || state.league.format==='round_robin_legs' ? roundLabel(index+1) : index+1}${liveCurrent === index + 1 ? ' · corrente' : ''}</option>`).join('');
  renderRounds(total, liveCurrent);
  goToRound(selectedRound ?? current ?? total);
  if(builderListsLoaded) prepareOpenLineups();
}

const liveCompetition=()=>state?.league && (state.tournament||state.rosters?.settings||state.league.match_point_limit);
function tournamentDraft() {
  return document.querySelector('form[data-league-draft]');
}

function applyTournamentUpdate(next) {
  const panel=$('round');
  const scrollTop=panel.scrollTop;
  const sameRound=next.tournament?.round===state.tournament?.round;
  openFixture=panel.querySelector('details[open]')?.dataset.fixture;
  if(!sameRound) selectedRound=undefined;
  state=next;
  render();
  if(sameRound) panel.scrollTop=scrollTop;
}

async function refreshTournament(manual=false){
  const canApply=()=>manual || (!document.activeElement?.closest('form, [data-tournament-refresh]') && !tournamentDraft());
  if(leagueRefreshing || !liveCompetition() || leagueSubmitting || document.hidden || document.querySelector('dialog[open]') || !canApply()) return;
  leagueRefreshing=true;
  const before=state;
  try {
    const next=await request('league');
    if(!next || state!==before || leagueSubmitting || !canApply()) return;
    if(JSON.stringify(next)!==JSON.stringify(before)) {
      if(manual && tournamentDraft() && !window.confirm('Aggiornare i dati e scartare le modifiche non inviate?')) return;
      applyTournamentUpdate(next);
    }
    if(manual) {
      document.querySelector('[data-tournament-refresh]')?.focus();
      notify('Dati aggiornati.');
    }
  } catch(error) {
    if(manual) notify(error.message,true);
  } finally {
    leagueRefreshing=false;
  }
}

const markLeagueDraft=event=>{
  const {form}=event.target;
  if(!liveCompetition() || !form || !event.target.matches('input,textarea,select')) return;
  const changed=[...form.elements].some(field=>{
    if(field.type==='checkbox' || field.type==='radio') return field.checked!==field.defaultChecked;
    if(field.type==='file') return Boolean(field.files?.length);
    if(field.tagName==='SELECT') {
      const initial=[...field.options].find(option=>option.defaultSelected) || field.options[0];
      return field.value!==(initial?.value??'');
    }
    return field.matches('input:not([type=hidden]), textarea') && field.value!==field.defaultValue;
  });
  form.toggleAttribute('data-league-draft',changed);
};
document.addEventListener('input',markLeagueDraft);
document.addEventListener('change',markLeagueDraft);
document.addEventListener('visibilitychange',()=>refreshTournament());

const notices = {
  leagueRosterSave: 'Nuova versione del roster consegnata.',
  leagueRosterWindow: 'Finestra dei roster aggiornata.',
  leaguePhoto: 'Foto della partita salvata.',
  leagueOpen: 'Iscrizioni aperte.',
  leagueAnnounce: 'Messaggio inviato agli iscritti con email verificata.',
  leagueJoin: 'Iscrizione confermata.',
  leagueLeave: 'Iscrizione ritirata.',
  leagueRetire: 'Ritiro registrato.',
  leagueUndoRetire: 'Ritiro revocato.',
  leagueStart: 'Calendario pubblicato.',
  leagueAdvance: 'Turno aggiornato.',
  leagueResetResult: 'Incontro riaperto. I giocatori possono inviare un nuovo risultato.',
  leagueWalkover: 'Vittoria a tavolino registrata.',
  leagueUndoWalkover: 'Esito a tavolino revocato. L’incontro torna disponibile.',
  leagueClose: 'Campionato chiuso.',
  leagueReopen: 'Campionato riaperto.',
  leaguePause: 'Campionato in pausa.',
  leagueResume: 'Campionato ripreso.',
  leagueLineup: 'Lista consegnata.',
  leaguePropose: 'Risultato inviato all’avversario.',
  leagueConfirm: 'Risultato confermato.',
  leagueReject: 'Risultato rifiutato. Ora puoi proporne uno nuovo.',
  leagueWithdraw: 'Proposta ritirata.'
};

$('season-actions').addEventListener('change', event => {
  const control = event.target;
  if (control.name === 'useRoster' || control.name === 'format') {
    const form=control.form;
    const tournament=['knockout','knockout_legs','swiss'].includes(form.elements.format.value);
    const limits=form.querySelector('#competition-roster-limits');
    limits.hidden=limits.disabled=tournament;
    const roster=form.querySelector('#competition-roster-limit');
    roster.hidden=form.elements.rosterLimit.disabled=tournament||!form.elements.useRoster.checked;
    form.querySelector('[data-roster-toggle]').hidden=tournament;
    form.querySelector('[data-tournament-limit]').hidden=tournament===false;
    form.elements.entryListLimit.disabled=!tournament;
  }
  if (control.name === 'byes') {
    const options = [...control.form.querySelectorAll('[name=byes]')];
    const max = Number(control.closest('fieldset').dataset.maxByes);
    const full = options.filter(option => option.checked).length >= max;
    for (const option of options) option.disabled = full && !option.checked;
  }
  if(control.name==='byes' || control.name==='rounds') updateDrawPreview(control.form);
});
$('season-actions').addEventListener('input',event=>{
  if(event.target.name==='rounds') updateDrawPreview(event.target.form);
});
function updateDrawPreview(form){
  const preview=form.querySelector('[data-draw-preview]');
  if(preview)preview.innerHTML=drawSummary(Number(form.elements.rounds?.value),form.querySelector('[name=byes]:checked')?.value);
}

function notify(message, error = false) {
  const notice = $('league-notice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.hidden = false;
}

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const button = event.submitter || form.querySelector('button[type=submit]');
  if (!button || leagueSubmitting) return;
  const name = button.value;
  const confirmation={
    leagueLeave:'Ritirare la tua iscrizione?',
    leagueRetire:'Registrare il ritiro del giocatore? Non entrerà nei prossimi abbinamenti.',
    leagueResetResult:'Riaprire l’incontro? Il risultato precedente resterà annullato nello storico.',
    leagueWalkover:'Assegnare la vittoria a tavolino al giocatore selezionato?'
  }[name];
  if(confirmation && !window.confirm(confirmation)) return;
  if (name === 'leagueClose' &&
      !window.confirm('Chiudere il campionato? Classifica e calendario resteranno consultabili. Per completare gli incontri aperti dovrai riaprirlo.')) return;
  leagueSubmitting = true;
  const buttons = [...document.querySelectorAll('form button[type=submit]:enabled')];
  buttons.forEach(control => control.disabled = true);
  form.setAttribute('aria-busy', 'true');
  const fields = new FormData(form);
  const data = Object.fromEntries(fields);
  if (state.league) data.league = state.league.id;
  if (name === 'leagueOpen') {
    openingToken ??= window.crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    data.request = openingToken;
    data.notify = Boolean(data.notify);
    if (data.rosterLimit !== undefined) data.rosterLimit = Number(data.rosterLimit);
    if (data.matchLimit !== undefined) data.matchLimit = Number(data.matchLimit);
    if (data.entryListLimit !== undefined) data.entryListLimit = Number(data.entryListLimit);
    delete data.useRoster;
  }
  if (name === 'leagueAnnounce') {
    announcementToken ??= window.crypto.randomUUID();
    data.request = announcementToken;
  }
  if (name === 'leagueStart' && state.tournament) {
    data.byes = fields.getAll('byes');
    if (data.rounds !== undefined) data.rounds = Number(data.rounds);
  }
  if (name === 'leagueAdvance') {
    data.round = Number(data.round);
    data.winners = Object.fromEntries([...fields].filter(([key]) => key.startsWith('winner-')).map(([key,value]) => [key.slice(7),value]));
  }
  if (name === 'leagueRetire' || name === 'leagueUndoRetire') data.round=Number(data.round);
  const fixture = form.closest('[data-fixture]');
  if (fixture) data.fixture = fixture.dataset.fixture;
  try {
    if(name==='leagueRosterWindow')data.open=data.open==='true';
    if (name === 'leagueLineup') {
      const { file } = data;
      const pasted = (data.text||'').trim() !== '';
      if (data.builderArmyId) {if(pasted||file?.name)throw new Error('Scegli una sola fonte per la lista.');data.text='';}
      else if (file?.name && pasted) throw new Error('Scegli se incollare la lista o caricare un file.');
      else if (!file?.name && !pasted) throw new Error('Scegli una lista dal builder, incolla il testo o carica un file .txt.');
      if (file?.name) {
        if (file.size > 1048576) throw new Error('Il file deve pesare al massimo 1 MB.');
        data.filename = file.name;
        try {
          data.text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        } catch {
          throw new Error('Salva la lista come file di testo UTF-8.');
        }
      }
      delete data.file;
    }
    if (name === 'leaguePropose') {
      data.scoreA = Number(data.scoreA);
      data.scoreB = Number(data.scoreB);
    }
    if (name === 'leaguePhoto') data.photo=await matchPhotoData(data.photo);
    const result = await request(name, data);
    if (name === 'leagueAnnounce') announcementToken = null;
    if (name === 'leagueOpen') {
      openingToken = null;
      leagueQuery.delete('new');
      leagueQuery.set('id', result.id);
      window.history.replaceState(null, '', 'campionato.php?' + leagueQuery);
    }
    state = await request('league');
    if (name === 'leagueAdvance') selectedRound = null;
    openFixture = fixture?.dataset.fixture;
    render();
    if (openFixture) $('round').querySelector(`[data-fixture="${openFixture}"] summary`)?.focus();
    notify(result.mailFailed
      ? (name === 'leagueAnnounce' ? 'Invio non riuscito per una o più email.' : `${notices[name]} Invio email non riuscito per uno o più destinatari.`)
      : notices[name], Boolean(result.mailFailed));
  } catch (error) {
    if(error.status===409 && (liveCompetition() || name==='leagueResetResult') && ['leagueStart','leagueAdvance','leagueRetire','leagueUndoRetire','leagueResetResult',
      'leagueWalkover','leagueUndoWalkover','leagueConfirm','leagueReject','leagueWithdraw','leaguePropose','leagueLineup','leagueRosterSave','leagueJoin'].includes(name)) {
      try {
        const next=await request('league');
        if(next) {
          applyTournamentUpdate(next);
          if(data.poolRevision && ['leagueRosterSave','leagueJoin'].includes(name)) {
            const replacement=document.querySelector(name==='leagueJoin'?'.army-signup.roster-form':'.roster-editor .roster-form');
            if(replacement) {
              if(replacement.elements.army)replacement.elements.army.value=data.army;
              refreshSignupLists(replacement);
              replacement.elements.builderArmyId.value=data.builderArmyId;
              const editor=replacement.closest('.roster-editor');
              if(editor)editor.open=true;
              void showPool(replacement.elements.builderArmyId);
            }
          }
          if(name==='leagueStart' && data.rounds!==undefined) {
            const rounds=document.querySelector('.tournament-advance [name=rounds]');
            if(rounds && data.rounds>=Number(rounds.min) && data.rounds<=Number(rounds.max)) {
              rounds.value=data.rounds;
              markLeagueDraft({target:rounds});
            }
          }
        }
      } catch { /* Keep showing the original error. */ }
    }
    notify(error.message, true);
    $('league-notice').scrollIntoView({ block: 'nearest' });
  } finally {
    leagueSubmitting = false;
    buttons.forEach(control => control.disabled = false);
    form.removeAttribute('aria-busy');
  }
});

$('round-picker').addEventListener('change', event => {
  goToRound(Number(event.target.value));
});

$('round').addEventListener('scroll', event => {
  if ($('giornate').hidden) return;
  const panel = event.currentTarget;
  for (const [index, group] of Array.from(panel.children).entries()) {
    if (group.offsetTop > panel.scrollTop + 1) break;
    selectedRound = index + 1;
  }
  $('round-picker').value = selectedRound;
});

function selectLeagueTab(view) {
  showLeagueView(view);
  if (selectedRound !== undefined) goToRound(selectedRound);
}

$('league-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) selectLeagueTab(tab.getAttribute('aria-controls'));
});

$('league-tabs').addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const view = event.key === 'Home' ? 'classifica' : event.key === 'End' ? 'giornate'
    : leagueView === 'classifica' ? 'giornate' : 'classifica';
  selectLeagueTab(view);
  $('tab-' + view).focus();
});

narrowLayout.addEventListener('change', () => selectLeagueTab(leagueView));

function openLeagueFixture(id, round) {
  const fixture = $('round').querySelector(`[data-fixture="${id}"]`);
  if (!fixture) return;
  const summary=fixture.querySelector('summary');
  if(summary)fixture.open = true;
  if (narrowLayout.matches) showLeagueView('giornate');
  goToRound(round);
  (summary||fixture).focus();
}

function openRoundLink(event) {
  const link = event.target.closest('[data-round]');
  if (!link) return;
  event.preventDefault();
  if(link.dataset.fixture) openLeagueFixture(link.dataset.fixture, Number(link.dataset.round));
  else {
    selectLeagueTab('giornate');
    goToRound(Number(link.dataset.round));
    $('round-picker').focus();
  }
}
$('season-actions').addEventListener('click',event=>{
  if(event.target.closest('[data-tournament-refresh]')) refreshTournament(true);
  else openRoundLink(event);
});
$('season-board').addEventListener('click',openRoundLink);
$('league-standings').addEventListener('click',openRoundLink);

$('round').addEventListener('click', async event => {
  const button = event.target.closest('[data-lineup]');
  if (!button) return;
  const fixture = button.closest('[data-fixture]').dataset.fixture;
  const url = `api.php?action=leagueDownload&fixture=${fixture}&player=${button.dataset.lineup}`;
  const reader = $('lineup-reader');
  const status = $('lineup-status');
  const text = $('lineup-text');
  const download = $('lineup-download');
  lineupRequest?.abort();
  const controller = new AbortController();
  lineupRequest = controller;
  $('lineup-title').innerHTML = button.dataset.lineup === state.user.id
    ? 'La tua lista' : playerLink(button.dataset.lineup);
  status.textContent = 'Caricamento della lista…';
  text.hidden = download.hidden = true;
  text.textContent = '';
  reader.showModal();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error();
    const content = await response.text();
    if (controller.signal.aborted) return;
    text.textContent = content;
    status.textContent = '';
    text.hidden = download.hidden = false;
    download.href = url;
  } catch {
    if (!controller.signal.aborted) status.textContent = 'Lista non disponibile. Riapri l’incontro per riprovare.';
  }
});

$('lineup-close').addEventListener('click', () => $('lineup-reader').close());
$('lineup-reader').addEventListener('click', event => { if(event.target===event.currentTarget) { const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom) event.currentTarget.close(); } });
$('lineup-reader').addEventListener('close', event => {
  if (!event.currentTarget.open) lineupRequest?.abort();
});

function scanRoster(source,onUpdate){
  const key=state.league.id+(source.version?':version:'+source.version:':pool:'+source.pool+':'+source.revision);
  let scan=rosterScans.get(key);
  if(scan){
    scan.listeners.add(onUpdate);
    onUpdate(scan);
    return;
  }
  const lists=listsFor(false).filter(army=>army.factionId===source.factionId);
  const candidates=lists.filter(army=>army.catalogId===source.catalogId);
  scan={total:candidates.length,checked:0,results:new Map(),excluded:new Map(),listeners:new Set([onUpdate]),error:null};
  for(const army of lists) if(army.catalogId!==source.catalogId)scan.excluded.set(army,'Catalogo diverso dal roster.');
  rosterScans.set(key,scan);
  const update=()=>scan.listeners.forEach(listener=>{if(listener(scan)===false)scan.listeners.delete(listener);});
  update();
  const path='leagueRosterCompatibility&league='+encodeURIComponent(state.league.id)+'&'+
    (source.version?'version='+encodeURIComponent(source.version):'pool='+encodeURIComponent(source.pool)+'&revision='+encodeURIComponent(source.revision));
  void (async()=>{
    try {
      for(let index=0;index<candidates.length;){
        const batch=candidates.slice(index,index+(index===0?6:12));
        const {lists}=await request(path+'&lists='+encodeURIComponent(batch.map(army=>army.id).join(',')));
        const byId=new Map(lists.map(result=>[result.id,result]));
        for(const army of batch){
          const result=byId.get(army.id);
          if(result?.points!==undefined)scan.results.set(army,result.points);
          else scan.excluded.set(army,result?.reason||'Lista non più disponibile.');
        }
        scan.checked=index+=batch.length;
        update();
      }
    } catch(error) {
      scan.error=error.message;
      update();
    }
  })();
}

function compatibilityText(scan){
  if(scan.error)return scan.error;
  if(scan.checked<scan.total)return scan.results.size+' compatibili · verificate '+scan.checked+' di '+scan.total;
  return scan.results.size ? scan.results.size+' liste compatibili' : 'Nessuna lista compatibile nel tuo archivio.';
}

function showRosterCompatibility(container,source){
  if(!container)return;
  scanRoster(source,scan=>{
    if(!container.isConnected)return false;
    const open=Boolean(container.querySelector('details')?.open);
    const names=[...scan.results].map(([army,points])=>`<li>${escapeHtml(army.name)} · ${points} pt</li>`).join('');
    container.innerHTML=`<details class="roster-compatibility" ${open?'open':''}><summary>${escapeHtml(compatibilityText(scan))}</summary>
      ${names?`<ul>${names}</ul>`:'<p>Le liste compatibili compariranno qui.</p>'}</details>`;
  });
}

function prepareLineup(form){
  if(!form || !state.rosters?.settings || form.dataset.rosterScan)return;
  form.dataset.rosterScan='true';
  const status=form.querySelector('[data-lineup-compatibility]');
  const select=form.elements.builderArmyId;
  const latest=state.rosters.versions[0];
  if(!latest){status.textContent='Consegna prima il roster del campionato.';return;}
  const excluded=form.querySelector('[data-lineup-excluded]');
  scanRoster({...latest.roster,version:latest.id},scan=>{
    if(!form.isConnected)return false;
    const visible=new Set([...select.options].map(option=>option.value));
    for(const [army,points] of scan.results) if(!visible.has(army.id)) {
      select.insertAdjacentHTML('beforeend',builderOption(army,points));
    }
    select.disabled=!scan.results.size;
    status.textContent=compatibilityText(scan);
    excluded.hidden=!scan.excluded.size;
    excluded.querySelector('ul').innerHTML=[...scan.excluded].map(([army,reason])=>
      `<li><strong>${escapeHtml(army.name)}</strong> · ${escapeHtml(reason)}</li>`).join('');
  });
}

function prepareOpenLineups(){
  if(!state?.rosters?.settings)return;
  $('round').querySelectorAll('details[open] .lineup-form').forEach(prepareLineup);
}

function refreshSignupLists(form){
  const select=form.elements.builderArmyId;
  if(!select)return;
  const faction=armyName(form.elements.army?.value)||armyLabel(state.user.id);
  const pool=form.classList.contains('roster-form');
  const selected=select.value;
  select.innerHTML=builderListOptions(pool,faction);
  select.disabled=!builderListsLoaded;
  if(selected)select.value=selected;
  const link=form.querySelector('[data-pool-builder]');
  if(link)link.href=builderLink(true,faction);
  const empty=form.querySelector('[data-entry-list-empty]');
  if(empty){
    const missing=builderListsLoaded && faction && select.options.length===1;
    empty.hidden=!missing;
    empty.textContent=missing?`Nessuna lista disponibile per ${faction}.`:'';
    const create=form.querySelector('[data-entry-builder]');
    create.href=builderLink(false,faction,'',Boolean(missing));
    create.textContent=missing?`Crea una lista ${faction} nel Builder`:'Apri Army Builder';
  }
}

function prepareRosterViews(){
  const latest=state.rosters?.versions[0];
  if(latest)showRosterCompatibility(document.querySelector('[data-active-roster-compatible]'),{...latest.roster,version:latest.id});
  document.querySelectorAll('.army-signup, .roster-editor .roster-form').forEach(refreshSignupLists);
  const returned=leagueQuery.get('pool');
  if(!returned || !state.rosters?.settings)return;
  const pool=builderArmies.find(army=>army.id===returned && army.purpose==='pool');
  if(!pool)return;
  const form=document.querySelector('.army-signup.roster-form, .roster-editor .roster-form');
  if(!form)return;
  leagueQuery.delete('pool');
  const army=form.elements.army;
  if(army && !army.value) {
    const choices=Object.assign({},...Object.values(state.armyGroups));
    army.value=Object.keys(choices).find(id=>leagueFactionKey(choices[id])===leagueFactionKey(pool.factionName))||'';
  }
  refreshSignupLists(form);
  form.elements.builderArmyId.value=pool.id;
  if(form.elements.builderArmyId.value)void showPool(form.elements.builderArmyId);
  const editor=form.closest('.roster-editor');
  if(editor)editor.open=true;
}

async function showPool(select){
  const form=select.form,summary=form.querySelector('[data-roster-options]'),results=form.querySelector('[data-roster-compatible]');
  const pool=builderArmies.find(army=>army.id===select.value);
  const edit=form.querySelector('[data-edit-pool]');
  const submit=form.querySelector('button[type=submit]');
  const revision=form.elements.poolRevision;
  revision.value='';
  results.replaceChildren();
  edit.hidden=!pool;
  submit.disabled=Boolean(pool);
  if(!pool){
    summary.textContent=builderListsLoaded&&select.options.length===1?'Nessun pool disponibile per questo esercito.':'';
    return;
  }
  edit.href=builderLink(true,pool.factionName,pool.id);
  summary.textContent='Controllo del pool…';
  try {
    const preview=await request('leagueRosterPreview&id='+encodeURIComponent(pool.id));
    if(!form.isConnected || select.value!==pool.id)return;
    const points=preview.entries.reduce((sum,entry)=>sum+entry.points,0);
    const limit=state.rosters.settings.rosterLimit;
    const valid=preview.entries.length>0&&points<=limit;
    revision.value=preview.revision;
    summary.textContent=preview.entries.length+' copie · '+points+' / '+limit+' pt'+
      (valid?'':preview.entries.length?' · Limite superato':' · Aggiungi almeno un’unità');
    submit.disabled=!valid;
    if(valid)showRosterCompatibility(results,{pool:pool.id,revision:preview.revision,factionId:pool.factionId,catalogId:pool.catalogId});
  }catch(error){
    if(select.value===pool.id)summary.textContent=error.message;
  }
}

$('round').addEventListener('toggle',event=>{
  if(!builderListsLoaded || !event.target.open || !event.target.matches('details[data-fixture]'))return;
  prepareLineup(event.target.querySelector('.lineup-form'));
},true);

document.addEventListener('change',event=>{
  const control=event.target;
  if(control.matches('.army-signup [name=army]')){
    refreshSignupLists(control.form);
    if(control.form.matches('.roster-form')) {
      const pool=control.form.elements.builderArmyId;
      if(control.value && pool.options.length===2)pool.selectedIndex=1;
      void showPool(pool);
    }
  }
  if(control.matches('.roster-form [name=builderArmyId]'))void showPool(control);
});
document.addEventListener('change',async event=>{
  const select=event.target;if(!select.matches('.lineup-form [name=builderArmyId]'))return;
  const form=select.closest('form'),preview=form.querySelector('[data-builder-preview]'),id=select.value;
  for(const field of form.querySelectorAll('[name=text],[name=file]'))field.disabled=Boolean(id);preview.hidden=!id;
  if(!id){preview.textContent='';return;}preview.textContent='Caricamento della lista salvata…';
  try{const data=await request('builderArmyText&id='+encodeURIComponent(id));if(select.value===id)preview.textContent=data.text;}
  catch(error){if(select.value===id)preview.textContent=error.message;}
});
request('builderArmies&summary=1').then(data=>{
  builderArmies=data?.armies||[];builderListsLoaded=true;
  if(!state)return;
  for(const select of document.querySelectorAll('.lineup-form [name=builderArmyId]'))if(!state.rosters?.settings){
    select.innerHTML=builderListOptions();
    select.disabled=false;
  }
  prepareRosterViews();
  prepareOpenLineups();
}).catch(()=>{builderListsLoaded=true;});
request('league').then(data => {
  state = data;
  render();
  const fixture = state?.fixtures.find(item => item.id === leagueQuery.get('fixture') && mine(item));
  if (fixture) openLeagueFixture(fixture.id, fixture.round);
}).catch(() => {
  $('season-actions').textContent = 'Campionato non disponibile. Ricarica la pagina per riprovare.';
});
