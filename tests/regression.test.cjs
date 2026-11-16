'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } = require('node:fs/promises');
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
    for (const file of ['index.php', 'api.php', 'https.php', 'storage.php', 'league.php', 'campionato.php', 'router.php', 'config.php', '../tests/storage.php', '../tests/transport-router.php']) {
      const result = spawnSync(php, ['-l', join(root, 'Cangiolone.com', file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    for (const file of ['app.js', 'standings.js', 'campionato.js']) {
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
    for (const file of ['standings.js', 'app.js']) {
      vm.runInContext(await readFile(join(root, 'Cangiolone.com', file), 'utf8'), context);
    }
    const users = ['Alice', 'Bob', 'Carlo', 'Dana'].map(name => ({ id: name, name }));
    function standings(matches) {
      context.fixture = {
        user: { id: 'viewer', admin: false }, users,
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

    const banner = (league, admin = false) => {
      context.fixture.league = league;
      context.fixture.user.admin = admin;
      return vm.runInContext('leagueBanner()', context);
    };
    assert.equal(banner(null), '');
    assert.match(banner(null, true), /Organizza il campionato/);
    const open = banner({ name: '<War in Heaven>' });
    assert.match(open, /&lt;War in Heaven&gt;/);
    assert.match(open, /Iscrizioni aperte/);
    assert.match(open, /Iscriviti al campionato/);
    assert.match(banner({ name: '40k', joined: true }), /Iscrizione confermata/);
    assert.match(banner({ name: '40k', start: '2026-11-16' }), /Calendario pubblicato/);
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
      fixtures: [first, { ...first, id: 'two', round: 2 }]
    };
    vm.runInContext('state = demo; render();', context);
    assert.equal(nodes.get('season-title').textContent, 'Test');
    assert.equal(nodes.get('season-actions').innerHTML, '');
    assert.match(nodes.get('round-picker').innerHTML, /1 · corrente/);
    assert.match(nodes.get('round').innerHTML, /id="giornata-2"/);
    assert.doesNotMatch(nodes.get('league-standings').innerHTML, /podium-1/);
    assert.doesNotMatch(nodes.get('round').innerHTML, /<time/);
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
  });

  const application = join(directory, 'app');
  await mkdir(application);
  await mkdir(join(directory, 'sessions'));
  for (const file of ['index.php', 'api.php', 'https.php', 'storage.php', 'league.php', 'campionato.php', 'router.php', 'app.js', 'style.css', 'standings.js', 'campionato.js', 'campionato.css', 'web.config']) {
    await copyFile(join(root, 'Cangiolone.com', file), join(application, file));
  }
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
    const result = spawnSync(php, ['-r', '$pdo=new PDO("sqlite:".$argv[1]);$pdo->exec($argv[2]);', join(application, 'api.sqlite'), statement], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }

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

  await t.test('Login rejects wrong passwords; logout removes access', async () => {
    const user = client();
    await user('state');
    await user('login', { username: 'alice', password: 'wrong' }, 401);
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

  await t.test('League registration, blind list exchange and opponent-confirmed results', async () => {
    assert.equal((await state()).league, null);
    await guest('league', undefined, 401);
    await alice('leagueOpen', { name: 'Test' }, 403);
    await admin('leagueOpen', { name: 'Stagione di prova' });
    assert.equal((await alice('state')).league.joined, false);
    await admin('leagueStart', {}, 422);
    for (const account of [alice, bob, admin]) await account('leagueJoin', {});
    await alice('leagueJoin', {});
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
    const fixtureFor = async account => (await account('league')).fixtures.find(fixture => fixture.id === id);
    const list = text => ({ fixture: id, filename: 'army.txt', text });
    const download = owner => 'leagueDownload&fixture=' + id + '&player=' + owner;
    await spectator('leagueLineup', list('Army'), 403);
    await admin('leagueLineup', list('Army'), 403);
    await alice('leagueLineup', { ...list('abc'), filename: 'army.docx' }, 422);
    await alice('leagueLineup', { fixture: id, text: '\u0000Not valid' }, 422);
    await alice('leagueLineup', { fixture: id, text: '  \n  ' }, 422);
    await alice('leagueLineup', list('Army A draft'));
    await alice('leagueLineup', { fixture: id, text: 'Army A final' });
    assert.deepEqual((await bob('league')).fixtures.find(fixture => fixture.id === id).lineups, { mine: false, opponent: true });
    assert.equal((await fixtureFor(spectator)).lineups, null);
    assert.ok(!JSON.stringify(await bob('league')).includes('Army A final'));
    assert.ok(!JSON.stringify(await state()).includes('Army A final'));
    await bob(download(aliceId), undefined, 403);
    await alice(download(aliceId), undefined, 403);
    await bob('leagueLineup', list('Army B'));
    assert.equal(await bob(download(aliceId)), 'Army A final');
    assert.equal(await alice(download(bobId)), 'Army B');
    await spectator(download(aliceId), undefined, 403);
    await guest(download(aliceId), undefined, 401);
    await alice('leagueLineup', list('Changed after reveal'), 409);

    const originalMatches = (await state()).matches.length;
    const score = { fixture: id, scoreA: 67, scoreB: 53, date: '2020-01-01', mission: 'Bastione' };
    await spectator('leaguePropose', score, 403);
    await alice('leaguePropose', { ...score, date: '2999-01-01' }, 422);
    await alice('leaguePropose', score);
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
    await admin('void', { id: saved.id, void: true });
    assert.equal((await fixtureFor(spectator)).result.void, true);
    await admin('void', { id: saved.id, void: false });

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
  await t.test('Authentication attempts are rate limited', async () => {
    const attacker = client();
    await attacker('state');
    // A successful login resets the shared loopback IP counter first.
    await attacker('login', { username: 'alice', password });
    await attacker('state');
    await attacker('logout', {});
    await attacker('state');
    for (let attempt = 0; attempt < 10; attempt++) {
      await attacker('login', { username: 'alice', password: 'wrong' }, 401);
    }
    await attacker('login', { username: 'alice', password }, 429);
  });

});
