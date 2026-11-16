'use strict';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const day = 86400000;
const roundDays = 14;
const epoch = date => Date.parse(date);
const formatDate = (date, options = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...options }).format(typeof date === 'number' ? date : epoch(date));
const action = (name, label, kind = 'primary') =>
  `<button type="submit" class="${kind}" name="action" value="${name}">${label}</button>`;

let state;
let selectedRound;
let openFixture;

async function request(name, data) {
  const response = await fetch(`api.php?action=${name}`, data ? {
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
const confirmed = fixture => fixture.result && !fixture.result.void;
const playable = fixture => fixture.b !== null;
const mine = fixture => fixture.lineups !== null;

function renderOverview(total, elapsed, finished) {
  const { league, user, players, today } = state;
  const actions = $('season-actions');
  const board = $('season-board');
  if (!league) {
    $('season-caption').textContent = 'Le iscrizioni non sono ancora aperte.';
    if (user.admin) {
      actions.innerHTML = `<form class="inline-form">
        <label>Nome del campionato<input name="name" required maxlength="100" value="Stagione 1"></label>
        ${action('leagueOpen', 'Apri le iscrizioni')}
      </form>`;
    } else {
      actions.replaceChildren();
    }
    return;
  }

  $('season-caption').textContent = `${league.name} · Girone unico di sola andata`;
  board.hidden = false;
  if (!league.start) {
    board.innerHTML = `<p class="eyebrow">Iscrizioni aperte</p>
      <strong class="display-number">${players.length}</strong>
      <p>${players.length === 1 ? 'Giocatore iscritto' : 'Giocatori iscritti'}</p>`;
    actions.innerHTML = league.joined
      ? '<p>Iscrizione confermata.</p>'
      : `<form>${action('leagueJoin', 'Iscriviti al campionato')}</form>`;
    if (user.admin && players.length < 2) {
      actions.insertAdjacentHTML('beforeend', '<p>Servono almeno due iscritti per pubblicare il calendario.</p>');
    }
    if (user.admin && players.length >= 2) {
      actions.insertAdjacentHTML('beforeend', `<form class="inline-form">
        <label>Inizio del campionato<input type="date" name="start" min="${today}" value="${today}" required></label>
        ${action('leagueStart', 'Chiudi iscrizioni e pubblica')}
      </form>`);
    }
    return;
  }

  const upcoming = state.fixtures.filter(fixture => playable(fixture) && mine(fixture) && !fixture.result);
  const next = elapsed < 1 ? upcoming[0] : upcoming.find(fixture => fixture.round >= elapsed) || upcoming[0];
  const summary = next ? `<p class="up-next">Prossimo incontro <strong>${player(next.a === user.id ? next.b : next.a)}</strong></p>` : '';
  const calendar = next
    ? `<a href="#giornate" class="primary" data-round="${next.round}" data-fixture="${next.id}">Apri l’incontro</a>`
    : '<a href="#giornate" class="primary">Consulta il calendario</a>';
  actions.innerHTML = summary + `<div class="action-row">${calendar}<a class="jump" href="#classifica">Vedi la classifica ↓</a></div>`;

  const status = finished ? 'Campionato concluso' : elapsed < 1 ? 'Prima giornata' : elapsed > total ? 'Recuperi' : 'Giornata corrente';
  board.innerHTML = `<p class="eyebrow">${status}</p>
    <strong class="display-number">${String(elapsed > total || finished ? total : Math.max(elapsed, 1)).padStart(2, '0')}</strong>
    <p>${elapsed < 1 ? `Si parte il ${formatDate(league.start)}` : `${state.fixtures.filter(confirmed).length} risultati confermati`}</p>`;
}

function renderStandings() {
  const entrants = state.users.filter(user => state.players.includes(user.id));
  const matches = state.fixtures.filter(confirmed).map(fixture => ({
    a: fixture.a, b: fixture.b, ...fixture.result
  }));
  const standings = rankStandings(entrants, matches);
  $('league-standings').innerHTML = `<table>
    <thead><tr><th scope="col">#</th><th scope="col">Giocatore</th>
      <th scope="col"><abbr title="Partite giocate">PG</abbr></th>
      <th scope="col"><abbr title="Differenza punti vittoria">Diff.</abbr></th>
      <th scope="col">Punti</th></tr></thead>
    <tbody>${standings.map(row => `<tr${row.id === state.user.id ? ' class="you"' : ''}>
      <td>${row.rank}</td><th scope="row">${escapeHtml(row.name)}</th><td>${row.played}</td>
      <td>${row.diff > 0 ? '+' : ''}${row.diff}</td><td>${row.points}</td></tr>`).join('')}</tbody>
    </table>
    <p class="fine-print">Vittoria 3 · Pareggio 1 · Sconfitta 0. A parità di punti conta la differenza punti vittoria.</p>`;
}

function listPanel(fixture) {
  const { mine: submitted, opponent } = fixture.lineups;
  if (submitted && opponent) {
    const download = id => `api.php?action=leagueDownload&amp;fixture=${fixture.id}&amp;player=${id}`;
    const other = fixture.a === state.user.id ? fixture.b : fixture.a;
    return `<div class="fixture-block"><h3>Liste esercito</h3><p>Entrambe le liste sono state consegnate.</p>
      <div class="action-row"><a class="secondary" href="${download(state.user.id)}">Scarica la tua lista</a>
      <a class="secondary" href="${download(other)}">Scarica la lista di ${player(other)}</a></div></div>`;
  }
  return `<div class="fixture-block">
    <h3>Liste esercito</h3>
    <p>${submitted ? 'La tua lista è stata consegnata. In attesa dell’avversario.' : opponent
      ? 'L’avversario ha consegnato. Carica la tua lista per sbloccare entrambe.'
      : 'Le liste saranno visibili ai due giocatori dopo entrambe le consegne.'}</p>
    <form class="inline-form">
      <label>Lista esercito (.txt, UTF-8)<input type="file" name="file" accept=".txt,text/plain" required></label>
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
  if (fixture.pending) {
    const { by, scoreA, scoreB, date, mission, token } = fixture.pending;
    const own = by === state.user.id;
    return `<div class="fixture-block"><h3>Risultato da confermare</h3>
      <p>${player(fixture.a)} <strong>${scoreA} – ${scoreB}</strong> ${player(fixture.b)} · ${formatDate(date)}
      ${mission ? ` · ${escapeHtml(mission)}` : ''}</p>
      <p>${own ? 'In attesa della conferma dell’avversario.' : 'Verifica il punteggio proposto dall’avversario.'}</p>
      <form class="action-row">
        <input type="hidden" name="proposal" value="${token}">
        ${own ? action('leagueWithdraw', 'Ritira il risultato', 'secondary') :
          action('leagueConfirm', 'Conferma il risultato') + action('leagueReject', 'Rifiuta il risultato', 'secondary')}
      </form></div>`;
  }
  if (state.today < state.league.start) return '<div class="fixture-block"><p>Potrai proporre il risultato a campionato iniziato.</p></div>';
  return `<div class="fixture-block"><h3>Proponi il risultato</h3>
    <form class="result-form">
      <label>Punti · ${player(fixture.a)}<input type="number" name="scoreA" min="0" max="100" required></label>
      <label>Punti · ${player(fixture.b)}<input type="number" name="scoreB" min="0" max="100" required></label>
      <label>Data della partita<input type="date" name="date" min="${state.league.start}" max="${state.today}" value="${state.today}" required></label>
      <label>Missione (facoltativa)<input name="mission" maxlength="120"></label>
      <p>L’avversario dovrà confermare il risultato.</p>
      ${action('leaguePropose', 'Invia il risultato')}
    </form></div>`;
}

function fixtureRow(fixture) {
  const score = confirmed(fixture) ? `<strong>${fixture.result.scoreA} – ${fixture.result.scoreB}</strong>` : '';
  const status = fixture.result?.void ? 'Annullata' : fixture.awaiting ? 'Da confermare' : 'Da giocare';
  const contents = `<span class="pair"><strong>${player(fixture.a)}</strong><span>vs</span><strong>${player(fixture.b)}</strong></span>
    <span class="fixture-status">${score || status}</span>`;
  if (!playable(fixture)) {
    return `<div class="fixture row bye"><span>${player(fixture.a)}</span><span>Riposa</span></div>`;
  }
  if (!mine(fixture)) return `<div class="fixture row">${contents}</div>`;
  return `<details class="fixture" data-fixture="${fixture.id}"${fixture.id === openFixture ? ' open' : ''}>
    <summary class="row">${contents}<span class="expand" aria-hidden="true">+</span></summary>
    ${listPanel(fixture)}${resultPanel(fixture)}
  </details>`;
}

function renderRound() {
  const start = epoch(state.league.start) + (selectedRound - 1) * roundDays * day;
  const fixtures = state.fixtures.filter(fixture => fixture.round === selectedRound);
  $('round').innerHTML = `<p class="round-window">${formatDate(start)} – ${formatDate(start + (roundDays - 1) * day)}</p>
    <div class="match-list">${fixtures.map(fixtureRow).join('')}</div>`;
}

function render() {
  if (!state) {
    $('season-caption').textContent = 'Accedi alle Cronache del settore per vedere il campionato.';
    $('season-actions').innerHTML = '<a class="primary" href="index.php">Vai all’accesso</a>';
    return;
  }
  const total = Math.max(0, ...state.fixtures.map(fixture => fixture.round));
  const elapsed = state.league?.start
    ? Math.floor((epoch(state.today) - epoch(state.league.start)) / (roundDays * day)) + 1 : 0;
  const finished = total > 0 && state.fixtures.filter(playable).every(confirmed);
  renderOverview(total, elapsed, finished);
  $('league-content').hidden = !state.league;
  $('giornate').hidden = !total;
  if (state.league) renderStandings();
  if (!total) return;
  const current = Math.max(1, Math.min(elapsed, total));
  selectedRound ??= elapsed > total
    ? state.fixtures.find(fixture => playable(fixture) && !fixture.result)?.round ?? current : current;
  $('round-picker').innerHTML = Array.from({ length: total }, (_, index) =>
    `<option value="${index + 1}">${index + 1}${!finished && elapsed === index + 1 ? ' · corrente' : ''}</option>`).join('');
  $('round-picker').value = selectedRound;
  renderRound();
}

const notices = {
  leagueOpen: 'Iscrizioni aperte.',
  leagueJoin: 'Iscrizione confermata.',
  leagueStart: 'Calendario pubblicato.',
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
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(control => control.disabled = true);
  form.setAttribute('aria-busy', 'true');
  const name = button.value;
  const data = Object.fromEntries(new FormData(form));
  const fixture = form.closest('[data-fixture]');
  if (fixture) data.fixture = fixture.dataset.fixture;
  try {
    if (name === 'leagueLineup') {
      if (data.file.size > 1048576) throw new Error('Il file deve pesare al massimo 1 MB.');
      data.filename = data.file.name;
      try {
        data.text = new TextDecoder('utf-8', { fatal: true }).decode(await data.file.arrayBuffer());
      } catch {
        throw new Error('Salva la lista come file di testo UTF-8.');
      }
      delete data.file;
    }
    if (name === 'leaguePropose') {
      data.scoreA = Number(data.scoreA);
      data.scoreB = Number(data.scoreB);
    }
    await request(name, data);
    state = await request('league');
    openFixture = fixture?.dataset.fixture;
    render();
    if (openFixture) $('round').querySelector(`[data-fixture="${openFixture}"] summary`)?.focus();
    notify(notices[name]);
  } catch (error) {
    notify(error.message, true);
    $('league-notice').scrollIntoView({ block: 'nearest' });
  } finally {
    buttons.forEach(control => control.disabled = false);
    form.removeAttribute('aria-busy');
  }
});

$('round-picker').addEventListener('change', event => {
  selectedRound = Number(event.target.value);
  openFixture = null;
  renderRound();
});

$('season-actions').addEventListener('click', event => {
  const link = event.target.closest('[data-round]');
  if (!link) return;
  selectedRound = Number(link.dataset.round);
  event.preventDefault();
  openFixture = link.dataset.fixture;
  $('round-picker').value = selectedRound;
  renderRound();
  $('round').querySelector(`[data-fixture="${openFixture}"] summary`)?.focus();
});

request('league').then(data => {
  state = data;
  render();
}).catch(() => {
  $('season-actions').textContent = 'Campionato non disponibile. Ricarica la pagina per riprovare.';
});
