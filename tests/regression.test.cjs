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
    for (const file of ['index.php', 'api.php', 'https.php', 'storage.php', 'config.php', '../tests/storage.php', '../tests/transport-router.php']) {
      const result = spawnSync(php, ['-l', join(root, 'Cangiolone.com', file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const result = spawnSync(process.execPath, ['--check', join(root, 'Cangiolone.com/app.js')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
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
    vm.runInContext(await readFile(join(root, 'Cangiolone.com/app.js'), 'utf8'), context);
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
  });

  const application = join(directory, 'app');
  await mkdir(application);
  await mkdir(join(directory, 'sessions'));
  for (const file of ['index.php', 'api.php', 'https.php', 'storage.php', 'app.js', 'style.css']) {
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
      const text = await response.text();
      assert.equal(response.status, status, `${action}: ${text}`);
      const value = response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) : text;
      if (value.csrf) csrf = value.csrf;
      if (status >= 400) assert.equal(typeof value.error, 'string');
      return value;
    };
  }

  const admin = client();
  const alice = client();
  const bob = client();
  const guest = client();
  let adminId, aliceId, bobId, matchId, photoPath;
  const state = () => admin('state');
  const match = overrides => ({ a: aliceId, b: bobId, scoreA: 80, scoreB: 50, date: '2020-01-01', mission: 'Test mission', request: randomUUID(), ...overrides });
  const registration = (username, code) => ({ username, name: username, password, code });

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
    for (const photo of ['data:image/png;base64,!!!', 'data:image/png;base64,aGVsbG8=', 'data:text/html;base64,aGVsbG8=']) {
      await alice('match', match({ photo }), 422);
    }
    await alice('match', match({ photo: png }));
    const saved = (await state()).matches.find(value => value.photo);
    photoPath = saved.photo;
    assert.match(photoPath, /^uploads\/matches\/[a-f0-9]{24}\.png$/);
    const bytes = await readFile(join(application, photoPath));
    assert.deepEqual(bytes, Buffer.from(png.split(',')[1], 'base64'));
  });

  await t.test('Rejected matches leave no orphan photo', { todo: 'Known bug: photo is saved before mission validation; fix in the upload change.' }, async () => {
    const uploads = join(application, 'uploads/matches');
    const before = await readdir(uploads);
    await alice('match', match({ photo: png, mission: 'x'.repeat(121) }), 422);
    assert.deepEqual(await readdir(uploads), before);
  });

  await t.test('Photo downloads require authentication', { todo: 'Known gap: static uploads bypass API authentication.' }, async () => {
    const response = await fetch(`${base}/${photoPath}`, { signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    assert.equal(response.status, 401);
  });
});
