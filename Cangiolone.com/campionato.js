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
function builderListOptions(pool=false){return `<option value="">${pool?'Scegli un pool del campionato':'Scegli una lista salvata'}</option>`+builderArmies.filter(a=>(a.purpose==='pool')===pool).map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} · ${escapeHtml(a.factionName||a.edition+'ª ed.')}</option>`).join('');}

async function request(name, data) {
  const id = leagueQuery.get('id');
  const query = name !== 'league' ? '' : id ? '&id=' + encodeURIComponent(id)
    : leagueQuery.get('new') === '1' ? '&new=1' : '';
  const response = await fetch(`api.php?action=${name}${query}`, data ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
    body: JSON.stringify(data)
  } : undefined);
  const payload = await response.json();
  if (response.status === 401 && !data) return null;
  if (!response.ok) throw new Error(payload.error || 'Operazione non riuscita.');
  return payload;
}

const player = id => escapeHtml(state.users.find(user => user.id === id)?.name || 'Giocatore');
const playerLink = id => {
  const hash = id === state.user.id ? '#profilo' : '#profilo?giocatore=' + encodeURIComponent(id);
  return `<a class="player-link" href="./${escapeHtml(hash)}">${player(id)}</a>`;
};
const armyLabel = id => Object.values(state.armyGroups).find(group => group[state.armies[id]])?.[state.armies[id]] || '';
const playerArmy = id => armyLabel(id) ? `<small class="player-army">${escapeHtml(armyLabel(id))}</small>` : '';
const confirmed = fixture => fixture.result && !fixture.result.void;
const playable = fixture => fixture.b !== null;
const mine = fixture => fixture.lineups !== null;
const formats = { round_robin: 'Girone unico di sola andata', knockout: 'Eliminazione diretta', knockout_legs: 'Eliminazione diretta · andata e ritorno', swiss: 'Torneo svizzero' };
const knockout = () => ['knockout','knockout_legs'].includes(state.league?.format);
const twoLegs = () => state.league?.format === 'knockout_legs';

function roundLabel(round) {
  if (knockout()) {
    const previous = state.tournament.bracket[round-2];
    const players = previous ? previous.series.length || previous.feeds.length : state.players.length;
    if (players===2) return 'Finale';
    if (players===4) return 'Semifinali';
    if (players===8) return 'Quarti';
    if (players===16) return 'Ottavi';
    return `Turno a ${players}`;
  }
  return `${state.tournament ? 'Turno' : 'Giornata'} ${round}`;
}

function initialDrawFields(players) {
  if (!state.tournament) return '';
  const byes = players.length % 2;
  const maxRounds = players.length - 1 + players.length % 2;
  const entrants = state.users.filter(user => players.includes(user.id)).sort((a,b) => a.name.localeCompare(b.name,'it'));
  return `${knockout() ? '' : `<label>Numero di turni<input type="number" name="rounds" min="1" max="${maxRounds}" value="${Math.min(3,maxRounds)}" required></label>`}
    ${byes ? `<fieldset class="tournament-options" data-max-byes="${byes}"><legend>Riposi del primo turno · ${byes}</legend>
      <p>Scegli chi riposa o lascia che venga sorteggiato.</p>
      <div class="tournament-byes">${entrants.map(user => `<label><input type="checkbox" name="byes" value="${escapeHtml(user.id)}"> ${escapeHtml(user.name)}</label>`).join('')}</div>
    </fieldset>` : ''}`;
}

function tournamentAction() {
  const tournament = state.tournament;
  if (!tournament || !state.user.admin) return '';
  const fixtures=state.fixtures.filter(fixture=>fixture.round===tournament.round && playable(fixture));
  const progress=`<p>${fixtures.filter(confirmed).length} di ${fixtures.length} risultati confermati</p>`;
  const ties = state.fixtures.filter(fixture => tournament.ties.includes(fixture.id));
  return `<section class="tournament-management" aria-labelledby="tournament-management-heading">
    <h2 id="tournament-management-heading">Gestione turno · ${roundLabel(tournament.round)}</h2>
    ${progress}
    ${tournament.ready?`<form class="tournament-advance"><input type="hidden" name="round" value="${tournament.round}">
    ${ties.length ? `<fieldset class="tournament-options"><legend>Spareggi</legend>
      <p>Indica chi passa per ogni incontro in parità. Il punteggio giocato resta nel registro.</p>
      ${ties.map(({id,a,b}) => `<label>${player(a)} – ${player(b)}<select name="winner-${id}" required>
        <option value="">Scegli chi passa</option><option value="${a}">${player(a)}</option><option value="${b}">${player(b)}</option>
      </select></label>`).join('')}</fieldset>` : ''}
    ${action('leagueAdvance', tournament.final ? 'Pubblica il risultato finale' : 'Pubblica il turno successivo')}
    </form>`:''}
  </section>`;
}

function renderOverview(total, current) {
  const { league, user, players } = state;
  const actions = $('season-actions');
  const board = $('season-board');
  if (!league) {
    $('season-caption').textContent = 'Le iscrizioni non sono ancora aperte.';
    if (user.admin) {
      $('season-title').textContent = 'Nuovo campionato o torneo';
      actions.innerHTML = `<form class="inline-form">
        <label>Nome della competizione<input name="name" required maxlength="100"></label>
        <label>Formato<select name="format">${Object.entries(formats).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
        <label class="notify-option" data-tournament-roster hidden><input name="useRoster" type="checkbox"> Richiedi un roster all’iscrizione</label>
        <label>Limite roster · punti<input name="rosterLimit" type="number" min="100" max="20000" value="3000" required></label>
        <label>Limite partita · punti<input name="matchLimit" type="number" min="100" max="5000" value="2000" required></label>
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
  $('season-caption').textContent = 'Warhammer 40.000 · ' + (formats[league.format] || formats.round_robin);
  board.hidden = false;
  if (league.closed || league.paused) {
    const restore = league.closed ? action('leagueReopen', 'Riapri campionato')
      : action('leagueResume', 'Riprendi campionato') + action('leagueClose', 'Chiudi campionato', 'secondary');
    actions.innerHTML = user.admin && !league.finished ? `<form class="action-row">${restore}</form>` : '';
    const status = state.tournament ? (league.closed ? 'Torneo concluso' : 'Torneo in pausa') : (league.closed ? 'Campionato concluso' : 'Campionato in pausa');
    board.innerHTML = `<p class="eyebrow">${status}</p>
      ${state.tournament?.champion ? `<p>Vincitore · ${playerLink(state.tournament.champion)}</p>` : ''}
      <p>${state.fixtures.filter(confirmed).length} risultati confermati</p>`;
    return;
  }
  const lifecycleForm = user.admin ? `<form class="action-row">
    ${action('leaguePause', 'Metti in pausa', 'secondary')}
    ${action('leagueClose', 'Chiudi campionato', 'secondary')}
  </form>` : '';
  if (!league.start) {
    board.innerHTML = `<p class="eyebrow">Iscrizioni aperte</p>
      <strong class="display-number">${players.length}</strong>
      <p>${players.length === 1 ? 'Giocatore iscritto' : 'Giocatori iscritti'}</p>`;
    const joinLabel=state.rosters?.settings?'Conferma iscrizione e roster':state.tournament && user.admin?'Iscriviti come giocatore':'Iscriviti al campionato';
    actions.innerHTML = league.joined
      ? `<p>Iscrizione confermata.${armyLabel(user.id) ? ' · ' + escapeHtml(armyLabel(user.id)) : ''}</p>`
      : `<form class="army-signup${state.rosters?.settings?' roster-form':''}"><label>Il tuo esercito<select name="army" required>
          <option value="">Scegli l’esercito</option>
          ${Object.entries(state.armyGroups).map(([group, armies]) => `<optgroup label="${escapeHtml(group)}">
            ${Object.entries(armies).map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('')}
          </optgroup>`).join('')}
        </select></label>${state.rosters?.settings?rosterFormFields(true):''}${action('leagueJoin', joinLabel)}</form>`;
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

  const next = state.fixtures.find(fixture => mine(fixture) && !fixture.result);
  actions.innerHTML = tournamentAction() + lifecycleForm;

  if (next) {
    const matchStatus=next.pending?.by===user.id?'In attesa dell’avversario':next.awaiting?'Risultato da confermare':'Da giocare';
    board.innerHTML = `
      <div class="board-top"><h2 class="eyebrow">Prossimo incontro</h2><span>${roundLabel(next.round)}${twoLegs() ? (next.leg===2?' · Ritorno':' · Andata') : ''}</span></div>
      <div class="matchup"><strong>${playerLink(user.id)}</strong><span>vs</span><strong>${playerLink(next.a === user.id ? next.b : next.a)}</strong></div>
      <div class="board-bottom">
        <span>${matchStatus}</span>
        <a href="#giornate" class="jump" data-round="${next.round}" data-fixture="${next.id}">Apri l’incontro <span aria-hidden="true">↗</span></a>
      </div>`;
  } else if (state.tournament && state.fixtures.some(f => f.round===total && !playable(f) && f.a===user.id)) {
    board.innerHTML = `<p class="eyebrow">${roundLabel(total)}</p>
      <p>${knockout() ? 'Passi il turno senza giocare.' : 'In questo turno riposi.'}</p>`;
  } else if (state.tournament) {
    board.innerHTML = `<p class="eyebrow">${roundLabel(total)}</p>
      <p>${state.tournament.ready ? (state.tournament.final ? 'Risultato finale da pubblicare.' : 'Turno successivo da pubblicare.') : 'Incontri in corso.'}</p>`;
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
        <td class="placement"><span>${row.rank}</span></td><th scope="row">${playerLink(row.id)}${row.id === state.user.id ? ' <small>Tu</small>' : ''}${playerArmy(row.id)}</th>
        <td>${swiss?`${row.wins}–${row.draws}–${row.losses}`:row.played}</td>
        <td>${row.diff > 0 ? '+' : ''}${row.diff}</td>${swiss?'':`<td>${row.points}</td>`}</tr>`;
    }).join('')}</tbody>
    </table>
    <p class="fine-print">${swiss?'Ordine per vittorie e poi pareggi. A parità di record conta la differenza punti vittoria.':'Vittoria 3 · Pareggio 1 · Sconfitta 0. A parità di punti conta la differenza punti vittoria.'}</p>`;
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
    ${feeds.length===1?'<small>Passaggio automatico</small>':''}</li>`;
  const entry=(id,index)=>`<span class="bracket-player${series.winner===id?' advances':''}">${playerLink(id)}${series.total?`<strong>${series.total[index]}</strong>`:''}</span>`;
  const legs=series.b===null?'':series.ids.map((id,index)=>`<a href="#giornate" data-round="${round}" data-fixture="${id}">
    ${twoLegs()?(index===0?'Andata':'Ritorno'):'Apri partita'}${twoLegs()&&series.scores[index]?` · ${series.scores[index].join('–')}`:''}</a>`).join('');
  return `<li class="bracket-card">${label}${entry(series.a,0)}
    ${series.b===null?'<small>Passaggio automatico</small>':entry(series.b,1)}
    ${legs?`<span class="bracket-matches">${legs}</span>`:''}</li>`;
}

function renderBracket() {
  const {bracket,champion}=state.tournament;
  const results=$('league-standings');
  const scroll=results.querySelector('.bracket-scroll')?.scrollLeft || 0;
  const count=stage=>stage.series.length || stage.feeds.length;
  results.innerHTML = bracket.length ? `${champion ? `<p class="bracket-winner">Vincitore · ${playerLink(champion)}</p>` : ''}
    <div class="bracket-scroll" tabindex="0" role="region" aria-label="Tabellone dei turni, scorrimento orizzontale">
    <div class="tournament-bracket">${bracket.map((stage,index)=>{
      const {round,series,feeds}=stage;
      return `${index?bracketLinks(feeds,count(bracket[index-1])):''}
        <section class="bracket-stage"><h3>${roundLabel(round)}</h3><ol>
          ${Array.from({length:count(stage)},(_,slot)=>bracketCard(series[slot],feeds[slot],round,slot,bracket[index-1])).join('')}
        </ol></section>`;
    }).join('')}</div></div>` : '<p class="fine-print">Il tabellone sarà visibile dopo la chiusura delle iscrizioni.</p>';
  if(scroll) results.querySelector('.bracket-scroll').scrollLeft=scroll;
}

function rosterFormFields(signup=false) {
  return `${signup?'<p>Nel builder crea un “Pool del campionato”, poi sceglilo qui. Il roster viene consegnato insieme all’iscrizione; potrai aggiornarlo fino alla pubblicazione del calendario.</p>':''}
    <p>Limite roster: <strong>${state.rosters.settings.rosterLimit} punti</strong> · Limite partita: <strong>${state.rosters.settings.matchLimit} punti</strong>. I potenziamenti dei distaccamenti si scelgono e si pagano solo nelle liste degli incontri.</p>
    <label>Pool di unità dal tuo builder<select name="builderArmyId" required ${builderListsLoaded?'':'disabled'}>${builderListOptions(true)}</select></label>
    <p class="roster-equipment-note"><strong>Equipaggiamenti con costo extra: dichiarali adesso.</strong> Per ogni copia paghi il costo massimo tra le opzioni riservate, senza sommarle. Due opzioni da 15 costano 15 nel roster; una da 15 e una da 25 costano 25. Nella partita paghi tutte quelle effettivamente montate, rispettando le incompatibilità.</p>
    <div data-roster-options aria-live="polite"></div><p data-roster-total aria-live="polite"></p>
    <button type="button" class="secondary" data-roster-calculate>Calcola i punti del roster</button>`;
}

function renderRoster() {
  const panel=$('roster-panel'),data=state.rosters,settings=data?.settings;
  if(!panel)return;
  panel.hidden=!settings;
  if(!settings)return;
  const latest=data.versions[0],editable=state.league.joined&&!state.league.closed&&!state.league.paused&&(!state.league.start||settings.windowOpen);
  const summary=version=>`<p>${escapeHtml(version.roster.name)} · ${version.roster.points} / ${settings.rosterLimit} punti</p><ul>${version.roster.entries.map(entry=>`<li><strong>${escapeHtml(entry.name)}</strong> · ${entry.models} modelli · ${entry.points} pt${entry.equipmentPoints?`<br>Riserva equipaggiamenti: ${entry.equipmentPoints} pt — ${entry.options.filter(o=>entry.paidOptions[o.id]).map(o=>`${entry.paidOptions[o.id]}× ${escapeHtml(o.name)}`).join(', ')}`:''}</li>`).join('')}</ul>`;
  panel.innerHTML=`<div class="section-head"><h2 id="roster-heading">Roster del campionato</h2></div>
    <p>Roster: <strong>${settings.rosterLimit} punti</strong> · Partite: <strong>${settings.matchLimit} punti</strong></p>
    <p>${state.league.start?(settings.windowOpen?'Finestra di modifica aperta per tutti gli iscritti.':'Roster bloccati. Le modifiche richiedono una finestra aperta dall’amministratore.'):'Puoi preparare e sostituire il roster fino alla pubblicazione del calendario.'}</p>
    <p class="fine-print">I potenziamenti dei distaccamenti si scelgono e si pagano solo nelle liste degli incontri.</p>
    <p class="fine-print">Roster consegnati: ${data.submitted.length} / ${state.players.length}. Ogni copia e la sua taglia sono dichiarate. Le liste degli incontri usano solo queste copie.</p>
    ${latest?`<details><summary>Il tuo roster · versione ${latest.version}</summary>${summary(latest)}</details>`:state.league.joined?'<p>Devi ancora consegnare il roster.</p>':''}
    ${editable?`<details class="roster-editor"><summary>${latest?'Prepara una nuova versione':'Prepara il tuo roster'}</summary>
      <p>Scegli una lista salvata nel builder come bacino di unità. Non deve rispettare i requisiti di una singola partita.</p>
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
    return `<div class="fixture-block"><h3>Liste esercito</h3><p>Entrambe le liste sono state consegnate.</p>
      <div class="action-row"><button type="button" class="secondary" data-lineup="${state.user.id}">Leggi la tua lista</button>
      ${listAction(other)}</div></div>`;
  }
  if(state.rosters?.settings&&fixture.result)return '<div class="fixture-block"><h3>Liste esercito</h3><p>L’incontro è già confermato. Le consegne restano definitive.</p></div>';
  if (state.league.closed) return '<div class="fixture-block"><h3>Liste esercito</h3><p>Liste non rivelate.</p></div>';
  if (state.league.paused) return '<div class="fixture-block"><h3>Liste esercito</h3><p>Le consegne riprendono quando il campionato torna attivo.</p></div>';
  return `<div class="fixture-block">
    <h3>Liste esercito</h3>
    <p>${submitted ? 'La tua lista è stata consegnata. In attesa dell’avversario.' : opponent
      ? 'L’avversario ha consegnato. Carica la tua lista per sbloccare entrambe.'
      : 'Le liste saranno visibili a tutti i giocatori dopo entrambe le consegne.'}</p>
    <form class="lineup-form">
      <label>Lista dal tuo List Builder<select name="builderArmyId" ${state.rosters?.settings?'required':''} ${builderListsLoaded?'':'disabled'}>${builderListOptions()}</select></label>
      <p class="fine-print">Puoi consegnare una lista salvata nel tuo profilo. Al momento della consegna ne viene conservata una copia: le successive modifiche nel builder non cambiano la lista consegnata.</p>
      <pre data-builder-preview hidden aria-live="polite"></pre>
      ${state.rosters?.settings?'<p>La lista deve rispettare il roster e il limite partita. Il server controlla copie, taglie e opzioni a pagamento.</p>':`<label>Incolla la lista esercito<textarea name="text" rows="5" spellcheck="false"></textarea></label>
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
  const status = fixture.result?.void ? 'Annullata' : state.league.closed ? 'Non disputata' : fixture.awaiting ? 'Da confermare' : 'Da giocare';
  const leg = state.league.format==='knockout_legs' ? `<small>${fixture.leg===2?'Ritorno':'Andata'}</small>` : '';
  const contents = `<span class="pair"><strong>${playerLink(fixture.a)}${playerArmy(fixture.a)}</strong><span>vs</span><strong>${playerLink(fixture.b)}${playerArmy(fixture.b)}</strong></span>
    <span class="fixture-status${fixture.awaiting ? ' pending' : ''}">${leg}${score || status}</span>`;
  if (!playable(fixture)) {
    return `<div class="fixture row bye"><span>${playerLink(fixture.a)}</span><span>${['knockout','knockout_legs'].includes(state.league.format)?'Passa il turno':'Riposa'}</span></div>`;
  }
  if (!mine(fixture) && !fixture.listsReadable && !fixture.result?.photo) return `<div class="fixture row" data-fixture="${fixture.id}" tabindex="-1">${contents}</div>`;
  return `<details class="fixture" data-fixture="${fixture.id}"${fixture.id === openFixture ? ' open' : ''}>
    <summary class="row">${contents}<span class="expand" aria-hidden="true">+</span></summary>
    ${listPanel(fixture)}${mine(fixture)?resultPanel(fixture):''}${photoPanel(fixture)}
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
        <p class="round-meta">${fixtures.filter(confirmed).length}/${fixtures.filter(playable).length} confermate</p></div>
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
    : state.fixtures.find(fixture => playable(fixture) && !fixture.result)?.round;
  renderOverview(total, current);
  const refreshEnabled=state.tournament && state.user.admin && !state.league.closed;
  if(refreshEnabled && tournamentRefreshTimer===null){
    tournamentRefreshTimer=window.setInterval(refreshTournament,8000);
  } else if(!refreshEnabled && tournamentRefreshTimer!==null) {
    window.clearInterval(tournamentRefreshTimer);
    tournamentRefreshTimer=null;
  }
  renderRoster();
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
    `<option value="${index + 1}">${state.tournament ? roundLabel(index+1) : index+1}${liveCurrent === index + 1 ? ' · corrente' : ''}</option>`).join('');
  renderRounds(total, liveCurrent);
  goToRound(selectedRound ?? current ?? total);
}

function canRefreshTournament(){
  return state?.tournament && state.user.admin && !state.league.closed && !document.hidden &&
    !leagueSubmitting && !document.activeElement?.closest('form') && !document.querySelector('form[data-league-draft], dialog[open]');
}

async function refreshTournament(){
  if(leagueRefreshing || !canRefreshTournament()) return;
  leagueRefreshing=true;
  const before=state;
  try {
    const next=await request('league');
    if(!next || state!==before || !canRefreshTournament() || JSON.stringify(next)===JSON.stringify(before)) return;
    const panel=$('round');
    const scrollTop=panel.scrollTop;
    openFixture=panel.querySelector('details[open]')?.dataset.fixture;
    state=next;
    if(next.tournament.round!==before.tournament.round) selectedRound=undefined;
    render();
    if(next.tournament.round===before.tournament.round) panel.scrollTop=scrollTop;
  } catch {
    // A temporary connection failure must not replace the current view.
  } finally {
    leagueRefreshing=false;
  }
}

const markLeagueDraft=event=>{
  if(event.target.matches('input,textarea,select') && event.target.form) event.target.form.dataset.leagueDraft='';
};
document.addEventListener('input',markLeagueDraft);
document.addEventListener('change',markLeagueDraft);
document.addEventListener('visibilitychange',refreshTournament);

const notices = {
  leagueRosterSave: 'Nuova versione del roster consegnata.',
  leagueRosterWindow: 'Finestra dei roster aggiornata.',
  leaguePhoto: 'Foto della partita salvata.',
  leagueOpen: 'Iscrizioni aperte.',
  leagueAnnounce: 'Messaggio inviato agli iscritti con email verificata.',
  leagueJoin: 'Iscrizione confermata.',
  leagueStart: 'Calendario pubblicato.',
  leagueAdvance: 'Turno aggiornato.',
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
  if (control.name === 'format' || control.name === 'useRoster') {
    const {format,useRoster,rosterLimit,matchLimit} = control.form.elements;
    const tournament = format.value !== 'round_robin';
    useRoster.closest('label').hidden = !tournament;
    for (const limit of [rosterLimit,matchLimit]) {
      limit.disabled = tournament && !useRoster.checked;
      limit.closest('label').hidden = limit.disabled;
    }
  }
  if (control.name === 'byes') {
    const options = [...control.form.querySelectorAll('[name=byes]')];
    const max = Number(control.closest('fieldset').dataset.maxByes);
    const full = options.filter(option => option.checked).length >= max;
    for (const option of options) option.disabled = full && !option.checked;
  }
});

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
  const fixture = form.closest('[data-fixture]');
  if (fixture) data.fixture = fixture.dataset.fixture;
  try {
    if(name==='leagueRosterWindow')data.open=data.open==='true';
    if(name==='leagueRosterSave'||(name==='leagueJoin'&&state.rosters?.settings))data.paidOptions=rosterPaidOptions(form);
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
  openLeagueFixture(link.dataset.fixture, Number(link.dataset.round));
}
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

function rosterPaidOptions(form) {
  if(!form._rosterPreview||form._rosterArmy!==form.elements.builderArmyId.value)throw new Error('Attendi il caricamento delle opzioni del roster.');
  const paid={};
  for(const input of form.querySelectorAll('[data-roster-option]')) {
    const entry=input.dataset.entry,option=input.dataset.rosterOption;
    (paid[entry]??={})[option]=Number(input.value);
  }
  return paid;
}
function rosterCalculate(form) {
  const paid=rosterPaidOptions(form);let points=0;
  for(const entry of form._rosterPreview.entries) {
    const extra=Math.max(0,...entry.options.map(option=>option.cost*(paid[entry.entryId]?.[option.id]||0)));
    points+=entry.basePoints+extra;
  }
  form.querySelector('[data-roster-total]').textContent=`Totale roster: ${points} / ${state.rosters.settings.rosterLimit} punti${points>state.rosters.settings.rosterLimit?' · Limite superato':''}`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-roster-calculate]');
  if(!button)return;
  try{rosterCalculate(button.closest('form'));}catch(error){notify(error.message,true);}
});
document.addEventListener('change',async event=>{
  const select=event.target;
  if(select.matches('[data-roster-option]')) {rosterCalculate(select.closest('form'));return;}
  if(!select.matches('.roster-form [name=builderArmyId]'))return;
  const form=select.closest('form'),target=form.querySelector('[data-roster-options]'),id=select.value,token={};
  form._rosterRequest=token;form._rosterPreview=null;form._rosterArmy=null;
  form.querySelector('[data-roster-total]').textContent='';
  if(!id){target.replaceChildren();return;}
  target.textContent='Caricamento delle opzioni a pagamento…';
  try {
    const preview=await request('leagueRosterPreview&id='+encodeURIComponent(id));
    if(form._rosterRequest!==token)return;
    form._rosterPreview=preview;form._rosterArmy=id;
    target.innerHTML=preview.entries.map(entry=>`<fieldset><legend>${escapeHtml(entry.name)} · ${entry.models} modelli</legend><p>Base: ${entry.basePoints} pt</p>${entry.options.length?entry.options.map(option=>`<label>${escapeHtml(option.name)} · ${option.cost} pt ciascuno<input type="number" min="0" max="${option.maximum}" value="${option.quantity}" data-entry="${escapeHtml(entry.entryId)}" data-roster-option="${escapeHtml(option.id)}" required></label>`).join(''):'<p class="fine-print">Nessuna opzione a pagamento. Equipaggiamento gratuito modificabile nelle partite.</p>'}</fieldset>`).join('');
    rosterCalculate(form);
  }catch(error){if(form._rosterRequest===token){target.textContent=error.message;form._rosterPreview=null;}}
});
document.addEventListener('change',async event=>{
  const select=event.target;if(!select.matches('.lineup-form [name=builderArmyId]'))return;
  const form=select.closest('form'),preview=form.querySelector('[data-builder-preview]'),id=select.value;
  for(const field of form.querySelectorAll('[name=text],[name=file]'))field.disabled=Boolean(id);preview.hidden=!id;
  if(!id){preview.textContent='';return;}preview.textContent='Caricamento della lista salvata…';
  try{const data=await request('builderArmyText&id='+encodeURIComponent(id));if(select.value===id)preview.textContent=data.text;}
  catch(error){if(select.value===id)preview.textContent=error.message;}
});
request('builderArmies').then(data=>{
  builderArmies=data?.armies||[];builderListsLoaded=true;
  for(const select of document.querySelectorAll('.lineup-form [name=builderArmyId],.roster-form [name=builderArmyId]')){select.innerHTML=builderListOptions(Boolean(select.closest('.roster-form')));select.disabled=false;}
}).catch(()=>{builderListsLoaded=true;});
request('league').then(data => {
  state = data;
  render();
  const fixture = state?.fixtures.find(item => item.id === leagueQuery.get('fixture') && mine(item));
  if (fixture) openLeagueFixture(fixture.id, fixture.round);
}).catch(() => {
  $('season-actions').textContent = 'Campionato non disponibile. Ricarica la pagina per riprovare.';
});
