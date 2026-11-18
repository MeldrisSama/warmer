'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../Cangiolone.com/theme.js'), 'utf8');
const key = 'cangiolone.appearance.v1';

function load(saved = null, blocked = false, elements = []) {
  const store = new Map([[key, saved]]), styles = new Map(), meta = {};
  const root = { dataset: {}, style: { setProperty: (k, v) => styles.set(k, v) } };
  let ready, mutation;
  const context = vm.createContext({ window: {}, document: {
    documentElement: root, body: {},
    querySelector: () => ({ setAttribute: (k, v) => { meta[k] = v; } }),
    querySelectorAll: selector => selector === '[data-theme-menu]' ? elements.filter(e => e.dataset?.themeMenu) : [],
    addEventListener: (event, fn) => { assert.equal(event, 'DOMContentLoaded'); ready = fn; }
  }, MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} },
    localStorage: { getItem: k => { if (blocked) throw Error('Blocked'); return store.get(k); }, setItem: (k, v) => { if (blocked) throw Error('Blocked'); store.set(k, v); } } });
  vm.runInContext(source, context);
  return { api: context.window.SectorTheme, store, styles, root, meta, ready: () => ready(), mutate: () => mutation() };
}
function node(dataset = {}) {
  return { dataset, style: {}, attributes: {}, events: {}, nextElementSibling: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; } };
}
function controls(api) {
  const inputs = ['bg', 'surface', 'accent'].map(f => node({ themeColor: f }));
  const reset = node(), status = {}, selector = node();
  const options = [], swatches = [node(), node(), node()];
  const container = {
    set innerHTML(html) {
      for (const match of html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)) options.push({ id: match[1], name: match[2] });
    },
    querySelectorAll: s => s === '.theme-swatches span' ? swatches : inputs,
    querySelector: s => s === '[data-theme-reset]' ? reset : s === '[data-theme-preset]' ? selector : status
  };
  api.mount(container);
  return { inputs, options, selector, swatches, reset, status, select(id) { selector.value = id; selector.events.change(); } };
}
function contrast(a, b) {
  const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).reduce((s, c, i) => s + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0);
  return (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
}

test('Themes persist, restore on another page and reset without changing other browser data', () => {
  const page = load(), ui = controls(page.api);
  page.store.set('unrelated', 'keep');
  assert.equal(ui.options.length, 21);
  for (const name of ['Aeldari', 'Drukhari', 'Tyranids', 'Orks', 'Death Guard', 'Iron Warriors', 'World Eaters', 'Thousand Sons', "Emperor's Children", "T'au Empire", 'Adeptus Custodes', 'Adeptus Mechanicus', 'Grey Knights', 'Space Wolves']) assert.ok(ui.options.some(o => o.name === name), name);
  for (const option of ui.options.filter(o => o.id !== 'custom')) {
    ui.select(option.id);
    assert.equal(page.root.dataset.theme, option.id);
    assert.equal(ui.selector.value, option.id);
    const reload = load(page.store.get(key));
    assert.equal(reload.root.dataset.theme, option.id);
    assert.equal(reload.meta.content, page.styles.get('--theme-bg'));
    for (const [i, field] of ['bg', 'surface', 'accent'].entries()) assert.equal(ui.swatches[i].style.backgroundColor, page.styles.get('--theme-' + field));
    for (const kind of ['bg', 'surface']) {
      const ground = page.styles.get('--theme-' + kind);
      for (const token of ['text', 'muted', 'gold', 'bonus', 'keyword', 'warning', 'error']) assert.ok(contrast(page.styles.get('--theme-' + kind + '-' + token), ground) >= 4.5, option.id + '/' + token);
    }
  }
  for (const [i, color] of ['#ffffff', '#000000', '#ff6600'].entries()) {
    ui.inputs[i].value = color;
    ui.inputs[i].events.input();
  }
  assert.equal(page.root.dataset.theme, 'custom');
  assert.equal(load(page.store.get(key)).styles.get('--theme-bg'), '#ffffff');
  assert.equal(load(page.store.get(key)).styles.get('--theme-surface'), '#000000');
  assert.equal(load(page.store.get(key)).styles.get('--theme-accent'), '#ff6600');
  assert.equal(ui.selector.value, 'custom');
  ui.reset.events.click();
  assert.equal(page.root.dataset.theme, 'original');
  assert.equal(page.styles.get('--theme-bg'), '#111714');
  assert.equal(page.store.get('unrelated'), 'keep');
});

test('Malformed stored colors are ignored and blocked storage leaves usable controls', () => {
  for (const saved of ['{', 'null', '[]', '{"bg":"red"}', JSON.stringify({ bg: '#ffffff', surface: '#000000', accent: 'url(evil)' })]) {
    assert.equal(load(saved).root.dataset.theme, 'original');
  }
  const page = load(null, true), ui = controls(page.api);
  ui.select('ultramarines');
  assert.equal(page.root.dataset.theme, 'ultramarines');
  assert.match(ui.status.textContent, /non consente di salvare/);
});

test('Orks changes only marked menu labels, follows dynamic menus and restores originals without touching rules', () => {
  const menu = label => ({ dataset: { themeMenu: label }, textContent: label, href: '#classifica' });
  const ranking = menu('Classifica'), profile = menu('Profilo');
  const rule = { textContent: 'Profili e regole: Classifica, [LETHAL HITS], Waaagh! 1 CP.' };
  const userContent = { textContent: 'La mia Armata · Dark Angels' };
  const elements = [ranking, profile, rule, userContent];
  const page = load(null, false, elements), ui = controls(page.api);
  page.ready();
  ui.select('orks');
  assert.equal(ranking.textContent, 'Ki è il più tosto');
  assert.equal(profile.textContent, 'Il tuo muzo');
  assert.equal(ranking.href, '#classifica');
  const play = menu('Giornate'); elements.push(play); page.mutate();
  assert.equal(play.textContent, 'Giorni di zuffa');
  const persisted = load(page.store.get(key), false, elements); persisted.ready();
  assert.equal(persisted.root.dataset.theme, 'orks');
  assert.equal(play.textContent, 'Giorni di zuffa');
  ui.inputs[2].value = '#ff6600'; ui.inputs[2].events.input();
  assert.equal(page.root.dataset.theme, 'custom');
  assert.equal(play.textContent, 'Giornate');
  ui.select('orks'); ui.select('aeldari');
  assert.equal(ranking.textContent, 'Classifica');
  assert.equal(profile.textContent, 'Profilo');
  assert.equal(play.textContent, 'Giornate');
  assert.equal(rule.textContent, 'Profili e regole: Classifica, [LETHAL HITS], Waaagh! 1 CP.');
  assert.equal(userContent.textContent, 'La mia Armata · Dark Angels');
});

test('Text, semantic colors, borders and button labels stay readable on independent extreme backgrounds', () => {
  const colors = ['#000000', '#ffffff', '#777777', '#888888', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  for (const bg of colors) for (const surface of colors) {
    const accent = surface;
    const { styles } = load(JSON.stringify({ bg, surface, accent }));
    for (const [kind, ground] of Object.entries({ bg, surface })) {
      const get = name => styles.get('--theme-' + kind + '-' + name);
      for (const token of ['text', 'muted', 'gold', 'bonus', 'keyword', 'warning', 'error', 'info', 'medal-1', 'medal-2', 'medal-3']) {
        assert.ok(contrast(get(token), ground) >= 4.5, `${kind}/${token} on ${ground}`);
      }
      assert.ok(contrast(get('line'), ground) >= 3);
      assert.ok(contrast(get('text'), get('hover')) >= 4.5);
    }
    assert.ok(contrast(styles.get('--theme-on-accent'), accent) >= 4.5);
  }
});
