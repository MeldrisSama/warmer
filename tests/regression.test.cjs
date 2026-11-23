'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const { cp, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } = require('node:fs/promises');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
const php = process.env.PHP_BINARY || 'php';
const password = 'test-password-123';

test('Regression suite with an isolated PHP application', { timeout: 60000 }, async t => {
  const probe = spawnSync(php, ['-r', 'exit(PHP_VERSION_ID >= 80100 && extension_loaded("pdo_sqlite") ? 0 : 1);'], { encoding: 'utf8' });
  assert.equal(probe.status, 0, `PHP 8.1+ with pdo_sqlite is required. Set PHP_BINARY if needed. ${probe.error?.message || probe.stderr}`);

  const directory = await mkdtemp(join(tmpdir(), 'warmer-tests-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const closed = once(server, 'close');
      server.kill();
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  });

  await t.test('PHP and JavaScript sources pass syntax checks', () => {
    for (const file of ['index.php', 'assets.php', 'builder-sync.php', 'service-worker.php', 'api.php', 'https.php', 'storage.php', 'league.php', 'league-roster.php', 'mail-model.php', 'mail-delivery.php', 'mail-worker.php', 'builder-model.php', 'campionato.php', 'router.php', 'config.php', '../tests/storage.php', '../tests/transport-router.php']) {
      const result = spawnSync(php, ['-l', join(root, 'Cangiolone.com', file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    for (const file of ['app.js', 'sync-icons.js', 'offline.js', 'standings.js', 'statistics.js', 'campionato.js', 'builder.js', 'builder-workbench.js', 'builder-engine.js', 'theme.js']) {
      const result = spawnSync(process.execPath, ['--check', join(root, 'Cangiolone.com', file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  });

  await t.test('Storage persists typed data, rolls back failures and safely reads wiki settings', () => {
    const result = spawnSync(php, [join(__dirname, 'storage.php'), directory], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  await t.test('Standings count results, exclude cancelled matches and rank ties', async () => {
    const main = { innerHTML: '' };
    const context = vm.createContext({
      document: { querySelector: selector => selector === '#main' ? main : null, querySelectorAll: () => [] },
      window: { addEventListener() {} },
      // Leave the initial HTTP refresh pending; supply state explicitly below.
      fetch: () => new Promise(() => {})
    });
    for (const file of ['standings.js', 'statistics.js', 'app.js']) {
      vm.runInContext(await readFile(join(root, 'Cangiolone.com', file), 'utf8'), context);
    }
    const users = ['Alice', 'Bob', 'Carlo', 'Dana'].map(name => ({ id: name, name }));
    function standings(matches) {
      context.fixture = {
        user: { id: 'viewer', admin: false }, users, leagues: [],
        matches: matches.map((match, index) => ({ id: `match-${index}`, date: '2020-01-01', created: '2020-01-01T12:00:00+01:00', ...match }))
      };
      vm.runInContext('state = fixture; standings();', context);
      const body = main.innerHTML.split('<tbody>')[1].split('</tbody>')[0];
      return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(row =>
        [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1].replace(/<[^>]*>/g, '').trim())
      );
    }
    assert.deepEqual(standings([
      { a: 'Alice', b: 'Bob', scoreA: 80, scoreB: 50 },
      { a: 'Bob', b: 'Carlo', scoreA: 30, scoreB: 30 },
      { a: 'Carlo', b: 'Alice', scoreA: 60, scoreB: 20 },
      { a: 'Bob', b: 'Alice', scoreA: 100, scoreB: 0, void: true }
    ]), [
      ['1', 'Carlo', '2', '1', '1', '0', '+40', '4'],
      ['2', 'Alice', '2', '1', '0', '1', '-10', '3'],
      ['3', 'Bob', '2', '0', '1', '1', '-30', '1'],
      ['4', 'Dana', '0', '0', '0', '0', '0', '0']
    ]);
    assert.deepEqual(standings([]).map(row => row.slice(0, 2)), [
      ['1', 'Alice'], ['1', 'Bob'], ['1', 'Carlo'], ['1', 'Dana']
    ]);
    users[0].name = '<img src=x onerror=alert(1)>';
    standings([]);
    assert.ok(main.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!main.innerHTML.includes('<img src=x'));

    const banner = (leagues, admin = false) => {
      context.fixture.leagues = leagues;
      context.fixture.user.admin = admin;
      return vm.runInContext('leagueBanner()', context);
    };
    assert.equal(banner([]), '');
    assert.match(banner([], true), /Organizza il campionato/);
    const open = { id: 'open', name: '<War in Heaven>', entrants: 8 };
    assert.match(banner([open]), /&lt;War in Heaven&gt;/);
    assert.match(banner([open]), /Iscrizioni aperte/);
    assert.match(banner([open]), /Iscriviti al campionato/);
    const first = { id: 'first', name: 'Prima', start: '2026-11-16', entrants: 7, joined: true };
    const second = { id: 'second', name: 'Seconda', start: '2026-11-16', entrants: 2, joined: true };
    const closed = { id: 'closed', name: 'Archivio', closed: '2026-11-16', entrants: 9, joined: true };
    const paused = { id: 'paused', name: 'Sospeso', paused: '2026-11-16', start: '2026-11-16', entrants: 9, joined: true };
    assert.match(banner([open, paused, first, second, closed]), /campionato.php\?id=first/);
    assert.match(banner([closed], true), /campionato.php\?new=1/);
    banner([open, first, paused, closed], true);
    vm.runInContext('leaguesPage()', context);
    for (const label of ['In corso', 'Da iniziare', 'In pausa', 'Conclusi', 'Crea campionato']) assert.ok(main.innerHTML.includes(label));
  });

  await t.test('League shows responsive tabs, opens at the current round and reads revealed lists', async () => {
    const nodes = new Map();
    const narrow = { matches: false, addEventListener(event, listener) { this[event] = listener; } };
    const context = vm.createContext({
      document: {
        getElementById(id) {
          if (!nodes.has(id)) nodes.set(id, {
            offsetTop: id === 'giornata-2' ? 180 : 0,
            innerHTML: '',
            insertAdjacentHTML(position, html) { assert.equal(position, 'beforeend'); this.innerHTML += html; },
            events: {},
            attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            getAttribute(name) { return this.attributes[name]; },
            removeAttribute(name) { delete this.attributes[name]; },
            focus() { this.focused = true; },
            addEventListener(name, listener) { this.events[name] = listener; },
            replaceChildren() { this.innerHTML = ''; },
            showModal() { this.open = true; }
          });
          return nodes.get(id);
        },
        addEventListener() {}
      },
      window: { location: { search: '' } },
      URLSearchParams,
      matchMedia: () => narrow,
      AbortController,
      fetch: url => url.includes('leagueDownload')
        ? Promise.resolve({ ok: true, text: async () => '<img src=x>\nArmy' })
        : new Promise(() => {})
    });
    for (const file of ['standings.js', 'campionato.js']) {
      vm.runInContext(await readFile(join(root, 'Cangiolone.com', file), 'utf8'), context);
    }
    const first = { id: 'one', round: 1, a: 'alice', b: 'bob', result: null, lineups: null };
    context.demo = {
      league: { name: 'Test', start: '2020-01-01' },
      players: ['alice', 'bob'],
      user: { id: 'viewer' },
      users: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }],
      armyGroups: { Xenos: { orks: 'Orks' }, 'Adeptus Astartes': { dark_angels: 'Dark Angels' } },
      armies: { alice: 'orks', bob: 'dark_angels' },
      fixtures: [first, { ...first, id: 'two', round: 2 }]
    };
    vm.runInContext('state = demo; render();', context);
    assert.equal(nodes.get('season-title').textContent, 'Test');
    assert.equal(nodes.get('season-actions').innerHTML, '');
    assert.match(nodes.get('round-picker').innerHTML, /1 · corrente/);
    assert.match(nodes.get('round').innerHTML, /id="giornata-2"/);
    assert.doesNotMatch(nodes.get('league-standings').innerHTML, /podium-1/);
    assert.doesNotMatch(nodes.get('round').innerHTML, /<time/);
    assert.match(nodes.get('league-standings').innerHTML, /Orks/);
    assert.match(nodes.get('round').innerHTML, /Dark Angels/);
    first.result = { scoreA: 45, scoreB: 32, date: '2026-11-16' };
    vm.runInContext('render();', context);
    assert.match(nodes.get('round-picker').innerHTML, /2 · corrente/);
    assert.match(nodes.get('round').innerHTML, /<time datetime="2026-11-16">/);
    assert.match(nodes.get('league-standings').innerHTML, /podium-1/);
    assert.match(nodes.get('league-standings').innerHTML, /podium-2/);

    vm.runInContext('selectedRound = undefined; render();', context);
    assert.equal(nodes.get('round-picker').value, 2);
    assert.equal(nodes.get('round').scrollTop, 180);
    assert.equal(nodes.get('league-tabs').hidden, true);
    assert.equal(nodes.get('giornate').hidden, false);
    assert.equal(nodes.get('classifica').hidden, false);

    narrow.matches = true;
    narrow.change();
    assert.equal(nodes.get('league-tabs').hidden, false);
    assert.equal(nodes.get('classifica').hidden, false);
    assert.equal(nodes.get('giornate').hidden, true);
    assert.equal(nodes.get('tab-classifica').attributes['aria-selected'], 'true');
    const tabs = nodes.get('league-tabs');
    tabs.events.keydown({
      key: 'ArrowRight',
      target: { closest: () => nodes.get('tab-classifica') },
      preventDefault() {}
    });
    assert.equal(nodes.get('classifica').hidden, true);
    assert.equal(nodes.get('giornate').hidden, false);
    assert.equal(nodes.get('tab-giornate').focused, true);
    assert.equal(nodes.get('round').scrollTop, 180);
    narrow.matches = false;
    narrow.change();
    assert.equal(nodes.get('league-tabs').hidden, true);
    assert.equal(nodes.get('classifica').hidden, false);
    assert.equal(nodes.get('giornate').hidden, false);
    nodes.get('round-picker').events.change({ target: { value: '1' } });
    assert.equal(nodes.get('round').scrollTop, 0);
    assert.match(nodes.get('round').innerHTML, /id="giornata-2"/);

    await nodes.get('round').events.click({ target: { closest: () => ({
      dataset: { lineup: 'alice' },
      closest: () => ({ dataset: { fixture: 'one' } })
    }) } });
    assert.equal(nodes.get('lineup-reader').open, true);
    assert.equal(nodes.get('lineup-text').textContent, '<img src=x>\nArmy');
    assert.equal(nodes.get('lineup-text').innerHTML, '');
    context.demo.user.admin = true;
    vm.runInContext('render();', context);
    assert.match(nodes.get('season-actions').innerHTML, /Metti in pausa/);
    context.demo.league.paused = '2026-11-16';
    vm.runInContext('render();', context);
    assert.match(nodes.get('season-actions').innerHTML, /Riprendi campionato/);
    assert.match(nodes.get('season-board').innerHTML, /Campionato in pausa/);
    context.demo.league.paused = null;
    context.demo.league.closed = '2026-11-16';
    vm.runInContext('render();', context);
    assert.match(nodes.get('season-actions').innerHTML, /Riapri campionato/);
    context.demo.league.closed=null;context.demo.league.joined=true;
    context.demo.rosters={settings:{rosterLimit:3000,matchLimit:2000,windowOpen:true},versions:[],submitted:[]};
    vm.runInContext('renderRoster();',context);
    assert.match(nodes.get('roster-panel').innerHTML,/Equipaggiamenti con costo extra/);
    assert.match(nodes.get('roster-panel').innerHTML,/Due opzioni da 15 costano 15/);
    assert.match(nodes.get('roster-panel').innerHTML,/Chiudi finestra roster/);
    const privateFixture={...first,lineups:{mine:false,opponent:false}};
    context.privateFixture=privateFixture;
    const rosterLineup=vm.runInContext('listPanel(privateFixture)',context);
    assert.doesNotMatch(rosterLineup,/<textarea|type="file"/);
    context.demo.rosters.settings.windowOpen=false;
    vm.runInContext('renderRoster();',context);
    assert.doesNotMatch(nodes.get('roster-panel').innerHTML,/class="roster-form"/);
    assert.match(nodes.get('roster-panel').innerHTML,/Apri finestra roster/);
    context.demo.league.start=null;context.demo.league.joined=false;context.demo.user.admin=false;
    vm.runInContext('renderOverview(0, undefined);',context);
    assert.match(nodes.get('season-actions').innerHTML,/class="army-signup roster-form"/);
    assert.match(nodes.get('season-actions').innerHTML,/name="builderArmyId" required/);
    assert.match(nodes.get('season-actions').innerHTML,/Conferma iscrizione e roster/);
    assert.match(nodes.get('season-actions').innerHTML,/data-roster-options/);
    context.demo.rosters.settings=null;
    vm.runInContext('renderOverview(0, undefined);',context);
    assert.doesNotMatch(nodes.get('season-actions').innerHTML,/name="builderArmyId"/);
  });

  const application = join(directory, 'app');
  await mkdir(application);
  await mkdir(join(directory, 'sessions'));
  for (const file of ['index.php', 'assets.php', 'api.php', 'https.php', 'storage.php', 'league.php', 'league-roster.php', 'mail-model.php', 'mail-delivery.php', 'mail-worker.php', 'builder-model.php', 'campionato.php', 'router.php', 'app.js', 'sync-icons.js', 'sync-icons.css', 'style.css', 'standings.js', 'statistics.js', 'campionato.js', 'campionato.css', 'theme.js', 'theme.css', 'builder.js', 'builder-engine.js', 'builder-workbench.js', 'builder.css', 'web.config']) {
    await copyFile(join(root, 'Cangiolone.com', file), join(application, file));
  }
  await cp(join(root,'Cangiolone.com/assets'),join(application,'assets'),{recursive:true});
  await copyFile(join(root,'Cangiolone.com/service-worker.php'),join(application,'service-worker.php'));
  await copyFile(join(root,'Cangiolone.com/manifest.webmanifest'),join(application,'manifest.webmanifest'));
  await copyFile(join(root, 'Cangiolone.com/builder-sync.php'), join(application, 'builder-sync.php'));
  await copyFile(join(root, 'Cangiolone.com/offline.js'), join(application, 'offline.js'));
  await copyFile(join(root, 'Cangiolone.com/builder-v2.php'), join(application, 'builder-v2.php'));
  await copyFile(join(root, 'Cangiolone.com/builder-automation.php'), join(application, 'builder-automation.php'));
  await copyFile(join(root, 'Cangiolone.com/builder-loadout-rules.php'), join(application, 'builder-loadout-rules.php'));
  await copyFile(join(root, 'Cangiolone.com/builder-source-fixes.php'), join(application, 'builder-source-fixes.php'));
  await copyFile(join(root, 'Cangiolone.com/builder-rule-parameters.json'), join(application, 'builder-rule-parameters.json'));
  const setupCode = 'isolated-test-setup';
  const hash = createHash('sha256').update(setupCode).digest('hex');
  // Never copy the deployed configuration or existing uploads into the test app.
  await writeFile(join(application, 'config.php'), `<?php return ['setup_hash'=>'${hash}','database'=>['driver'=>'sqlite','path'=>__DIR__.'/api.sqlite']];`);

  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  delete env.PHP_CLI_SERVER_WORKERS;
  server = spawn(php, ['-d', `session.save_path="${join(directory, 'sessions').replaceAll('\\', '/')}"`, '-S', `127.0.0.1:${port}`, '-t', application, join(__dirname, 'transport-router.php')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let serverLog = '';
  server.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-8000); });
  server.on('error', error => { serverLog += error.message; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${base}/index.php`, { signal: AbortSignal.timeout(1000) });
      ready = response.ok;
      await response.text();
      if (ready) break;
    } catch {}
    if (server.exitCode !== null) break;
    await delay(50);
  }
  assert.ok(ready, `PHP server did not start: ${serverLog}`);

  await t.test('HTTP pages redirect to the canonical HTTPS URL', async () => {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${base}/transport/plain/index.php?next=partita`, {
        method, redirect: 'manual', headers: { Host: 'untrusted.example', 'X-Forwarded-Proto': 'https' }
      });
      await response.text();
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('location'), 'https://cangiolone.com/warmer/index.php?next=partita');
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });

  await t.test('HTTP login requests are rejected before a session is created', async () => {
    const response = await fetch(`${base}/transport/plain/api.php?action=login`, {
      method: 'POST', body: JSON.stringify({ username: 'alice', password }),
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, redirect: 'manual'
    });
    assert.equal(response.status, 426);
    assert.equal(typeof (await response.json()).error, 'string');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
  });

  await t.test('HTTPS requests use Secure cookies and HSTS', async () => {
    const response = await fetch(`${base}/transport/secure/api.php?action=state`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user, null);
    assert.match(response.headers.get('set-cookie'), /; secure/i);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  });

  function client() {
    let cookie = '';
    let csrf;
    return async (action, data, status = 200, options = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: options.method || (data === undefined ? 'GET' : 'POST'),
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' } : {}),
          ...options.headers
        },
        body: data === undefined ? undefined : options.rawBody ?? JSON.stringify(data),
        signal: AbortSignal.timeout(5000)
      });
      for (const value of response.headers.getSetCookie()) {
        if (value.startsWith('sector_session=')) cookie = value.split(';')[0];
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const text = bytes.toString();
      assert.equal(response.status, status, `${action}: ${text}`);
      const contentType = response.headers.get('content-type') || '';
      const value = contentType.startsWith('image/') ? bytes : contentType.startsWith('application/json') ? JSON.parse(text) : text;
      if (value.csrf) csrf = value.csrf;
      if (status >= 400) assert.equal(typeof value.error, 'string');
      return value;
    };
  }

  const admin = client();
  const alice = client();
  const bob = client();
  const guest = client();
  let adminId, aliceId, bobId, matchId, photoPath, photoUrl;
  const state = () => admin('state');
  const match = overrides => ({ a: aliceId, b: bobId, scoreA: 80, scoreB: 50, date: '2020-01-01', mission: 'Test mission', request: randomUUID(), ...overrides });
  const registration = (username, code) => ({ username, name: username, password, code });
  function sql(statement) {
    const result = spawnSync(php, ['-r', '$pdo=new PDO("sqlite:".$argv[1]);if(str_starts_with($argv[2],"SELECT "))echo json_encode($pdo->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));else $pdo->exec($argv[2]);', join(application, 'api.sqlite'), statement], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout ? JSON.parse(result.stdout) : undefined;
  }

  await t.test('Appearance assets load publicly through the local router and both pages include the early theme script', async () => {
    for (const file of ['theme.js', 'theme.css', 'statistics.js']) {
      const response = await fetch(`${base}/${file}`);
      assert.equal(response.status, 200, file);
      assert.equal(await response.text(), await readFile(join(application, file), 'utf8'));
    }
    for (const file of ['index.php', 'campionato.php']) {
      const response = await fetch(`${base}/${file}`);
      const html = await response.text();
      assert.match(html, /<script src="theme\.js\?v=[a-f0-9]{64}"><\/script>/);
      assert.match(html, /href="theme\.css\?v=[a-f0-9]{64}"/);
    }
  });

  await t.test('Guests see setup state but cannot read private data or write', async () => {
    const initial = await guest('state');
    assert.equal(initial.setup, true);
    assert.equal(initial.user, null);
    assert.equal(typeof initial.csrf, 'string');
    assert.equal(initial.users, undefined);
    await guest('download&id=missing', undefined, 401);
    await guest('match', match(), 401);
    await guest('match', undefined, 405);
  });

  await t.test('CSRF and malformed JSON are rejected', async () => {
    await guest('login', {}, 403, { headers: { 'X-CSRF-Token': 'wrong' } });
    await guest('login', {}, 422, { rawBody: '{broken' });
    await guest('login', {}, 422, { rawBody: 'null' });
  });

  await t.test('Setup requires its code, strong passwords and runs only once', async () => {
    await admin('state');
    await admin('setup', registration('admin', 'wrong'), 403);
    await admin('setup', { ...registration('admin', setupCode), password: 'short' }, 422);
    await admin('setup', registration('admin', setupCode));
    const current = await state();
    adminId = current.user.id;
    assert.equal(current.user.admin, true);
    assert.equal(current.user.password, undefined);
    await admin('setup', registration('another', setupCode), 403);
  });

  await t.test('Asset URLs track content changes, preserve timestamps and keep the login valid', async () => {
    async function pages() {
      const result = {};
      for (const page of ['index.php', 'campionato.php']) {
        const response = await fetch(`${base}/${page}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('clear-site-data'), null);
        const html = await response.text();
        const urls = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(match => match[1]);
        assert.equal(urls.length, page === 'index.php' ? 13 : 5);
        result[page] = {};
        for (const url of urls) {
          const [file, query] = url.split('?');
          const content = await readFile(join(application, file));
          assert.equal(query, 'v=' + createHash('sha256').update(content).digest('hex'));
          const asset = await fetch(`${base}/${url}`);
          assert.equal(asset.status, 200, url);
          assert.deepEqual(Buffer.from(await asset.arrayBuffer()), content);
          result[page][file] = url;
        }
      }
      return result;
    }
    const initial = await state();
    const before = await pages();
    assert.deepEqual(await pages(), before);
    for (const file of ['theme.js', 'style.css']) {
      const path = join(application, file);
      const original = await readFile(path);
      const times = await stat(path);
      try {
        await writeFile(path, Buffer.concat([original, Buffer.from('\n/* updated release */\n')]));
        await utimes(path, times.atime, times.mtime);
        const after = await pages();
        for (const page of Object.keys(before)) {
          for (const asset of Object.keys(before[page])) {
            if (asset === file) assert.notEqual(after[page][asset], before[page][asset]);
            else assert.equal(after[page][asset], before[page][asset]);
          }
        }
      } finally {
        await writeFile(path, original);
        await utimes(path, times.atime, times.mtime);
      }
    }
    const current = await state();
    assert.equal(current.user.id, initial.user.id);
    assert.equal(current.csrf, initial.csrf);
    const response = await fetch(`${base}/api.php?action=state`);
    assert.match(response.headers.get('cache-control'), /\bno-store\b/);
    await response.text();
  });

  await t.test('Invites create ordinary users and cannot be reused', async () => {
    for (const [username, user] of [['alice', alice], ['bob', bob]]) {
      const invite = await admin('invite', {});
      await user('state');
      await user('register', registration(username, 'invalid'), 403);
      await user('register', registration(username, invite.code));
      const current = await user('state');
      assert.equal(current.user.admin, false);
      if (username === 'alice') aliceId = current.user.id;
      else bobId = current.user.id;
      await guest('register', registration(`${username}2`, invite.code), 403);
    }
    await alice('invite', {}, 403);
  });

  await t.test('Profile photos stay small, authenticated, owner-only and transactional',async()=>{
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await guest('avatarSave',{photo:png},401);
    await alice('avatarSave',{photo:png},403,{headers:{'X-CSRF-Token':'bad'}});
    await alice('avatarSave',{photo:png,id:bobId});
    const current=await alice('state'),url=current.user.avatar;
    assert.ok(url.startsWith('api.php?action=avatar&id='+aliceId));
    assert.equal(current.users.find(u=>u.id===bobId).avatar,undefined);
    assert.ok(!JSON.stringify(current).includes('base64'));
    await guest(url.split('action=')[1],undefined,401);
    assert.deepEqual(await bob(url.split('action=')[1]),Buffer.from(png.split(',')[1],'base64'));
    await alice('avatar&id[]=bad',undefined,404);
    await alice('avatar&id=../../config.php',undefined,404);
    for(const photo of [42,'','data:image/svg+xml;base64,PHN2Zy8+','data:image/jpeg;base64,'+png.split(',')[1],'data:image/png;base64,aGVsbG8=','data:image/png;base64,'+'a'.repeat(66000)])await alice('avatarSave',{photo},422);
    const large=Buffer.from(png.split(',')[1],'base64');large.writeUInt32BE(257,16);
    await alice('avatarSave',{photo:'data:image/png;base64,'+large.toString('base64')},422);
    await alice('avatarSave',{},422);
    assert.equal((await alice('state')).user.avatar,url);
    sql("CREATE TRIGGER reject_avatar BEFORE UPDATE ON w40k_users BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    try{await alice('avatarSave',{photo:null},503);assert.equal((await alice('state')).user.avatar,url);}finally{sql('DROP TRIGGER reject_avatar');}
    await alice('avatarSave',{photo:null});
    assert.equal((await alice('state')).user.avatar,undefined);
    await bob(url.split('action=')[1],undefined,404);
  });

  await t.test('Builder archive persists dates, historical catalogs and owner isolation over HTTP', async () => {
    await guest('builderArmies', undefined, 401);
    const catalog=JSON.parse(await readFile(join(__dirname,'workbench-fixture.json'),'utf8'));
    const first=await admin('builderImport',{catalog});
    const data={schemaVersion:2,edition:'11',catalogId:first.catalogId,name:'Archive test',factionId:'test',limit:2000,dpLimit:3,detachmentIds:[],disposition:'',entries:[]};
    const saved=(await alice('builderSave',data)).army;
    assert.ok(saved.created);
    const presetEntry={entryId:'default_squad',unitId:'squad',models:5,weaponCounts:{'1':5},enhancementIds:[],attachedTo:null};
    await guest('builderDefaults',undefined,401);
    await alice('builderDefaultSave',{unitId:'squad',catalogId:first.catalogId,factionId:'test',entry:presetEntry});
    assert.equal((await alice('builderDefaults')).defaults.length,1);
    assert.deepEqual((await bob('builderDefaults')).defaults,[]);
    await bob('builderDefaultDelete',{unitId:'squad'});
    assert.equal((await alice('builderDefaults')).defaults.length,1);
    await alice('builderDefaultDelete',{unitId:'squad'});
    const changed=(await alice('builderSave',{...saved,name:'Renamed',created:'1900-01-01'})).army;
    assert.equal(changed.created,saved.created);
    assert.ok(changed.updated);
    const supportDraft=await alice('builderSave',{...changed,entries:[{entryId:'support_one',unitId:'support',models:1,weaponCounts:{},enhancementIds:[],attachedTo:null}]});
    assert.equal(supportDraft.validation.errors.length,1);
    assert.match(supportDraft.validation.errors[0],/Support/);
    const active=await admin('builderImport',{catalog:{...catalog,version:'second version'}});
    const armies=(await alice('builderArmies')).armies;
    assert.equal(armies.length,1);
    assert.equal(armies[0].factionName,catalog.factions[0].name);
    assert.equal(armies[0].catalogId,first.catalogId);
    assert.equal((await alice('builderCatalog&edition=11')).catalog.catalogId,active.catalogId);
    assert.equal((await alice('builderCatalog&edition=11&catalogId='+first.catalogId)).catalog.version,catalog.version);
    assert.deepEqual((await bob('builderArmies')).armies,[]);
    await bob('builderSave',saved,422);
    await bob('builderDelete',{id:saved.id},422);
    // Simulate a stored list from before creation dates existed.
    sql(`UPDATE w40k_builder_armies SET payload=json_remove(payload,'$.created') WHERE id='${saved.id}'`);
    assert.equal((await alice('builderArmies')).armies[0].created,null);
    assert.equal((await alice('builderSave',changed)).army.created,null);
    await alice('builderDelete',{id:saved.id});
    assert.deepEqual((await alice('builderArmies')).armies,[]);
  });

  await t.test('PWA endpoints keep authentication, CSRF and explicit conflict resolution', async()=>{
    const {catalog}=await alice('builderCatalog&edition=11');
    const metadata=await alice('builderCatalog&edition=11&metadata=1');assert.equal(metadata.catalog.catalogId,catalog.catalogId);assert.match(metadata.catalog.revision,/^[a-f0-9]{64}$/);assert.equal(metadata.catalog.units,undefined);
    const data={id:'offline_http',schemaVersion:2,edition:'11',catalogId:catalog.catalogId,name:'HTTP offline',factionId:'test',limit:2000,dpLimit:3,detachmentIds:[],disposition:'',entries:[]};
    const request={id:data.id,army:data,baseRevision:null,operationId:'http_first'};
    await guest('builderSync',request,401);
    await alice('builderSync',request,403,{headers:{'X-CSRF-Token':'invalid'}});
    await alice('builderSync',undefined,405);
    await alice('builderArmies&offlineOwner='+bobId,undefined,401);
    const saved=await alice('builderSync',{...request,offlineOwner:aliceId});
    assert.match(saved.army.revision,/^[a-f0-9]{64}$/);
    await bob('builderSync',request,422);
    const online=await alice('builderSave',{...saved.army,name:'HTTP online'});
    const conflict=await alice('builderSync',{...request,baseRevision:saved.army.revision,army:{...saved.army,name:'HTTP local'},operationId:'http_second'});
    assert.equal(conflict.conflict,true);assert.equal(conflict.remote.name,online.army.name);
    const keep=await alice('builderSync',{...request,baseRevision:conflict.revision,army:{...saved.army,name:'HTTP local'},operationId:'http_second'});
    assert.equal(keep.army.name,'HTTP local');
    await alice('builderSync',{id:data.id,baseRevision:keep.army.revision,deleted:true});
    const worker=await fetch(base+'/service-worker.php');assert.equal(worker.status,200);assert.match(worker.headers.get('content-type'),/application\/javascript/);
    const script=await worker.text();assert.match(script,/sector-shell-/);assert.doesNotMatch(script,/['"]api\.php['"]/);
    assert.match(script,new RegExp('offline\\.js\\?v='+createHash('sha256').update(await readFile(join(application,'offline.js'))).digest('hex')));
    const manifest=await (await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./index.php#builder');
  });

  await t.test('Login rejects unknown accounts and wrong passwords as form errors; logout removes access', async () => {
    const user = client();
    await user('state');
    const wrongPassword = await user('login', { username: 'alice', password: 'wrong' }, 422);
    const unknownAccount = await user('login', { username: 'unknown@example.test', password }, 422);
    assert.deepEqual(wrongPassword, { error: 'Nome utente, email o password errati.' });
    assert.deepEqual(unknownAccount, wrongPassword);
    assert.equal((await user('state')).user, null);
    await user('login', { username: 'ALICE', password });
    assert.equal((await user('state')).user.id, aliceId);
    await user('logout', {});
    assert.equal((await user('state')).user, null);
    await user('download&id=missing', undefined, 401);
  });

  await t.test('Match validation and permissions reject invalid writes', async () => {
    for (const invalid of [
      { b: aliceId }, { b: 'unknown' }, { scoreA: -1 }, { scoreB: 101 },
      { scoreA: '80' }, { scoreB: 1.5 }, { date: '2020-02-30' },
      { date: '2999-01-01' }, { date: '1999-12-31' }, { mission: 'x'.repeat(121) }
    ]) await alice('match', match(invalid), 422);
    await alice('match', match({ a: adminId }), 403);
    assert.equal((await state()).matches.length, 0);
  });

  await t.test('A participant creates one match even if the request is retried', async () => {
    const data = match();
    await alice('match', data);
    await alice('match', data);
    const matches = (await state()).matches;
    assert.equal(matches.length, 1);
    matchId = matches[0].id;
    assert.equal(matches[0].by, aliceId);
    assert.equal(matches[0].scoreA, 80);
    assert.equal(matches[0].void, false);
    assert.equal(matches[0].leagueId, null);
  });

  await t.test('Only the author or admin can cancel and restore a match', async () => {
    await bob('void', { id: matchId, void: true }, 403);
    await alice('void', { id: matchId, void: 'true' }, 422);
    await alice('void', { id: 'missing', void: true }, 404);
    await alice('void', { id: matchId, void: true });
    assert.equal((await state()).matches[0].void, true);
    await admin('void', { id: matchId, void: false });
    const saved = (await state()).matches[0];
    assert.equal(saved.void, false);
    assert.equal(saved.updatedBy, adminId);
  });

  await t.test('Lists validate text and can be downloaded by members only', async () => {
    const list = { name: 'Army', faction: 'Orks', filename: 'army.txt', text: 'Unità\n100 punti' };
    for (const invalid of [{ filename: 'army.php' }, { text: '' }, { text: '\u0000bad' }, { text: 'x'.repeat(1048577) }]) {
      await alice('list', { ...list, ...invalid }, 422);
    }
    await alice('list', list);
    const lists = (await state()).lists;
    assert.equal(lists.length, 1);
    assert.equal(lists[0].text, undefined);
    assert.equal(lists[0].owner, aliceId);
    assert.equal(await bob(`download&id=${lists[0].id}`), list.text);
    await guest(`download&id=${lists[0].id}`, undefined, 401);
    await alice('download&id=missing', undefined, 404);
  });

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=';
  await t.test('Images validate content and persist with the match', async () => {
    for (const photo of [42, {}, 'data:image/png;base64,!!!', 'data:image/png;base64,aGVsbG8=', 'data:text/html;base64,aGVsbG8=']) {
      await alice('match', match({ photo }), 422);
    }
    await alice('match', match({ photo: png }));
    const saved = (await state()).matches.find(value => value.photo);
    photoUrl = saved.photo;
    assert.equal(photoUrl, `api.php?action=photo&id=${saved.id}`);
    photoPath = `uploads/matches/${saved.id}.png`;
    const bytes = await readFile(join(application, photoPath));
    assert.deepEqual(bytes, Buffer.from(png.split(',')[1], 'base64'));
  });

  await t.test('Rejected matches leave no orphan photo', async () => {
    const uploads = join(application, 'uploads/matches');
    const before = await readdir(uploads);
    await alice('match', match({ photo: png, mission: 'x'.repeat(121) }), 422);
    assert.deepEqual(await readdir(uploads), before);
  });

  await t.test('Failed database writes remove their new photo', async () => {
    const uploads = join(application, 'uploads/matches');
    const before = await readdir(uploads);
    const count = (await state()).matches.length;
    sql("CREATE TRIGGER reject_match BEFORE INSERT ON w40k_matches BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    try {
      await alice('match', match({ photo: png }), 503);
      assert.deepEqual(await readdir(uploads), before);
      assert.equal((await state()).matches.length, count);
    } finally {
      sql('DROP TRIGGER reject_match');
    }
    await alice('match', match({ photo: png }));
    assert.equal((await state()).matches.length, count + 1);
  });

  await t.test('Photo downloads require authentication and preserve existing file paths', async () => {
    const action = photoUrl.split('action=')[1];
    await guest(action, undefined, 401);
    const photo = await bob(action);
    assert.deepEqual(photo, Buffer.from(png.split(',')[1], 'base64'));
    await alice(`photo&id=${matchId}`, undefined, 404);
    await alice('photo&id=missing', undefined, 404);
    await alice('photo&id[]=invalid', undefined, 404);
    await alice('photo&id=../../config.php', undefined, 404);
  });

  await t.test('League registration, blind list exchange and opponent-confirmed results', async t => {
    assert.equal((await state()).league, null);
    await guest('league', undefined, 401);
    await alice('leagueOpen', { name: 'Test' }, 403);
    const firstLeague = (await admin('leagueOpen', { name: 'Stagione di prova' })).id;
    assert.equal((await alice('state')).league.joined, false);
    await admin('leagueStart', {}, 422);
    await alice('leagueJoin', {}, 422);
    await alice('leagueJoin', { army: 'nonexistent' }, 422);
    await alice('leagueJoin', { army: ['orks'] }, 422);
    for (const account of [alice, bob, admin]) await account('leagueJoin', { army: 'orks' });
    await alice('leagueJoin', {});
    await alice('leagueJoin', { army: 'necrons' });
    const enrolled = await alice('league');
    assert.equal(enrolled.armies[aliceId], 'orks');
    assert.deepEqual(Object.keys(enrolled.armyGroups), ['Xenos', 'Chaos', 'Imperium', 'Adeptus Astartes']);
    assert.equal(Object.keys(Object.assign({}, ...Object.values(enrolled.armyGroups))).length, 34);
    assert.equal((await alice('state')).league.joined, true);
    await alice('leagueStart', {}, 403);
    await admin('leagueStart', {});
    await admin('leagueStart', {}, 409);

    const spectator = client();
    const invite = await admin('invite', {});
    await spectator('state');
    await spectator('register', registration('spectator', invite.code));
    await spectator('state');
    await spectator('leagueJoin', {}, 409);
    const schedule = (await spectator('league')).fixtures;
    assert.equal(schedule.length, 6);
    assert.equal(new Set(schedule.filter(fixture => fixture.b === null).map(fixture => fixture.a)).size, 3);
    assert.equal(new Set(schedule.filter(fixture => fixture.b).map(fixture => [fixture.a, fixture.b].sort().join())).size, 3);
    const { id } = schedule.find(fixture => [fixture.a, fixture.b].includes(aliceId) && [fixture.a, fixture.b].includes(bobId));
    const fixtureFor = async account => (await account('league&id=' + firstLeague)).fixtures.find(fixture => fixture.id === id);
    const list = text => ({ fixture: id, filename: 'army.txt', text });
    const download = owner => 'leagueDownload&fixture=' + id + '&player=' + owner;
    await spectator('leagueLineup', list('Army'), 403);
    await admin('leagueLineup', list('Army'), 403);
    await alice('leagueLineup', { ...list('abc'), filename: 'army.docx' }, 422);
    await alice('leagueLineup', { fixture: id, text: '\u0000Not valid' }, 422);
    await alice('leagueLineup', { fixture: id, text: '  \n  ' }, 422);
    await alice('leagueLineup', list('Army A draft'));
    const builderCatalog=(await alice('builderCatalog&edition=11')).catalog;
    const savedBuilderArmy=(await alice('builderSave',{edition:'11',catalogId:builderCatalog.catalogId,name:'Army A final',factionId:'test',limit:2000,detachmentIds:[],disposition:'',entries:[{entryId:'league_squad',unitId:'squad',models:5,weaponCounts:{'1':5},enhancementIds:[],attachedTo:null}]})).army;
    const frozenBuilderText=(await alice('builderArmyText&id='+savedBuilderArmy.id)).text;
    assert.match(frozenBuilderText,/Squadra test/);
    await bob('builderArmyText&id='+savedBuilderArmy.id,undefined,422);
    await guest('builderArmyText&id='+savedBuilderArmy.id,undefined,401);
    await bob('leagueLineup',{fixture:id,builderArmyId:savedBuilderArmy.id,text:''},422);
    await alice('leagueLineup',{fixture:id,builderArmyId:savedBuilderArmy.id,text:'Mixed sources'},422);
    await alice('leagueLineup',{fixture:id,builderArmyId:savedBuilderArmy.id,text:''});
    await alice('builderSave',{...savedBuilderArmy,name:'Changed after submission'});
    assert.deepEqual((await bob('league')).fixtures.find(fixture => fixture.id === id).lineups, { mine: false, opponent: true });
    assert.equal((await fixtureFor(spectator)).lineups, null);
    assert.ok(!JSON.stringify(await bob('league')).includes('Army A final'));
    assert.ok(!JSON.stringify(await state()).includes('Army A final'));
    await bob(download(aliceId), undefined, 403);
    await alice(download(aliceId), undefined, 403);
    await spectator(download(aliceId), undefined, 403);
    assert.equal((await fixtureFor(spectator)).listsReadable, false);
    await bob('leagueLineup', list('Army B'));
    assert.equal(await bob(download(aliceId)), frozenBuilderText);
    await alice('builderDelete',{id:savedBuilderArmy.id});
    assert.equal(await bob(download(aliceId)), frozenBuilderText);
    assert.equal(await alice(download(bobId)), 'Army B');
    assert.equal(await spectator(download(aliceId)), frozenBuilderText);
    assert.equal((await fixtureFor(spectator)).listsReadable, true);
    assert.equal((await spectator('state')).readableLists.some(list=>list.fixture===id),false);
    await spectator('leagueDownload&fixture='+id+'&player=unknown',undefined,404);
    await guest(download(aliceId), undefined, 401);
    await alice('leagueLineup', list('Changed after reveal'), 409);

    const originalMatches = (await state()).matches.length;
    const score = { fixture: id, scoreA: 67, scoreB: 53, date: '2020-01-01', mission: 'Bastione' };
    await spectator('leaguePropose', score, 403);
    await alice('leaguePropose', { ...score, date: '2999-01-01' }, 422);
    await alice('leaguePropose', score);
    await alice('leaguePhoto',{fixture:id,photo:png},409);
    const first = (await fixtureFor(bob)).pending.token;
    assert.equal((await state()).matches.length, originalMatches);
    assert.equal((await fixtureFor(spectator)).pending, null);
    assert.equal((await fixtureFor(spectator)).awaiting, true);
    await alice('leagueConfirm', { fixture: id, proposal: first }, 403);
    await bob('leagueReject', { fixture: id, proposal: first });
    await alice('leaguePropose', score);
    await bob('leagueConfirm', { fixture: id, proposal: first }, 409);
    const second = (await fixtureFor(bob)).pending.token;
    sql("CREATE TRIGGER reject_confirmation BEFORE UPDATE ON w40k_league_fixtures WHEN NEW.match_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    try {
      await bob('leagueConfirm', { fixture: id, proposal: second }, 503);
      assert.equal((await state()).matches.length, originalMatches);
      assert.equal((await fixtureFor(bob)).pending.token, second);
    } finally {
      sql('DROP TRIGGER reject_confirmation');
    }
    await bob('leagueConfirm', { fixture: id, proposal: second });
    await bob('leagueConfirm', { fixture: id, proposal: second }, 409);
    assert.equal((await state()).matches.length, originalMatches + 1);
    const confirmed = (await fixtureFor(spectator)).result;
    assert.equal(confirmed.scoreA, 67);
    assert.equal(confirmed.scoreB, 53);
    assert.equal(confirmed.date, score.date);
    assert.equal(confirmed.void, false);
    const saved = (await state()).matches.find(match => match.request === 'league:' + id);
    assert.equal(saved.leagueId, firstLeague);
    await t.test('League participants attach and replace photos atomically; observers can only view them',async()=>{
      const data={fixture:id,league:firstLeague,photo:png};
      await spectator('leaguePhoto',data,403);
      await guest('leaguePhoto',data,401);
      await alice('leaguePhoto',{...data,league:'0'.repeat(24)},404);
      for(const photo of [null,42,'','data:image/png;base64,aGVsbG8='])await alice('leaguePhoto',{...data,photo},422);
      const uploads=join(application,'uploads/matches');
      await alice('leaguePhoto',data);
      let stored=sql(`SELECT photo FROM w40k_matches WHERE id='${saved.id}'`)[0].photo;
      const firstPath=stored;
      assert.deepEqual(await readFile(join(application,stored)),Buffer.from(png.split(',')[1],'base64'));
      const photoAction='photo&id='+saved.id;
      assert.equal((await fixtureFor(spectator)).result.photo,'api.php?action='+photoAction);
      assert.deepEqual(Buffer.from(await spectator(photoAction)),Buffer.from(png.split(',')[1],'base64'));
      await guest(photoAction,undefined,401);
      const before=await readdir(uploads);
      sql("CREATE TRIGGER reject_league_photo BEFORE UPDATE ON w40k_matches BEGIN SELECT RAISE(ABORT, 'test failure'); END");
      try {
        await bob('leaguePhoto',data,503);
        assert.deepEqual(await readdir(uploads),before);
        assert.equal(sql(`SELECT photo FROM w40k_matches WHERE id='${saved.id}'`)[0].photo,stored);
        assert.deepEqual(await readFile(join(application,stored)),Buffer.from(png.split(',')[1],'base64'));
      }finally{sql('DROP TRIGGER reject_league_photo');}
      await bob('leaguePhoto',data);
      stored=sql(`SELECT photo FROM w40k_matches WHERE id='${saved.id}'`)[0].photo;
      assert.notEqual(stored,firstPath);
      assert.ok(!(await readdir(uploads)).includes(firstPath.split('/').at(-1)));
      assert.ok((await state()).matches.find(match=>match.id===saved.id).photo);
      const unchanged=(await state()).matches.find(match=>match.id===saved.id);
      assert.equal(unchanged.scoreA,saved.scoreA);assert.equal(unchanged.scoreB,saved.scoreB);
      assert.equal(unchanged.date,saved.date);assert.equal(unchanged.by,saved.by);
    });
    const publicLists=(await spectator('state')).readableLists.filter(list=>list.fixture===id);
    assert.equal(publicLists.length,2);
    assert.ok(publicLists.every(list=>list.match===saved.id));
    assert.ok(publicLists.every(list=>!('text' in list)));
    assert.equal(await spectator(download(bobId)),'Army B');
    await admin('void', { id: saved.id, void: true });
    await alice('leaguePhoto',{fixture:id,photo:png},409);
    assert.equal((await fixtureFor(spectator)).result.void, true);
    assert.equal((await spectator('state')).readableLists.some(list=>list.fixture===id),false);
    await admin('void', { id: saved.id, void: false });

    const secondLeague = (await admin('leagueOpen', { name: 'Girone parallelo' })).id;
    await alice('leagueJoin', { league: secondLeague, army: 'dark_angels' });
    await bob('leagueJoin', { league: secondLeague, army: 'blood_angels' });
    assert.equal((await alice('league&id=' + secondLeague)).armies[aliceId], 'dark_angels');
    assert.equal((await alice('league&id=' + firstLeague)).armies[aliceId], 'orks');
    await admin('leagueStart', { league: secondLeague });
    const parallel = await alice('league&id=' + secondLeague);
    assert.equal(parallel.league.entrants, 2);
    assert.equal(parallel.fixtures.length, 1);
    assert.equal(parallel.fixtures[0].result, null);
    assert.deepEqual(parallel.fixtures[0].lineups, { mine: false, opponent: false });
    await alice('leagueLineup', { fixture: parallel.fixtures[0].id, league: firstLeague, text: 'Wrong season' }, 404);
    await alice('leagueClose', { league: firstLeague }, 403);

    const draftRequest = { name: 'Prossimo girone', request: '2'.repeat(24) };
    const draft = (await admin('leagueOpen', draftRequest)).id;
    assert.equal((await admin('leagueOpen', draftRequest)).id, draft);
    await admin('leagueOpen', { ...draftRequest, name: 'Duplicato' }, 409);
    const summary = (await alice('state')).leagues;
    assert.equal(summary.find(league => league.id === firstLeague).entrants, 3);
    assert.equal(summary.find(league => league.id === secondLeague).joined, true);
    assert.equal(summary.find(league => league.id === draft).start, null);
    assert.equal((await admin('league&new=1')).league, null);
    await alice('league&id=unknown', undefined, 404);

    const unfinished = schedule.find(fixture => fixture.b !== null && fixture.id !== id && [fixture.a, fixture.b].includes(aliceId));
    await alice('leaguePropose', { ...score, fixture: unfinished.id, league: firstLeague });
    const pendingFixture = async () => (await alice('league&id=' + firstLeague)).fixtures.find(fixture => fixture.id === unfinished.id);
    const proposal = (await pendingFixture()).pending.token;
    await alice('leaguePause', { league: firstLeague }, 403);
    await admin('leaguePause', { league: firstLeague });
    assert.ok((await alice('league&id=' + firstLeague)).league.paused);
    assert.equal((await pendingFixture()).pending.token, proposal);
    await admin('leagueConfirm', { fixture: unfinished.id, league: firstLeague, proposal }, 409);
    await admin('void', { id: saved.id, void: true }, 409);
    assert.equal(await bob(download(aliceId)), frozenBuilderText);
    await admin('leagueResume', { league: firstLeague });
    assert.equal((await alice('league&id=' + firstLeague)).league.paused, null);
    assert.equal((await pendingFixture()).pending.token, proposal);

    await admin('leagueClose', { league: firstLeague });
    const archived = await alice('league&id=' + firstLeague);
    assert.ok(archived.league.closed);
    assert.equal(archived.fixtures.length, 6);
    assert.equal(archived.fixtures.find(fixture => fixture.id === unfinished.id).awaiting, false);
    assert.equal((await fixtureFor(spectator)).result.scoreA, 67);
    assert.equal(await bob(download(aliceId)), frozenBuilderText);
    await alice('leagueLineup', list('Archived'), 409);
    await alice('leaguePropose', { ...score, fixture: unfinished.id, league: firstLeague }, 409);
    await admin('void', { id: saved.id, void: true }, 409);
    assert.ok((await state()).matches.find(match => match.id === saved.id).leagueLocked);
    await alice('leaguePhoto',{fixture:id,photo:png});
    await alice('leaguePropose', { ...score, fixture: parallel.fixtures[0].id, league: secondLeague });
    await admin('leagueResume', { league: firstLeague }, 409);
    await alice('leagueReopen', { league: firstLeague }, 403);
    await admin('leagueReopen', { league: firstLeague });
    assert.equal((await alice('league&id=' + firstLeague)).league.closed, null);
    assert.equal((await pendingFixture()).pending.token, proposal);
    await admin('leagueConfirm', { fixture: unfinished.id, league: firstLeague, proposal });
    assert.equal((await pendingFixture()).result.scoreA, score.scoreA);

    await admin('leaguePause', { league: draft });
    await alice('leagueJoin', { league: draft }, 409);
    await admin('leagueStart', { league: draft }, 409);
    await admin('leagueResume', { league: draft });
    await alice('leagueJoin', { league: draft, army: 'orks' });
    await admin('leagueClose', { league: draft });
    await admin('leagueReopen', { league: draft });
    await bob('leagueJoin', { league: draft, army: 'orks' });
    assert.equal((await bob('league&id=' + draft)).league.start, null);


    const page = await fetch(`${base}/campionato.php`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /campionato\.css/);
    for (const asset of ['campionato.css', 'campionato.js', 'standings.js']) {
      const response = await fetch(`${base}/${asset}`);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  });

  await t.test('Raw upload URLs are blocked', async () => {
    for (const path of [photoPath, photoPath.replace('uploads', '%75ploads')]) {
      const response = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      assert.equal(response.status, 404);
    }
    const result = spawnSync(php, ['-r', '$xml=simplexml_load_file($argv[1]);exit(count($xml->xpath($argv[2]))===1?0:1);', join(application, 'web.config'), '/configuration/system.webServer/security/requestFiltering/hiddenSegments/add[@segment="uploads"]'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
  await t.test('League rosters enforce paid options, shared windows, private history and immutable deliveries', async () => {
    const fixtureResult=spawnSync(php,[join(root,'tests/league-roster-model.php')],{encoding:'utf8'});
    assert.equal(fixtureResult.status,0,fixtureResult.stdout+fixtureResult.stderr);
    const fixture=JSON.parse(fixtureResult.stdout);
    const imported=await admin('builderImport',{catalog:fixture.raw});
    const saveArmy=async(account,army)=> (await account('builderSave',{...army,catalogId:imported.catalogId})).army;
    const a=await saveArmy(alice,fixture.army),b=await saveArmy(bob,fixture.army);
    const poolDraft={...fixture.army,purpose:'pool',limit:6000,entries:fixture.army.entries.map(e=>({...e,rosterPaidOptions:fixture.reserve[e.entryId]}))};
    const pool=await saveArmy(alice,poolDraft);
    assert.equal(pool.purpose,'pool');assert.equal(pool.limit,6000);
    const savedPool=(await alice('builderArmies')).armies.find(army=>army.id===pool.id);
    assert.equal(savedPool.purpose,'pool');assert.deepEqual(savedPool.entries[0].rosterPaidOptions,fixture.reserve.copy_a);
    const poolPreview=await alice('leagueRosterPreview&id='+pool.id);
    assert.equal(poolPreview.entries[0].points,115);
    const poolLeague=(await admin('leagueOpen',{name:'Iscrizione da pool dedicato',rosterLimit:3000,matchLimit:2000})).id;
    await alice('leagueJoin',{league:poolLeague,army:'orks',builderArmyId:pool.id});
    assert.equal((await alice('league&id='+poolLeague)).rosters.versions[0].roster.points,115);
    const wrongFaction=(await admin('leagueOpen',{name:'Altra fazione',rosterLimit:3000,matchLimit:2000})).id;
    await bob('leagueJoin',{league:wrongFaction,army:'necrons',builderArmyId:b.id,paidOptions:fixture.reserve},422);
    assert.equal((await bob('league&id='+wrongFaction)).league.joined,false);
    await alice('leagueOpen',{name:'Non autorizzato',rosterLimit:3000,matchLimit:2000},403);
    await admin('leagueOpen',{name:'Limiti non validi',rosterLimit:100,matchLimit:2000},422);
    const league=(await admin('leagueOpen',{name:'Roster con riserva armi',rosterLimit:3000,matchLimit:2000})).id;
    await alice('leagueJoin',{league,army:'orks'},422);
    assert.equal((await alice('league&id='+league)).league.joined,false);
    await bob('leagueRosterPreview&id='+a.id,undefined,422);
    const preview=await alice('leagueRosterPreview&id='+a.id);
    assert.equal(preview.entries[0].options.length,3);
    const submission={league,builderArmyId:a.id,baseVersion:'',paidOptions:fixture.reserve};
    await alice('leagueJoin',{...submission,army:'orks'});
    const initial=(await alice('league&id='+league)).rosters.versions[0];
    assert.equal(initial.roster.points,115);
    // Repeated registration is idempotent, including the first roster version.
    await alice('leagueJoin',{...submission,army:'orks'});
    assert.equal((await alice('league&id='+league)).rosters.versions.length,1);
    await admin('leagueStart',{league},422);
    assert.equal((await bob('league&id='+league)).rosters.versions.length,0);
    await alice('leagueRosterSave',submission,409);
    await admin('leagueRosterSave',{...submission,builderArmyId:a.id},403);
    sql("CREATE TRIGGER reject_roster_signup BEFORE INSERT ON w40k_league_rosters BEGIN SELECT RAISE(ABORT, 'test signup failure'); END");
    await bob('leagueJoin',{...submission,army:'orks',builderArmyId:b.id},503);
    assert.equal((await bob('league&id='+league)).league.joined,false);
    assert.equal((await bob('league&id='+league)).rosters.versions.length,0);
    sql('DROP TRIGGER reject_roster_signup');
    await bob('leagueJoin',{...submission,army:'orks',builderArmyId:b.id});
    await admin('leagueStart',{league});
    const season=await alice('league&id='+league),target={league,fixture:season.fixtures[0].id};
    await alice('leaguePropose',{...target,scoreA:60,scoreB:40,date:season.today},409);
    await alice('leagueRosterSave',{...submission,baseVersion:initial.id},409);
    await alice('leagueRosterWindow',{league,open:true},403);
    await alice('leagueLineup',{...target,text:'Testo non verificabile'},422);
    await alice('leagueLineup',{...target,builderArmyId:pool.id,text:''},422);
    const equipped=await saveArmy(alice,{...fixture.both,id:a.id});
    sql("CREATE TRIGGER reject_roster_delivery BEFORE INSERT ON w40k_league_roster_lineups BEGIN SELECT RAISE(ABORT, 'test roster failure'); END");
    await alice('leagueLineup',{...target,builderArmyId:equipped.id,text:''},503);
    assert.equal((await alice('league&id='+league)).fixtures[0].lineups.mine,false);
    sql('DROP TRIGGER reject_roster_delivery');
    await alice('leagueLineup',{...target,builderArmyId:equipped.id,text:''});
    const stored=sql('SELECT roster_id,payload FROM w40k_league_roster_lineups')[0];
    assert.equal(stored.roster_id,initial.id);assert.equal(JSON.parse(stored.payload).points,130);
    await admin('leagueRosterWindow',{league,open:true});
    // Later roster versions cannot rewrite even a single previously delivered list.
    const newReserve=structuredClone(fixture.reserve);
    const heavy=preview.entries[0].options.find(option=>option.cost===25);newReserve.copy_a[heavy.id]=1;
    await alice('leagueRosterSave',{...submission,baseVersion:initial.id,paidOptions:newReserve});
    const versions=(await alice('league&id='+league)).rosters.versions;
    assert.equal(versions.length,2);assert.equal(versions[0].roster.points,125);assert.equal(versions[1].roster.points,115);
    assert.equal(sql('SELECT roster_id FROM w40k_league_roster_lineups')[0].roster_id,initial.id);
    await bob('leagueLineup',{...target,builderArmyId:b.id,text:''});
    const download='leagueDownload&fixture='+target.fixture+'&player='+aliceId;
    const frozen=await alice(download);
    await alice('leagueLineup',{...target,builderArmyId:a.id,text:''},409);
    await alice('builderDelete',{id:a.id});
    assert.equal(await bob(download),frozen);
    assert.equal((await alice('league&id='+league)).rosters.versions.length,2);
    await admin('leagueRosterWindow',{league,open:false});
    await admin('leaguePause',{league});
    await admin('leagueRosterWindow',{league,open:true},409);
    await admin('leagueResume',{league});
    await admin('leagueClose',{league});
    await admin('leagueRosterWindow',{league,open:true},409);
  });
  await t.test('Account and league email is attempted immediately and sends only once per event', async () => {
    assert.equal((await state()).mailEnabled, false);
    const privatePath = join(application, 'private');
    await mkdir(privatePath);
    const mailConfig = "<?php return ['base_url'=>'https://warmer.test/','transport'=>'capture','capture_path'=>__DIR__.'/emails.jsonl'];";
    await writeFile(join(privatePath, 'mail.php'), mailConfig);
    const forbidden = await fetch(`${base}/mail-worker.php`);
    assert.equal(forbidden.status, 410);
    const config = await fetch(`${base}/private/mail.php`);
    assert.equal(config.status, 404);
    let captured = 0;
    const drain = async () => {
      const contents = await readFile(join(privatePath, 'emails.jsonl'), 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const emails = contents.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const batch = emails.slice(captured);
      captured = emails.length;
      return batch;
    };
    const addresses = ['alice@example.test', 'bob@example.test'];
    assert.equal((await alice('state')).needsEmail, false);
    const returning = client();
    await returning('state');
    await returning('login', { username: 'alice', password });
    assert.equal((await returning('state')).needsEmail, true);
    for (const [i, account] of [alice, bob].entries()) {
      await account('emailSet', { email: addresses[i] });
      assert.equal((await account('state')).account.email, null);
    }
    assert.equal((await returning('state')).needsEmail, false);
    const verification = await drain();
    assert.deepEqual(verification.map(email => email.to).sort(), addresses);
    assert.ok(verification.every(email => email.subject === 'Conferma il tuo indirizzo email' && email.html.includes('Cronache del settore')));
    await guest('state');
    for (const email of verification) {
      const token = email.text.match(/token=([a-f0-9]{64})/)[1];
      await guest('emailVerify', { token });
      await guest('emailVerify', { token }, 410);
    }
    const aliceState = await alice('state');
    assert.equal(aliceState.account.email, addresses[0]);
    assert.ok(aliceState.users.every(user => user.email === undefined));

    await admin('leagueOpen', { name: 'Campionato senza avviso' });
    assert.deepEqual(await drain(), []);
    const { id } = await admin('leagueOpen', { name: 'Campionato email', notify: true });
    assert.deepEqual((await drain()).map(email => email.to).sort(), addresses);
    for (const account of [alice, bob]) await account('leagueJoin', { league: id, army: 'orks' });
    await alice('leagueJoin', { league: id });
    assert.ok((await drain()).every(email => email.subject === 'Iscrizione confermata'));
    await alice('leagueAnnounce', { league: id, subject: 'Avviso', message: 'Test', request: randomUUID() }, 403);
    const note = { league: id, subject: 'Avviso', message: '<script>Da leggere</script>', request: randomUUID() };
    await admin('leagueAnnounce', note);
    await admin('leagueAnnounce', note);
    const announcement = await drain();
    assert.deepEqual(announcement.map(email => email.to).sort(), addresses);
    assert.ok(announcement.every(email => email.html.includes('&lt;script&gt;') && !email.html.includes('<script>Da leggere')));
    await admin('leagueStart', { league: id });
    const { fixtures: [fixture], today } = await alice('league&id=' + id);
    const target = { fixture: fixture.id, league: id };
    await alice('leagueLineup', { ...target, text: 'Alice army' });
    assert.deepEqual(await drain(), []);
    await bob('leagueLineup', { ...target, text: 'Bob army' });
    const revealed = await drain();
    assert.deepEqual(revealed.map(email => email.to), [addresses[0]]);
    assert.match(revealed[0].text, new RegExp('fixture=' + fixture.id));
    await alice('leaguePropose', { ...target, scoreA: 60, scoreB: 43, date: today });
    const reminder = await drain();
    assert.deepEqual(reminder.map(email => email.to), [addresses[1]]);
    assert.equal(reminder[0].subject, 'Risultato da confermare');
    const pending = (await bob('league&id=' + id)).fixtures[0].pending;
    await bob('leagueConfirm', { ...target, proposal: pending.token });
    const digest = await drain();
    assert.deepEqual(digest.map(email => email.to).sort(), addresses);
    assert.ok(digest.every(email => email.html.includes('Classifica aggiornata') && email.html.includes('60 – 43')));
    assert.deepEqual(await drain(), []);

    const missing = await guest('passwordForgot', { email: 'missing@example.test' });
    const known = await guest('passwordForgot', { email: addresses[1] });
    assert.deepEqual(known, missing);
    await guest('state'); // The recovery response is flushed before delivery starts.
    const reset = await drain();
    assert.deepEqual(reset.map(email => email.to), [addresses[1]]);
    const resetToken = reset[0].text.match(/token=([a-f0-9]{64})/)[1];
    const passwordNew = 'test-new-password-123';
    await guest('passwordReset', { token: resetToken, password: passwordNew });
    await guest('passwordReset', { token: resetToken, password: passwordNew }, 410);
    assert.equal((await bob('state')).user, null);
    await bob('login', { username: 'bob', password }, 422);
    await bob('login', { username: 'bob', password: passwordNew });
    await bob('state');
    await bob('emailSet', { current: passwordNew, email: 'other@example.test' });
    const pendingVerification = (await drain())[0].text.match(/token=([a-f0-9]{64})/)[1];
    await bob('passwordChange', { current: passwordNew, password });
    await guest('emailVerify', { token: pendingVerification }, 410);
    assert.equal((await bob('state')).account.email, addresses[1]);
    assert.equal((await bob('state')).user.id, bobId);

    const { code } = await admin('invite', {});
    const codeUser = client();
    await codeUser('state');
    const registration = { code, username: 'code-user', name: 'Code User', password };
    await codeUser('register', registration, 422);
    await codeUser('register', { ...registration, email: 'code@example.test' });
    assert.deepEqual((await codeUser('state')).account, { email: null, pendingEmail: 'code@example.test' });
    const [codeVerification] = await drain();
    assert.equal(codeVerification.to, 'code@example.test');
    assert.equal(codeVerification.subject, 'Conferma il tuo indirizzo email');
    await guest('login', { username: 'code@example.test', password }, 422);
    await guest('emailVerify', { token: codeVerification.text.match(/token=([a-f0-9]{64})/)[1] });
    await guest('login', { username: 'CODE@example.test', password });

    await alice('invite', { email: 'forbidden@example.test' }, 403);
    await admin('invite', { email: addresses[0] }, 409);
    assert.deepEqual(await admin('invite', { email: 'invited@example.test' }), { ok: true });
    const [invitation] = await drain();
    assert.equal(invitation.to, 'invited@example.test');
    const [, encodedInvite] = invitation.text.match(/#invito\?token=(\S+)/);
    const inviteToken = decodeURIComponent(encodedInvite);
    const invited = client();
    await invited('state');
    const invitedRegistration = { username: 'invited-user', name: 'Invited User', password };
    await invited('register', { ...invitedRegistration, inviteToken: inviteToken.replace('invited@', 'other@') }, 403);
    await invited('register', { ...invitedRegistration, inviteToken, email: 'other@example.test' });
    assert.deepEqual((await invited('state')).account, { email: 'invited@example.test', pendingEmail: null });
    await invited('register', { username: 'other-user', name: 'Other User', password, inviteToken }, 403);
    await invited('emailSet', { email: 'other@example.test' }, 403);
    assert.deepEqual(await drain(), []);

    const finalRound = await admin('leagueOpen', { name: 'Riepilogo a fine giornata' });
    const participants = new Map();
    for (const account of [alice, bob, codeUser, invited]) {
      participants.set((await account('state')).user.id, account);
      await account('leagueJoin', { league: finalRound.id, army: 'orks' });
    }
    await drain();
    await admin('leagueStart', { league: finalRound.id });
    const season = await admin('league&id=' + finalRound.id);
    const firstRound = season.fixtures.filter(fixture => fixture.round === 1);
    assert.equal(firstRound.length, 2);
    for (const [index, fixture] of firstRound.entries()) {
      const proposer = participants.get(fixture.a);
      const opponent = participants.get(fixture.b);
      const target = { fixture: fixture.id, league: finalRound.id };
      await proposer('leaguePropose', { ...target, scoreA: 60, scoreB: 43, date: season.today });
      assert.deepEqual((await drain()).map(email => email.subject), ['Risultato da confermare']);
      const match = (await opponent('league&id=' + finalRound.id)).fixtures.find(match => match.id === fixture.id);
      await opponent('leagueConfirm', { ...target, proposal: match.pending.token });
      const reports = await drain();
      assert.equal(reports.length, index === 0 ? 0 : participants.size);
      assert.ok(reports.every(email => email.subject.startsWith('Giornata 1')));
    }

    await writeFile(join(privatePath, 'mail.php'), mailConfig.replace("'/emails.jsonl'", "'/missing-dir/emails.jsonl'"));
    const failed = await admin('invite', { email: 'failure@example.test' });
    assert.deepEqual(failed, { ok: true, mailFailed: true });
    await writeFile(join(privatePath, 'mail.php'), mailConfig);
    await admin('invite', { email: 'next@example.test' });
    assert.deepEqual((await drain()).map(email => email.to), ['next@example.test']);
  });

  await t.test('Authentication attempts are rate limited', async () => {
    const attacker = client();
    await attacker('state');
    // A successful login resets the shared loopback IP counter first.
    await attacker('login', { username: 'alice', password });
    await attacker('state');
    await attacker('logout', {});
    await attacker('state');
    for (let attempt = 0; attempt < 10; attempt++) {
      await attacker('login', { username: 'alice', password: 'wrong' }, 422);
    }
    await attacker('login', { username: 'alice', password }, 429);
  });

});
