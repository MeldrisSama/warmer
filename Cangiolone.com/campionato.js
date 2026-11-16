'use strict';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const dateFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = date => dateFormat.format(Date.parse(date));
const action = (name, label, kind = 'primary') =>
  `<button type="submit" class="${kind}" name="action" value="${name}">${label}</button>`;

let state;
let selectedRound;
let openFixture;
let lineupRequest;

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

function renderOverview(total, current) {
  const { league, user, players } = state;
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

  $('season-title').textContent = league.name;
  document.title = `${league.name} · Cronache del settore`;
  $('season-caption').textContent = 'Warhammer 40.000 · Girone unico di sola andata';
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
      actions.insertAdjacentHTML('beforeend', `<form>
        ${action('leagueStart', 'Chiudi iscrizioni e pubblica')}
      </form>`);
    }
    return;
  }

  const next = state.fixtures.find(fixture => mine(fixture) && !fixture.result);
  actions.replaceChildren();

  if (next) {
    board.innerHTML = `
      <div class="board-top"><h2 class="eyebrow">Prossimo incontro</h2><span>Giornata ${next.round}</span></div>
      <div class="matchup"><strong>${player(user.id)}</strong><span>vs</span><strong>${player(next.a === user.id ? next.b : next.a)}</strong></div>
      <div class="board-bottom">
        <span>${next.awaiting ? 'Risultato da confermare' : 'Da giocare'}</span>
        <a href="#giornate" class="jump" data-round="${next.round}" data-fixture="${next.id}">Apri l’incontro <span aria-hidden="true">↗</span></a>
      </div>`;
  } else {
    board.innerHTML = `<p class="eyebrow">${current ? 'Giornata corrente' : 'Campionato concluso'}</p>
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
    $('league-standings').innerHTML = '<p class="fine-print">In attesa delle prime iscrizioni.</p>';
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
        <td class="placement"><span>${row.rank}</span></td><th scope="row">${escapeHtml(row.name)}${row.id === state.user.id ? ' <small>Tu</small>' : ''}</th><td>${row.played}</td>
        <td>${row.diff > 0 ? '+' : ''}${row.diff}</td><td>${row.points}</td></tr>`;
    }).join('')}</tbody>
    </table>
    <p class="fine-print">Vittoria 3 · Pareggio 1 · Sconfitta 0. A parità di punti conta la differenza punti vittoria.</p>`;
}

function listPanel(fixture) {
  const { mine: submitted, opponent } = fixture.lineups;
  if (submitted && opponent) {
    const other = fixture.a === state.user.id ? fixture.b : fixture.a;
    return `<div class="fixture-block"><h3>Liste esercito</h3><p>Entrambe le liste sono state consegnate.</p>
      <div class="action-row"><button type="button" class="secondary" data-lineup="${state.user.id}">Leggi la tua lista</button>
      <button type="button" class="secondary" data-lineup="${other}">Leggi la lista di ${player(other)}</button></div></div>`;
  }
  return `<div class="fixture-block">
    <h3>Liste esercito</h3>
    <p>${submitted ? 'La tua lista è stata consegnata. In attesa dell’avversario.' : opponent
      ? 'L’avversario ha consegnato. Carica la tua lista per sbloccare entrambe.'
      : 'Le liste saranno visibili ai due giocatori dopo entrambe le consegne.'}</p>
    <form class="lineup-form">
      <label>Incolla la lista esercito<textarea name="text" rows="5" spellcheck="false"></textarea></label>
      <label>Oppure carica un file .txt<input type="file" name="file" accept=".txt,text/plain"></label>
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
  return `<div class="fixture-block"><h3>Proponi il risultato</h3>
    <form class="result-form">
      <label>Punti · ${player(fixture.a)}<input type="number" name="scoreA" min="0" max="100" required></label>
      <label>Punti · ${player(fixture.b)}<input type="number" name="scoreB" min="0" max="100" required></label>
      <label>Data della partita<input type="date" name="date" max="${state.today}" value="${state.today}" required></label>
      <label>Missione (facoltativa)<input name="mission" maxlength="120"></label>
      <p>L’avversario dovrà confermare il risultato.</p>
      ${action('leaguePropose', 'Invia il risultato')}
    </form></div>`;
}

function fixtureRow(fixture) {
  const score = confirmed(fixture) ? `<strong>${fixture.result.scoreA} – ${fixture.result.scoreB}</strong>
    <time datetime="${fixture.result.date}">${formatDate(fixture.result.date)}</time>` : '';
  const status = fixture.result?.void ? 'Annullata' : fixture.awaiting ? 'Da confermare' : 'Da giocare';
  const contents = `<span class="pair"><strong>${player(fixture.a)}</strong><span>vs</span><strong>${player(fixture.b)}</strong></span>
    <span class="fixture-status${fixture.awaiting ? ' pending' : ''}">${score || status}</span>`;
  if (!playable(fixture)) {
    return `<div class="fixture row bye"><span>${player(fixture.a)}</span><span>Riposa</span></div>`;
  }
  if (!mine(fixture)) return `<div class="fixture row">${contents}</div>`;
  return `<details class="fixture" data-fixture="${fixture.id}"${fixture.id === openFixture ? ' open' : ''}>
    <summary class="row">${contents}<span class="expand" aria-hidden="true">+</span></summary>
    ${listPanel(fixture)}${resultPanel(fixture)}
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
  $('round').scrollTop = $('giornata-' + number).offsetTop;
}

function render() {
  if (!state) {
    $('season-caption').textContent = 'Accedi alle Cronache del settore per vedere il campionato.';
    $('season-actions').innerHTML = '<a class="primary" href="index.php">Vai all’accesso</a>';
    return;
  }
  const total = Math.max(0, ...state.fixtures.map(fixture => fixture.round));
  const current = state.fixtures.find(fixture => playable(fixture) && !fixture.result)?.round;
  renderOverview(total, current);
  $('league-content').hidden = !state.league;
  $('giornate').hidden = !total;
  if (state.league) renderStandings();
  if (!total) return;
  $('round-picker').innerHTML = Array.from({ length: total }, (_, index) =>
    `<option value="${index + 1}">${index + 1}${current === index + 1 ? ' · corrente' : ''}</option>`).join('');
  renderRounds(total, current);
  goToRound(selectedRound ?? current ?? total);
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
      const { file } = data;
      const pasted = data.text.trim() !== '';
      if (file.name && pasted) throw new Error('Scegli se incollare la lista o caricare un file.');
      if (!file.name && !pasted) throw new Error('Incolla la lista o carica un file .txt.');
      if (file.name) {
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
  goToRound(Number(event.target.value));
});

$('round').addEventListener('scroll', event => {
  const panel = event.currentTarget;
  for (const [index, group] of Array.from(panel.children).entries()) {
    if (group.offsetTop > panel.scrollTop + 1) break;
    selectedRound = index + 1;
  }
  $('round-picker').value = selectedRound;
});

$('season-board').addEventListener('click', event => {
  const link = event.target.closest('[data-round]');
  if (!link) return;
  event.preventDefault();
  const fixture = $('round').querySelector(`[data-fixture="${link.dataset.fixture}"]`);
  if (!fixture) return;
  fixture.open = true;
  goToRound(Number(link.dataset.round));
  fixture.querySelector('summary').focus();
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
  $('lineup-title').textContent = button.dataset.lineup === state.user.id
    ? 'La tua lista' : state.users.find(user => user.id === button.dataset.lineup)?.name || 'Lista avversario';
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
$('lineup-reader').addEventListener('close', event => {
  if (!event.currentTarget.open) lineupRequest?.abort();
});

request('league').then(data => {
  state = data;
  render();
}).catch(() => {
  $('season-actions').textContent = 'Campionato non disponibile. Ricarica la pagina per riprovare.';
});
