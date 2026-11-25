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

function renderOverview(total, current) {
  const { league, user, players } = state;
  const actions = $('season-actions');
  const board = $('season-board');
  if (!league) {
    $('season-caption').textContent = 'Le iscrizioni non sono ancora aperte.';
    if (user.admin) {
      actions.innerHTML = `<form class="inline-form">
        <label>Nome del campionato<input name="name" required maxlength="100"></label>
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
  $('season-caption').textContent = 'Warhammer 40.000 · Girone unico di sola andata';
  board.hidden = false;
  if (league.closed || league.paused) {
    const restore = league.closed ? action('leagueReopen', 'Riapri campionato')
      : action('leagueResume', 'Riprendi campionato') + action('leagueClose', 'Chiudi campionato', 'secondary');
    actions.innerHTML = user.admin ? `<form class="action-row">${restore}</form>` : '';
    board.innerHTML = `<p class="eyebrow">${league.closed ? 'Campionato concluso' : 'Campionato in pausa'}</p>
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
    actions.innerHTML = league.joined
      ? `<p>Iscrizione confermata.${armyLabel(user.id) ? ' · ' + escapeHtml(armyLabel(user.id)) : ''}</p>`
      : `<form class="army-signup${state.rosters?.settings?' roster-form':''}"><label>Il tuo esercito<select name="army" required>
          <option value="">Scegli l’esercito</option>
          ${Object.entries(state.armyGroups).map(([group, armies]) => `<optgroup label="${escapeHtml(group)}">
            ${Object.entries(armies).map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('')}
          </optgroup>`).join('')}
        </select></label>${state.rosters?.settings?rosterFormFields(true):''}${action('leagueJoin', state.rosters?.settings?'Conferma iscrizione e roster':'Iscriviti al campionato')}</form>`;
    if (user.admin && players.length < 2) {
      actions.insertAdjacentHTML('beforeend', '<p>Servono almeno due iscritti per pubblicare il calendario.</p>');
    }
    if (user.admin && players.length >= 2) {
      actions.insertAdjacentHTML('beforeend', `<form>
        ${action('leagueStart', 'Chiudi iscrizioni e pubblica')}
      </form>`);
    }
    actions.insertAdjacentHTML('beforeend', lifecycleForm);
    return;
  }

  const next = state.fixtures.find(fixture => mine(fixture) && !fixture.result);
  actions.innerHTML = lifecycleForm;

  if (next) {
    board.innerHTML = `
      <div class="board-top"><h2 class="eyebrow">Prossimo incontro</h2><span>Giornata ${next.round}</span></div>
      <div class="matchup"><strong>${playerLink(user.id)}</strong><span>vs</span><strong>${playerLink(next.a === user.id ? next.b : next.a)}</strong></div>
      <div class="board-bottom">
        <span>${next.awaiting ? 'Risultato da confermare' : 'Da giocare'}</span>
        <a href="#giornate" class="jump" data-round="${next.round}" data-fixture="${next.id}">Apri l’incontro <span aria-hidden="true">↗</span></a>
      </div>`;
  } else {
    board.innerHTML = `<p class="eyebrow">${current ? 'Giornata corrente' : 'Giornate completate'}</p>
      <strong class="display-number">${current ?? total}</strong>
      <p>${state.fixtures.filter(confirmed).length} risultati confermati</p>`;
  }
}

function renderStandings() {
  const entrants = state.users.filter(user => state.players.includes(user.id));
  const matches = state.fixtures.filter(confirmed).map(fixture => ({
    a: fixture.a, b: fixture.b, ...fixture.result
  }));
  const standings = rankStandings(entrants, matches);
  if (!standings.length) {
    const empty = state.league.closed || state.league.paused ? 'Nessun iscritto.' : 'In attesa delle prime iscrizioni.';
    $('league-standings').innerHTML = `<p class="fine-print">${empty}</p>`;
    return;
  }
  $('league-standings').innerHTML = `<table>
    <thead><tr><th scope="col">#</th><th scope="col">Giocatore</th>
      <th scope="col"><abbr title="Partite giocate">PG</abbr></th>
      <th scope="col"><abbr title="Differenza punti vittoria">Diff.</abbr></th>
      <th scope="col">Punti</th></tr></thead>
    <tbody>${standings.map(row => {
      const podium = matches.length && row.rank <= 3 ? ` podium podium-${row.rank}` : '';
      return `<tr class="${row.id === state.user.id ? 'you' : ''}${podium}">
        <td class="placement"><span>${row.rank}</span></td><th scope="row">${playerLink(row.id)}${row.id === state.user.id ? ' <small>Tu</small>' : ''}${playerArmy(row.id)}</th><td>${row.played}</td>
        <td>${row.diff > 0 ? '+' : ''}${row.diff}</td><td>${row.points}</td></tr>`;
    }).join('')}</tbody>
    </table>
    <p class="fine-print">Vittoria 3 · Pareggio 1 · Sconfitta 0. A parità di punti conta la differenza punti vittoria.</p>`;
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

function schedulePanel(fixture) {
  if(!mine(fixture)||fixture.result||state.league.closed||state.league.paused)return '';
  const schedule=fixture.schedule,proposal=fixture.scheduleProposal||{version:0,pending:null};
  const pending=proposal.pending,own=pending?.by===state.user.id;
  const active=schedule&&!schedule.cancelled;
  return '<div class="fixture-block fixture-schedule"><h3>Quando giochiamo?</h3>'+
    (active?'<p>Data concordata: <strong>'+escapeHtml(formatDate(schedule.date))+(schedule.time?' · '+escapeHtml(schedule.time):'')+'</strong> · <a href="index.php#calendario">Apri calendario</a></p>':'<p>Concorda la data prima di preparare le liste. Non è necessario averle già consegnate.</p>')+
    (pending?'<p><strong>Proposta di '+player(pending.by)+': '+escapeHtml(formatDate(pending.event.date))+(pending.event.time?' · '+escapeHtml(pending.event.time):'')+'</strong></p><p>La data comparirà nel calendario dopo l’approvazione dell’altro giocatore.</p>'+
      '<form class="action-row"><input type="hidden" name="proposalVersion" value="'+proposal.version+'">'+
      (own?action('calendarWithdraw','Ritira proposta','secondary'):action('calendarApprove','Approva data')+action('calendarReject','Rifiuta data','secondary'))+'</form>':'')+
    (!pending||own?'<form class="schedule-form"><input type="hidden" name="id" value="'+escapeHtml(schedule?.id||'')+'"><input type="hidden" name="version" value="'+(schedule?.version||0)+'"><input type="hidden" name="proposalVersion" value="'+proposal.version+'">'+
      '<label>Data proposta<input type="date" name="date" min="'+state.today+'" max="2100-12-31" value="'+escapeHtml(pending?.event.date||schedule?.date||state.today)+'" required></label>'+
      '<label>Orario italiano (facoltativo)<input type="time" name="time" value="'+escapeHtml(pending?.event.time||schedule?.time||'')+'"></label>'+
      action('calendarSave',pending?'Aggiorna proposta':'Proponi data','secondary')+'</form>':'')+'</div>';
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
  const contents = `<span class="pair"><strong>${playerLink(fixture.a)}${playerArmy(fixture.a)}</strong><span>vs</span><strong>${playerLink(fixture.b)}${playerArmy(fixture.b)}</strong></span>
    <span class="fixture-status${fixture.awaiting ? ' pending' : ''}">${score || status}</span>`;
  if (!playable(fixture)) {
    return `<div class="fixture row bye"><span>${playerLink(fixture.a)}</span><span>Riposa</span></div>`;
  }
  if (!mine(fixture) && !fixture.listsReadable && !fixture.result?.photo) return `<div class="fixture row">${contents}</div>`;
  return `<details class="fixture" data-fixture="${fixture.id}"${fixture.id === openFixture ? ' open' : ''}>
    <summary class="row">${contents}<span class="expand" aria-hidden="true">+</span></summary>
    ${schedulePanel(fixture)}${listPanel(fixture)}${mine(fixture)?resultPanel(fixture):''}${photoPanel(fixture)}
  </details>`;
}

function renderRounds(total, current) {
  const rounds = Array.from({ length: total }, () => []);
  for (const fixture of state.fixtures) rounds[fixture.round - 1].push(fixture);
  $('round').innerHTML = rounds.map((fixtures, index) => {
    const number = index + 1;
    const active = number === current;
    return `<section class="round-group${active ? ' current-round' : ''}" id="giornata-${number}">
      <div class="round-head"><h3>Giornata ${number}${active ? ' <small>In corso</small>' : ''}</h3>
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
  const current = state.league?.closed ? undefined : state.fixtures.find(fixture => playable(fixture) && !fixture.result)?.round;
  renderOverview(total, current);
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
  showLeagueView(leagueView);
  if (state.league) renderStandings();
  if (!total) return;
  const liveCurrent = state.league.paused ? undefined : current;
  $('round-picker').innerHTML = Array.from({ length: total }, (_, index) =>
    `<option value="${index + 1}">${index + 1}${liveCurrent === index + 1 ? ' · corrente' : ''}</option>`).join('');
  renderRounds(total, liveCurrent);
  goToRound(selectedRound ?? current ?? total);
}

const notices = {
  calendarSave: 'Data proposta. In attesa dell’approvazione dell’avversario.',
  calendarApprove: 'Data approvata e pubblicata nel calendario.',
  calendarReject: 'Proposta rifiutata.',
  calendarWithdraw: 'Proposta ritirata.',
  leagueRosterSave: 'Nuova versione del roster consegnata.',
  leagueRosterWindow: 'Finestra dei roster aggiornata.',
  leaguePhoto: 'Foto della partita salvata.',
  leagueOpen: 'Iscrizioni aperte.',
  leagueAnnounce: 'Messaggio inviato agli iscritti con email verificata.',
  leagueJoin: 'Iscrizione confermata.',
  leagueStart: 'Calendario pubblicato.',
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
  if (!button || form.getAttribute('aria-busy') === 'true') return;
  const name = button.value;
  if (name === 'leagueClose' &&
      !window.confirm('Chiudere il campionato? Classifica e calendario resteranno consultabili. Per completare gli incontri aperti dovrai riaprirlo.')) return;
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(control => control.disabled = true);
  form.setAttribute('aria-busy', 'true');
  const data = Object.fromEntries(new FormData(form));
  if(name.startsWith('calendar')){
    if(name==='calendarSave'&&!data.id)data.id=window.crypto.randomUUID().replaceAll('-','').slice(0,24);
    if('version' in data)data.version=Number(data.version);
    data.proposalVersion=Number(data.proposalVersion);
  }
  if (state.league) data.league = state.league.id;
  if (name === 'leagueOpen') {
    openingToken ??= window.crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    data.request = openingToken;
    data.notify = Boolean(data.notify);
    data.rosterLimit = Number(data.rosterLimit);
    data.matchLimit = Number(data.matchLimit);
  }
  if (name === 'leagueAnnounce') {
    announcementToken ??= window.crypto.randomUUID();
    data.request = announcementToken;
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
  fixture.open = true;
  if (narrowLayout.matches) showLeagueView('giornate');
  goToRound(round);
  fixture.querySelector('summary').focus();
}

$('season-board').addEventListener('click', event => {
  const link = event.target.closest('[data-round]');
  if (!link) return;
  event.preventDefault();
  openLeagueFixture(link.dataset.fixture, Number(link.dataset.round));
});

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
  const fixture = state?.fixtures.find(item => item.id === leagueQuery.get('fixture'));
  if (fixture) openLeagueFixture(fixture.id, fixture.round);
}).catch(() => {
  $('season-actions').textContent = 'Campionato non disponibile. Ricarica la pagina per riprovare.';
});

