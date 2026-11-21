'use strict';

// Original decorative drawings. The caller chooses once and retains the ID for the operation.
window.SectorSyncIcons=(()=>{
  const drawings={
    cog: `<g class="sync-icon-cog-wheel"><circle cx="24" cy="24" r="14"/>${Array.from({length:12},(_,i)=>`<path d="M21 10V5h6v5" transform="rotate(${i*30} 24 24)"/>`).join('')}<circle cx="24" cy="24" r="9"/></g><path class="sync-icon-highlight" d="m25 15-7 10h6l-1 8 7-11h-6z"/>`,
    auspex: `<rect x="6" y="4" width="36" height="38" rx="5"/><circle cx="24" cy="21" r="12"/><circle class="sync-icon-faint" cx="24" cy="21" r="6"/><path class="sync-icon-faint" d="M12 21h24M24 9v24"/><g class="sync-icon-radar-sweep"><path class="sync-icon-highlight sync-icon-radar-sector" d="M24 21V9a12 12 0 0 1 12 12Z"/><path d="M24 21V9"/></g><circle class="sync-icon-radar-dot sync-icon-highlight" cx="29" cy="15" r="1.5"/><circle class="sync-icon-radar-dot sync-icon-radar-dot-second" cx="17" cy="25" r="1.5"/><path d="M15 37h7m5 0h6"/>`,
    'chaos-star': `<circle cx="24" cy="24" r="6"/>${Array.from({length:8},(_,i)=>`<g class="sync-icon-star-ray" transform="rotate(${i*45} 24 24)"><path d="M24 17V3m-3 4 3-4 3 4"/></g>`).join('')}<circle class="sync-icon-highlight sync-icon-star-core" cx="24" cy="24" r="2"/>`,
    'warp-rift': `<path class="sync-icon-faint" d="m15 5 3 9-7 5 5 8-5 9 6 7m16-38-3 9 7 5-5 8 5 9-6 7"/><path class="sync-icon-warp-cracks" d="m17 15-7-3m6 16-10 5m24-20 10-4m-7 18 9 4"/><path class="sync-icon-highlight sync-icon-warp-core" d="m25 3-7 13 4 5-6 10 7-3-1 17 9-20-5 1 5-12-6 4z"/>`,
    'necron-glyph': `<path d="M8 9h9v7h-6v10H7m33-17h-9v7h6v10h4M10 35h8v7m20-7h-8v7"/><path class="sync-icon-faint" d="M24 5v7m0 24v7M7 30h7m20 0h7"/><path class="sync-icon-highlight sync-icon-necron-trace" d="M24 12h-5v7h-5v11h10v6m0-24h5v7h5v11H24V19"/><path class="sync-icon-necron-node" d="m24 17 4 5-4 5-4-5z"/>`,
    'ork-bolts': `<g class="sync-icon-ork-upper"><path d="M7 8h34v12h-5l-3-5-4 6-5-5-4 5-4-6-3 5H7Z"/><path class="sync-icon-faint" d="m14 8 2-3h6m8 3 3-3h5"/><path class="sync-icon-highlight" d="m10 11 3 1v4l-3 1-2-3Zm28 0 2 3-2 3-3-1v-4Z"/></g><g class="sync-icon-ork-lower"><path d="M7 39h34V28h-5l-3 5-4-6-5 5-4-5-4 6-3-5H7Z"/><path class="sync-icon-faint" d="m14 39 2 4h7m7-4 2 4h5"/><path class="sync-icon-highlight" d="m10 30 3 1v4l-3 1-2-3Zm28 0 2 3-2 3-3-1v-4Z"/></g>`
  };
  const ids=Object.freeze(Object.keys(drawings));
  function choose(){return ids[Math.floor(Math.random()*ids.length)];}
  function render(id){
    const safe=Object.hasOwn(drawings,id)?id:ids[0];
    return `<svg xmlns="http://www.w3.org/2000/svg" class="sync-icon sync-icon-${safe}" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawings[safe]}</svg>`;
  }
  return Object.freeze({ids,choose,render});
})();
