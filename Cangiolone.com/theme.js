'use strict';

window.SectorTheme = (() => {
  const key = 'cangiolone.appearance.v1';
  const presets = [
    { id: 'original', name: 'Cangiolone originale', bg: '#111714', surface: '#17231d', accent: '#c2a66b' },
    { id: 'dark-angels', name: 'Dark Angels', bg: '#0c1611', surface: '#173b2a', accent: '#d4bd8a' },
    { id: 'ultramarines', name: 'Ultramarines', bg: '#10182b', surface: '#1c3159', accent: '#dfbd70' },
    { id: 'blood-angels', name: 'Blood Angels', bg: '#1c1113', surface: '#4b1c23', accent: '#e4bd76' },
    { id: 'necrons', name: 'Necrons', bg: '#111715', surface: '#26332e', accent: '#91e567' },
    { id: 'sororitas', name: 'Adepta Sororitas', bg: '#eee8da', surface: '#fffaf0', accent: '#941f32' },
    { id: 'aeldari', name: 'Aeldari', bg: '#e7e3d7', surface: '#faf7ec', accent: '#9d2f41' },
    { id: 'drukhari', name: 'Drukhari', bg: '#0b1519', surface: '#102b32', accent: '#58d4bb' },
    { id: 'tyranids', name: 'Tyranids', bg: '#211529', surface: '#38263e', accent: '#e9d4b2' },
    { id: 'orks', name: 'Orks', bg: '#10170c', surface: '#263a18', accent: '#9cda43' },
    { id: 'death-guard', name: 'Death Guard', bg: '#1a1e14', surface: '#3b4527', accent: '#c4ad68' },
    { id: 'iron-warriors', name: 'Iron Warriors', bg: '#181b1d', surface: '#333a3d', accent: '#e7bf38' },
    { id: 'world-eaters', name: 'World Eaters', bg: '#211010', surface: '#4b1a18', accent: '#d6a354' },
    { id: 'thousand-sons', name: 'Thousand Sons', bg: '#0b2028', surface: '#124650', accent: '#e2bb60' },
    { id: 'emperors-children', name: "Emperor's Children", bg: '#211326', surface: '#47284c', accent: '#ef9abe' },
    { id: 'tau', name: "T'au Empire", bg: '#dce5e4', surface: '#f4f7f2', accent: '#a33128' },
    { id: 'custodes', name: 'Adeptus Custodes', bg: '#1c1710', surface: '#3b2e1b', accent: '#e1bd60' },
    { id: 'mechanicus', name: 'Adeptus Mechanicus', bg: '#200f11', surface: '#491b20', accent: '#e0d7bd' },
    { id: 'grey-knights', name: 'Grey Knights', bg: '#151d25', surface: '#2d3c49', accent: '#d5dfe7' },
    { id: 'space-wolves', name: 'Space Wolves', bg: '#18252d', surface: '#304957', accent: '#efc45b' }
  ];
  const orkMenus = {
    'Classifica': 'Ki è il più tosto', 'Campionati': 'Le WAAAGH!', 'Tornei e campionati': 'Le WAAAGH!',
    'Nuova partita': 'Nuova zuffa', 'Liste': 'Lizte', 'Army Builder': 'Officina dei Mek',
    'Profilo': 'Il tuo muzo', 'Esci': 'Zlogga', 'Tutti i campionati': 'Tutte le WAAAGH!',
    'Giornate': 'Giorni di zuffa', 'Tema': 'Kolori del klan'
  };
  function updateMenus() {
    // Only explicitly marked interface labels participate; never scan rules or user content.
    for (const element of document.querySelectorAll('[data-theme-menu]')) {
      const original = element.dataset.themeMenu;
      const label = current.id === 'orks' ? (orkMenus[original] || original) : original;
      if (element.textContent !== label) element.textContent = label;
    }
  }
  const fields = ['bg', 'surface', 'accent'];
  const valid = value => value && fields.every(field => /^#[0-9a-f]{6}$/i.test(value[field]));
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, weight) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * weight).toString(16).padStart(2, '0')).join('');
  const luminance = hex => rgb(hex).reduce((sum, v, i) => {
    const c = v / 255;
    return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  function foreground(bg) {
    const ink = luminance(bg) > .179 ? '#111714' : '#eeeae0';
    if (contrast(ink, bg) >= 4.5) return ink;
    return contrast('#000000', bg) > contrast('#ffffff', bg) ? '#000000' : '#ffffff';
  }
  function readable(color, bg, minimum = 4.5) {
    const target = foreground(bg);
    for (let step = 0; step <= 100; step++) {
      const candidate = mix(color, target, step / 100);
      if (contrast(candidate, bg) >= minimum) return candidate;
    }
    return target;
  }
  function palette(bg, accent) {
    const text = foreground(bg);
    return {
      text, muted: readable(mix(bg, text, .65), bg),
      hover: mix(bg, luminance(text) > .5 ? '#000000' : '#ffffff', .08),
      line: readable(mix(bg, text, .3), bg, 3),
      gold: readable(accent, bg),
      bonus: readable('#83c6ff', bg), keyword: readable('#b9d8d2', bg),
      warning: readable('#efc18e', bg), error: readable('#ff9a94', bg),
      info: readable('#a6cede', bg), victory: readable('#78cc93', bg),
      'medal-1': readable('#efd18c', bg), 'medal-2': readable('#cbd8dc', bg), 'medal-3': readable('#e1a882', bg)
    };
  }
  let current = presets[0];
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (valid(saved)) current = { ...saved, id: presets.find(p => fields.every(f => p[f] === saved[f]))?.id || 'custom' };
  } catch { /* Browser storage may be unavailable; the original theme still works. */ }

  function apply() {
    const root = document.documentElement;
    root.dataset.theme = current.id;
    root.style.colorScheme = luminance(current.bg) > .179 ? 'light' : 'dark';
    for (const field of fields) root.style.setProperty('--theme-' + field, current[field]);
    root.style.setProperty('--theme-on-accent', foreground(current.accent));
    for (const kind of ['bg', 'surface']) {
      for (const [name, value] of Object.entries(palette(current[kind], current.accent))) {
        root.style.setProperty('--theme-' + kind + '-' + name, value);
      }
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.bg);
    updateMenus();
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => { if (current.id === 'orks') updateMenus(); })
      .observe(document.body, { childList: true, subtree: true });
    updateMenus();
  }, { once: true });

  function mount(container) {
    container.innerHTML = `<h2>Aspetto</h2>
      <p class="intro theme-intro">Scegli un tema ispirato alle fazioni oppure crea i tuoi colori. La scelta vale per tutto il sito, su questo browser.</p>
      <fieldset class="theme-presets"><legend>Temi predefiniti</legend>
        <label class="theme-preset"><span data-theme-menu="Tema">Tema</span><select data-theme-preset>
          <option value="custom" disabled>Colori personalizzati</option>
          ${presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select></label>
        <div class="theme-swatches" aria-hidden="true"><span></span><span></span><span></span></div>
      </fieldset>
      <fieldset class="theme-colors"><legend>Colori personalizzati</legend>
        ${fields.map((f, i) => `<label class="theme-color">${['Sfondo', 'Pannelli', 'Accento'][i]}<input type="color" data-theme-color="${f}"><output></output></label>`).join('')}
      </fieldset>
      <p class="hint">Anteprima e salvataggio immediati. Testi, bordi e accenti si adattano per mantenere il contrasto. I colori funzionali conservano il loro significato.</p>
      <div class="theme-actions"><button type="button" data-theme-reset>Ripristina tema originale</button><p class="theme-status" role="status" aria-live="polite"></p></div>`;
    const selector = container.querySelector('[data-theme-preset]');
    selector.addEventListener('change', () => choose(presets.find(p => p.id === selector.value)));
    for (const input of container.querySelectorAll('[data-theme-color]')) {
      input.addEventListener('input', () => choose({ ...current, id: 'custom', [input.dataset.themeColor]: input.value }));
    }
    container.querySelector('[data-theme-reset]').addEventListener('click', () => choose(presets[0]));
    function sync(message = '') {
      selector.value = current.id;
      container.querySelectorAll('.theme-swatches span').forEach((swatch, i) => { swatch.style.backgroundColor = current[fields[i]]; });
      for (const input of container.querySelectorAll('[data-theme-color]')) {
        input.value = current[input.dataset.themeColor];
        input.nextElementSibling.value = input.value.toUpperCase();
      }
      container.querySelector('.theme-status').textContent = message || (current.id === 'custom' ? 'Colori personalizzati' : presets.find(p => p.id === current.id).name);
    }
    function choose(value) {
      if (!valid(value)) return;
      current = { ...value, id: presets.find(p => fields.every(f => p[f] === value[f]))?.id || 'custom' };
      apply();
      let message = '';
      try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(fields.map(f => [f, current[f]])))); }
      catch { message = 'Anteprima attiva. Il browser non consente di salvare i colori.'; }
      sync(message);
    }
    sync();
    updateMenus();
  }
  return { mount };
})();
