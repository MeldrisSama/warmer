'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function setup(reduced = false) {
  const nodes = new Map();
  const canvasContext = {
    clearRect() {}, fillText() {}, fillRect() {}, beginPath() {}, rect() {}, clip() {}, measureText(text) { return { width: text.length * 8 }; },
    getImageData() { return { data: new Uint8ClampedArray(174 * 112 * 4).fill(255) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(image) { this.lastImage = image; }, save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
    setTransform() {}, transform() {}, moveTo() {}, lineTo() {}, closePath() {},
    drawImage() { this.draws = (this.draws || 0) + 1; }
  };
  const motion = { matches: reduced, addEventListener(type, callback) { this[type] = callback; } };
  const document = { createElement() { return { getContext: () => canvasContext }; }, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: '', currentTime: 0, paused: true, plays: 0, events: {},
      value: 'warp', width: 640, height: 360, dataset: { warp: 'warp.mp4', bolter: 'bolter.mp4', orks: 'orks.mp4', orksMotion: 'orks.json' }, attributes: {},
      getAttribute(name) { return this.attributes[name]; },
      setAttribute(name, value) { this.attributes[name] = value; },
      getContext: () => canvasContext,
      classList: { toggle() {} },
      addEventListener(type, callback) { this.events[type] = callback; },
      pause() { this.paused = true; this.events.pause?.(); },
      play() { this.plays++; this.paused = false; this.events.play?.(); return Promise.resolve(); },
      showModal() { this.open = true; }, close() { this.open = false; this.events.close?.(); }
    });
    return nodes.get(id);
  } };
  const motionData = JSON.parse(readFileSync(join(__dirname, '../Cangiolone.com/assets/reveal/orks.json'), 'utf8'));
  const context = vm.createContext({ document, matchMedia: () => motion, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    fetch: async () => ({ ok: true, json: async () => motionData }) });
  vm.runInContext(readFileSync(join(__dirname, '../Cangiolone.com/speedfreaks.js'), 'utf8'), context);
  vm.runInContext(readFileSync(join(__dirname, '../Cangiolone.com/league-reveal.js'), 'utf8'), context);
  const reveal = vm.runInContext('new LeagueReveal()', context);
  const fixtures = [{ id: 'saved-one', round: 1, a: 'a', b: 'b' },
    { id: 'saved-bye', round: 1, a: 'c', b: null }, { id: 'other-round', round: 2, a: 'b', b: 'c' }];
  const users = [{ id: 'a', name: '<img src=x onerror=alert(1)>' }, { id: 'b', name: 'Nome molto lungo con accenti: Nicolò' }, { id: 'c', name: 'Carlo' }];
  return { reveal, nodes, motion, fixtures, users, canvasContext, context, motionData };
}

test('Warp reveals saved pairings at film times and skips byes without changing fixtures', () => {
  const { reveal, nodes, fixtures, users } = setup();
  const original = JSON.stringify(fixtures);
  let closed = 0;
  reveal.open({ round: 1, fixtures, users, onClose() { closed++; } });
  assert.equal(nodes.get('reveal-first').textContent, users[0].name);
  assert.equal(nodes.get('reveal-first').hidden, true);
  const video = nodes.get('reveal-video');
  video.currentTime = 4;
  video.events.timeupdate();
  assert.equal(nodes.get('reveal-day').hidden, false);
  assert.equal(nodes.get('reveal-first').hidden, false);
  assert.equal(nodes.get('reveal-second').hidden, true);
  video.currentTime = 4.7;
  video.events.timeupdate();
  assert.equal(nodes.get('reveal-second').hidden, false);
  assert.equal(nodes.get('reveal-next').disabled, false);
  assert.equal(nodes.get('reveal-progress').textContent, 'Abbinamento 1 di 1');
  assert.equal(nodes.get('reveal-bye').textContent, 'Riposo: Carlo');
  nodes.get('reveal-now').events.click();
  assert.equal(nodes.get('reveal-second').hidden, false);
  assert.equal(nodes.get('reveal-next').textContent, 'Vai alla giornata');
  nodes.get('reveal-next').events.click();
  assert.equal(video.paused, true);
  assert.equal(closed, 1);
  assert.equal(JSON.stringify(fixtures), original);
});

test('Bolter reuses its own film, draws rotating engraving, and supports switching without reshuffling', () => {
  const { reveal, nodes, fixtures, users, canvasContext } = setup();
  nodes.get('reveal-animation').value = 'bolter';
  reveal.open({ round: 1, fixtures, users });
  assert.equal(nodes.get('reveal-video').getAttribute('src'), 'bolter.mp4');
  assert.equal(nodes.get('reveal-engraving').hidden, false);
  assert.equal(reveal.fixtures.length, 1);
  nodes.get('reveal-video').currentTime = 5.8;
  nodes.get('reveal-video').events.timeupdate();
  assert.equal(nodes.get('reveal-first').hidden, false);
  assert.ok(canvasContext.lastImage.data.some((value, index) => index % 4 === 3 && value === 255));
  nodes.get('reveal-animation').value = 'warp';
  nodes.get('reveal-animation').events.change();
  assert.equal(nodes.get('reveal-video').getAttribute('src'), 'warp.mp4');
  assert.equal(nodes.get('reveal-engraving').hidden, true);
  assert.equal(nodes.get('reveal-first').textContent, users[0].name);
  assert.equal(nodes.get('reveal-video').currentTime, 0);
});

test('A round containing only a bye never opens a film', () => {
  const { reveal, nodes, fixtures, users } = setup();
  reveal.open({ round: 1, fixtures: fixtures.filter(fixture => fixture.b === null), users });
  assert.ok(!nodes.get('league-reveal').open);
  assert.equal(nodes.get('reveal-video').plays, 0);
});

test('Two playable fixtures separated by a bye remain consecutive in the playlist', () => {
  const { reveal, nodes, fixtures, users } = setup();
  fixtures.splice(2, 0, { id: 'saved-two', round: 1, a: 'b', b: 'c' });
  reveal.open({ round: 1, fixtures, users });
  nodes.get('reveal-now').events.click();
  nodes.get('reveal-next').events.click();
  assert.equal(nodes.get('reveal-progress').textContent, 'Abbinamento 2 di 2');
  assert.equal(nodes.get('reveal-first').textContent, users[1].name);
  assert.equal(nodes.get('reveal-second').textContent, users[2].name);
  assert.equal(nodes.get('reveal-next').textContent, 'Vai alla giornata');
});

test('Speed Freeks paints saved names on the attached plate and keeps the same pair when switching films', async () => {
  const { reveal, nodes, fixtures, users, canvasContext } = setup();
  nodes.get('reveal-animation').value = 'orks';
  users[0].name = 'A'.repeat(60);
  reveal.open({ round: 1, fixtures, users });
  const video = nodes.get('reveal-video');
  assert.equal(video.getAttribute('src'), 'orks.mp4');
  assert.equal(nodes.get('reveal-engraving').hidden, false);
  await reveal.speedFreeks.loading;
  assert.ok(canvasContext.draws > 0);
  video.currentTime = 3.2;
  video.events.timeupdate();
  assert.equal(nodes.get('reveal-first').hidden, true);
  assert.equal(nodes.get('reveal-second').hidden, true);
  assert.equal(nodes.get('reveal-next').disabled, true);
  assert.equal(nodes.get('reveal-first').textContent, users[0].name);
  video.currentTime = 5;
  video.events.timeupdate();
  assert.equal(nodes.get('reveal-second').hidden, false);
  assert.equal(nodes.get('reveal-next').disabled, false);
  assert.equal(nodes.get('reveal-progress').textContent, 'Abbinamento 1 di 1');
  nodes.get('reveal-animation').value = 'bolter';
  nodes.get('reveal-animation').events.change();
  assert.equal(nodes.get('reveal-first').textContent, users[0].name);
  assert.equal(video.getAttribute('src'), 'bolter.mp4');
});

test('Ork reduced-motion and failed playback reveal names immediately without canvas motion', async () => {
  const { reveal, nodes, motion, fixtures, users } = setup(true);
  nodes.get('reveal-animation').value = 'orks';
  reveal.open({ round: 1, fixtures, users });
  assert.equal(nodes.get('reveal-video').plays, 0);
  assert.equal(nodes.get('reveal-engraving').hidden, true);
  assert.equal(nodes.get('reveal-second').hidden, false);
  nodes.get('reveal-close').events.click();
  motion.matches = false;
  nodes.get('reveal-video').play = () => Promise.reject(new Error('Film unavailable'));
  reveal.open({ round: 1, fixtures, users });
  await Promise.resolve();
  assert.equal(nodes.get('reveal-next').disabled, false);
  assert.equal(nodes.get('reveal-second').hidden, false);
});

test('Reduced motion shows names without starting the video; failures remain readable', async () => {
  const { reveal, nodes, motion, fixtures, users } = setup(true);
  reveal.open({ round: 2, fixtures, users });
  const video = nodes.get('reveal-video');
  assert.equal(video.plays, 0);
  assert.equal(nodes.get('reveal-first').hidden, false);
  assert.equal(nodes.get('reveal-second').textContent, 'Carlo');
  nodes.get('reveal-close').events.click();
  motion.matches = false;
  video.play = () => Promise.reject(new Error('Playback unavailable'));
  reveal.open({ round: 1, fixtures, users });
  await Promise.resolve();
  assert.equal(nodes.get('reveal-second').hidden, false);
  assert.equal(nodes.get('reveal-next').disabled, false);
  video.events.error();
  assert.equal(nodes.get('reveal-pause').hidden, true);
});

test('Pause, resume, Escape cleanup and changing motion preference stop the film', () => {
  const { reveal, nodes, motion, fixtures, users } = setup();
  reveal.open({ round: 1, fixtures, users });
  const video = nodes.get('reveal-video');
  nodes.get('reveal-pause').events.click();
  assert.equal(video.paused, true);
  nodes.get('reveal-pause').events.click();
  assert.equal(video.paused, false);
  motion.matches = true;
  motion.change();
  assert.equal(video.paused, true);
  assert.equal(nodes.get('reveal-first').hidden, false);
  nodes.get('league-reveal').close();
  assert.equal(video.paused, true);
});

test('Loop and seek discard a stale final-frame timestamp', () => {
  const { context } = setup();
  assert.equal(vm.runInContext('revealFrameTime({currentTime:0},7.97)', context), 0);
  assert.equal(vm.runInContext('revealFrameTime({currentTime:0.03},7.9)', context), .03);
  assert.equal(vm.runInContext('revealFrameTime({currentTime:2.1},2.07)', context), 2.07);
  assert.equal(vm.runInContext('revealFrameTime({currentTime:0},undefined)', context), 0);
});

test('Already queued video callbacks cannot repaint after next fixture or close', () => {
  const { reveal, nodes, fixtures, users } = setup();
  fixtures.push({ id: 'another', round: 1, a: 'b', b: 'c' });
  const video = nodes.get('reveal-video');
  const callbacks = [];
  video.requestVideoFrameCallback = callback => { callbacks.push(callback); return callbacks.length; };
  video.cancelVideoFrameCallback = () => {};
  nodes.get('reveal-animation').value = 'bolter';
  reveal.open({ round: 1, fixtures, users });
  const stale = callbacks[0];
  nodes.get('reveal-next').events.click();
  let repainted = false;
  reveal.painter.draw = () => { repainted = true; };
  stale(0, { mediaTime: 7 });
  assert.equal(repainted, false);
  const pending = callbacks.at(-1);
  nodes.get('reveal-close').events.click();
  pending(0, { mediaTime: 7 });
  assert.equal(repainted, false);
});

test('Speed Freeks hides names on the back, restores the small attached plate after restart, and rejects corrupt geometry', async () => {
  const { reveal, nodes, fixtures, users, canvasContext, motionData } = setup();
  nodes.get('reveal-animation').value = 'orks';
  reveal.open({ round: 1, fixtures, users });
  await reveal.speedFreeks.loading;
  const rear = motionData.frames.findIndex(frame => !frame.front);
  canvasContext.draws = 0;
  reveal.speedFreeks.draw(rear / 30);
  assert.equal(canvasContext.draws, 0);
  reveal.speedFreeks.draw(0);
  assert.ok(canvasContext.draws > 0);
  assert.throws(() => reveal.speedFreeks.setMotion({ fps: 30, frames: [{ front: true, quad: [[NaN, 0]] }] }), /non disponibile/);
});

test('A missing motion file falls back to the saved names without blocking the calendar', async () => {
  const { reveal, nodes, fixtures, users, context } = setup();
  context.fetch = async () => ({ ok: false });
  nodes.get('reveal-animation').value = 'orks';
  reveal.open({ round: 1, fixtures, users });
  await reveal.speedFreeks.loading.catch(() => {});
  await Promise.resolve();
  assert.equal(nodes.get('reveal-first').hidden, false);
  assert.equal(nodes.get('reveal-second').hidden, false);
  assert.equal(nodes.get('reveal-next').disabled, false);
});
