'use strict';

let state, requestId, noticeTimer;

const main=document.querySelector('#main');

const esc=value=>String(value??'').replace(
  /[&<>"']/g,
  c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])
);

const today=()=>new Date().toLocaleDateString('en-CA');

const dateLabel=d=>
  new Date(d+'T12:00:00').toLocaleDateString('it-IT');

const icon=type=>`
<svg viewBox="0 0 32 32" aria-hidden="true">
  ${
    type==='trophy'
      ? '<path d="M9 4h14v8c0 6-3 10-7 10s-7-4-7-10V4Zm0 3H4v5c0 4 3 6 7 6M23 7h5v5c0 4-3 6-7 6M16 22v6m-6 0h12"/>'
      : type==='file'
        ? '<path d="M8 3h11l6 6v20H8V3Zm11 0v7h6"/>'
        : '<path d="m6 3 21 22-3 3L3 7l3-4Zm20 0L5 25l3 3L29 7l-3-4ZM3 22l7 7m12-7 7 7"/>'
  }
</svg>`;

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();

    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;

    reader.readAsDataURL(file);
  });
}

function empty(type,title,body){
  return `
    <div class="empty">
      ${icon(type)}
      <strong>${esc(title)}</strong>
      <p>${esc(body)}</p>
    </div>
  `;
}

function notify(text,error=false){
  const n=document.querySelector('#notice');

  n.textContent=text;
  n.className=error?'error':'';
  n.hidden=false;

  clearTimeout(noticeTimer);

  noticeTimer=setTimeout(
    ()=>n.hidden=true,
    error?10000:5000
  );
}

async function api(action,data){
  const r=await fetch(
    'api.php?action='+action,
    {
      method:data?'POST':'GET',
      credentials:'same-origin',
      headers:data
        ? {
            'Content-Type':'application/json',
            'X-CSRF-Token':state.csrf
          }
        : {},
      body:data?JSON.stringify(data):undefined
    }
  );

  let value;

  try{
    value=await r.json();
  }catch{
    throw new Error(
      'Il server non ha risposto correttamente. Riprova tra poco.'
    );
  }

  if(!r.ok){
    throw new Error(
      value.error||'Operazione non riuscita.'
    );
  }

  return value;
}

async function refresh(){
  state=await api('state');
  render();
}

function page(){
  return location.hash.slice(1).split('?')[0]||'classifica';
}

function name(id){
  return state.users.find(u=>u.id===id)?.name||'Giocatore';
}

function render(){
  const nav=document.querySelector('#nav');
  const account=document.querySelector('#account');

  nav.hidden=!state.user;

  if(!state.user){
    account.innerHTML='Per amici.<br>Per il 41° millennio.';
    auth();
    return;
  }

  account.innerHTML=`
    ${esc(state.user.name)}
    <button id="logout" type="button">Esci</button>
  `;

  document.querySelector('#logout').onclick=async()=>{
    try{
      await api('logout',{});

      location.hash='classifica';

      await refresh();
    }catch(e){
      notify(e.message,true);
    }
  };

  const p=page();

  nav.innerHTML=[
    ['classifica','Classifica'],
    ['partita','Nuova partita'],
    ['liste','Liste']
  ].map(
    ([id,label])=>
      `<a href="#${id}" ${
        p===id
          ? 'class="active" aria-current="page"'
          : ''
      }>${label}</a>`
  ).join('');

  if(p==='partita'){
    matchPage();
  }else if(p==='liste'){
    listsPage();
  }else if(p==='inviti'&&state.user.admin){
    invitePage();
  }else{
    standings();
  }
}

function auth(){
  const setup=state.setup;
  const register=!setup&&page()==='registrati';

  main.innerHTML=`
    <section class="panel narrow">

      <h1>
        ${
          setup
            ? 'Apri il tuo settore'
            : register
              ? 'Unisciti al settore'
              : 'Bentornato nel settore'
        }
      </h1>

      <p class="intro">
        ${
          setup
            ? 'Crea il tuo account amministratore per iniziare la campagna.'
            : register
              ? 'Crea il tuo account personale con il codice ricevuto da un amico.'
              : 'Accedi per consultare la classifica, registrare le battaglie e condividere le tue liste.'
        }
      </p>

      <form id="auth-form">

        <p
          class="error-inline"
          role="alert"
          hidden
        ></p>

        ${
          setup||register
            ? `
              <label class="field">
                Nome giocatore
                <input
                  name="name"
                  required
                  maxlength="60"
                  autocomplete="nickname"
                >
              </label>
            `
            : ''
        }

        <label class="field">
          Nome utente

          <input
            name="username"
            required
            minlength="3"
            maxlength="32"
            pattern="[a-zA-Z0-9._-]{3,32}"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          >
        </label>

        <label class="field">
          Password

          <input
            name="password"
            type="password"
            required
            ${setup||register?'minlength="12"':''}
            maxlength="72"
            autocomplete="${
              setup||register
                ? 'new-password'
                : 'current-password'
            }"
          >

          ${
            setup||register
              ? `
                <small>
                  Almeno 12 caratteri.
                  Usa una password dedicata a questo sito.
                </small>
              `
              : ''
          }
        </label>

        ${
          setup||register
            ? `
              <label class="field">
                ${
                  setup
                    ? 'Codice di attivazione'
                    : 'Codice invito'
                }

                <input
                  name="code"
                  required
                  maxlength="128"
                  autocomplete="off"
                  spellcheck="false"
                >
              </label>
            `
            : ''
        }

        <button
          class="primary wide"
          type="submit"
        >
          ${
            setup
              ? 'Crea il settore'
              : register
                ? 'Crea account'
                : 'Accedi'
          }
        </button>

      </form>

      ${
        setup
          ? ''
          : `
            <div class="actions">
              <a href="#${register?'classifica':'registrati'}">
                ${
                  register
                    ? 'Hai già un account? Accedi'
                    : 'Hai un invito? Crea il tuo account'
                }
              </a>
            </div>
          `
      }

    </section>
  `;

  bindForm(
    'auth-form',
    async form=>{
      await api(
        setup
          ? 'setup'
          : register
            ? 'register'
            : 'login',
        Object.fromEntries(new FormData(form))
      );

      location.hash='classifica';

      await refresh();
    }
  );
}

function bindForm(id,handler){
  document
    .getElementById(id)
    .addEventListener(
      'submit',
      async e=>{
        e.preventDefault();

        const form=e.currentTarget;
        const button=form.querySelector('[type=submit]');

        if(button.disabled){
          return;
        }

        button.disabled=true;

        const inline=form.querySelector('.error-inline');

        if(inline){
          inline.hidden=true;
        }

        try{
          await handler(form);
        }catch(error){
          if(inline){
            inline.textContent=error.message;
            inline.hidden=false;
          }

          notify(error.message,true);
        }finally{
          if(button.isConnected){
            button.disabled=false;
          }
        }
      }
    );
}

function leagueBanner(){
  const league=state.league;
  if(!league && !state.user.admin) return '';
  const label=!league ? 'Organizza il campionato' : !league.start && !league.joined
    ? 'Iscriviti al campionato' : 'Vai al campionato';
  return `<aside class="panel heading" aria-label="Campionato">
    <strong>${esc(league?.name || 'Campionato Warhammer 40.000')}</strong>
    <a href="campionato.php">${label} →</a>
  </aside>`;
}

function standings(){
  const rows=rankStandings(state.users,state.matches);

  main.innerHTML=`
    ${leagueBanner()}
    <section class="panel standings">

      <div class="heading">

        <h1>Classifica</h1>

        ${
          state.user.admin
            ? '<button id="invite" class="primary">+ Giocatore</button>'
            : ''
        }

      </div>

      <div class="table-scroll">

        <table>

          <thead>
            <tr>
              <th>#</th>
              <th>Giocatore</th>

              <th class="number">
                <abbr title="Partite giocate">PG</abbr>
              </th>

              <th class="number">
                <abbr title="Vittorie">V</abbr>
              </th>

              <th class="number">
                <abbr title="Pareggi">P</abbr>
              </th>

              <th class="number">
                <abbr title="Sconfitte">S</abbr>
              </th>

              <th class="number">Diff.</th>
              <th class="number">Punti</th>
            </tr>
          </thead>

          <tbody>

            ${
              rows.map(
                u=>{
                  return `
                    <tr>

                      <td class="muted">
                        ${u.rank}
                      </td>

                      <td>
                        ${esc(u.name)}
                        ${
                          u.id===state.user.id
                            ? ' <small>(tu)</small>'
                            : ''
                        }
                      </td>

                      <td class="number">
                        ${u.played}
                      </td>

                      <td class="number">
                        ${u.w}
                      </td>

                      <td class="number">
                        ${u.d}
                      </td>

                      <td class="number">
                        ${u.l}
                      </td>

                      <td class="number">
                        ${u.diff>0?'+':''}${u.diff}
                      </td>

                      <td class="number points">
                        ${u.points}
                      </td>

                    </tr>
                  `;
                }
              ).join('')
            }

          </tbody>

        </table>

        ${
          !rows.length
            ? empty(
                'trophy',
                'La campagna deve ancora iniziare.',
                'Invita i giocatori e registra la prima partita per vedere la classifica.'
              )
            : ''
        }

      </div>

      <div class="rules">

        <span>
          Vittoria 3 · Pareggio 1 · Sconfitta 0
        </span>

        <span>
          A parità di punti: differenza punti vittoria
        </span>

      </div>

    </section>

    <section class="panel">

      <h2>Ultime partite</h2>

      <div class="table-scroll">

        <table>

          <thead>
            <tr>
              <th>Data</th>
              <th>Giocatore A</th>
              <th>Risultato</th>
              <th>Giocatore B</th>
              <th>Missione</th>

              <th>
                <span class="sr-only">
                  Azioni
                </span>
              </th>
            </tr>
          </thead>

          <tbody>

            ${
              [...state.matches]
                .sort(
                  (a,b)=>
                    b.date.localeCompare(a.date) ||
                    b.created.localeCompare(a.created)
                )
                .map(
                  m=>`
                    <tr class="${m.void?'cancelled':''}">

                      <td>
                        ${dateLabel(m.date)}
                      </td>

                      <td>
                        ${esc(name(m.a))}
                      </td>

                      <td>
                        <strong class="result">
                          ${m.scoreA} – ${m.scoreB}
                        </strong>

                        ${
                          m.void
                            ? '<br><small>Annullata</small>'
                            : ''
                        }
                      </td>

                      <td>
                        ${esc(name(m.b))}
                      </td>

                      <td>
                        ${esc(m.mission||'—')}
                      </td>

                      <td class="match-actions">

                        ${
                          m.photo
                            ? `
                              <button
                                class="small-button"
                                data-photo="${esc(m.photo)}"
                                type="button"
                              >
                                Foto
                              </button>
                            `
                            : ''
                        }

                        ${
                          state.user.admin ||
                          m.by===state.user.id
                            ? `
                              <button
                                class="small-button"
                                data-void="${m.id}"
                                data-value="${!m.void}"
                                type="button"
                              >
                                ${
                                  m.void
                                    ? 'Ripristina'
                                    : 'Annulla'
                                }
                              </button>
                            `
                            : ''
                        }

                      </td>

                    </tr>
                  `
                ).join('')
            }

          </tbody>

        </table>

        ${
          !state.matches.length
            ? empty(
                'battle',
                'Nessuna partita disputata.',
                'Le battaglie verranno mostrate qui una volta registrate.'
              )
            : ''
        }

      </div>

    </section>
  `;

  document
    .querySelector('#invite')
    ?.addEventListener(
      'click',
      ()=>location.hash='inviti'
    );

  document
    .querySelectorAll('[data-void]')
    .forEach(
      b=>b.onclick=async()=>{
        b.disabled=true;

        try{
          await api(
            'void',
            {
              id:b.dataset.void,
              void:b.dataset.value==='true'
            }
          );

          await refresh();

          notify(
            b.dataset.value==='true'
              ? 'Partita annullata. Puoi ripristinarla dallo storico.'
              : 'Partita ripristinata.'
          );
        }catch(e){
          notify(e.message,true);

          b.disabled=false;
        }
      }
    );

  document
    .querySelectorAll('[data-photo]')
    .forEach(
      b=>b.onclick=()=>{
        const dialog=document.createElement('dialog');

        dialog.className='photo-dialog';

        dialog.innerHTML=`
          <div class="photo-dialog-content">

            <button
              type="button"
              class="photo-close"
              aria-label="Chiudi foto"
            >
              ×
            </button>

            <img
              src="${esc(b.dataset.photo)}"
              alt="Foto della partita"
            >

          </div>
        `;

        document.body.appendChild(dialog);

        const close=()=>{
          if(dialog.open){
            dialog.close();
          }else{
            dialog.remove();
          }
        };

        dialog
          .querySelector('.photo-close')
          .onclick=close;

        dialog.onclick=e=>{
          if(e.target===dialog){
            close();
          }
        };

        dialog.addEventListener(
          'close',
          ()=>dialog.remove(),
          {
            once:true
          }
        );

        dialog.showModal();
      }
    );
}

function options(selected=''){
  return (
    '<option value="">Seleziona un giocatore</option>'+
    state.users.map(
      u=>`
        <option
          value="${u.id}"
          ${u.id===selected?'selected':''}
        >
          ${esc(u.name)}
        </option>
      `
    ).join('')
  );
}

function matchPage(){
  requestId=crypto.randomUUID();

  main.innerHTML=`
    <section class="panel narrow">

      <h1>
        Nuova partita
      </h1>

      <p class="intro">
        Registra i risultati di una nuova battaglia.
      </p>

      ${
        state.users.length<2
          ? `
            <p class="intro">
              Servono almeno due giocatori.
              Invita un amico per registrare la prima partita.
            </p>
          `
          : ''
      }

      <form id="match-form">

        <p
          class="error-inline"
          role="alert"
          hidden
        ></p>

        <div class="form-grid">

          <label class="field">
            Giocatore A

            <select name="a" required>
              ${options(state.user.id)}
            </select>
          </label>

          <label class="field">
            Giocatore B

            <select name="b" required>
              ${options()}
            </select>
          </label>

          <label class="field">
            Punti vittoria A

            <input
              name="scoreA"
              type="number"
              min="0"
              max="100"
              step="1"
              required
              value="0"
            >
          </label>

          <label class="field">
            Punti vittoria B

            <input
              name="scoreB"
              type="number"
              min="0"
              max="100"
              step="1"
              required
              value="0"
            >
          </label>

          <label class="field">
            Data della partita

            <input
              name="date"
              type="date"
              min="2000-01-01"
              max="${today()}"
              value="${today()}"
              required
            >
          </label>

          <label class="field">
            Missione (opzionale)

            <input
              name="mission"
              maxlength="120"
              placeholder="Es. Purge the foe - Take and hold"
            >
          </label>

          <label class="field">
            Foto della partita (opzionale)

            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            >
          </label>

        </div>

        <button
          type="submit"
          class="primary wide"
          ${
            state.users.length<2
              ? 'disabled'
              : ''
          }
        >
          Registra partita
        </button>

      </form>

    </section>
  `;

  const f=document.querySelector('#match-form');

  const sync=()=>{
    for(const o of f.elements.b.options){
      o.disabled=
        !!o.value &&
        o.value===f.elements.a.value;
    }
  };

  f.elements.a.onchange=sync;

  sync();

  bindForm(
    'match-form',
    async form=>{
      const data=Object.fromEntries(
        new FormData(form)
      );

      data.scoreA=Number(data.scoreA);
      data.scoreB=Number(data.scoreB);
      data.request=requestId;

      const photo=data.photo;

      if(photo && photo.size>0){

        if(photo.size>5*1024*1024){
          throw new Error(
            'La foto non può superare 5 MB.'
          );
        }

        const allowedTypes=[
          'image/jpeg',
          'image/png',
          'image/webp'
        ];

        if(!allowedTypes.includes(photo.type)){
          throw new Error(
            'La foto deve essere JPG, PNG o WebP.'
          );
        }

        data.photo=await fileToBase64(photo);

      }else{
        data.photo=null;
      }

      await api(
        'match',
        data
      );

      location.hash='classifica';

      await refresh();

      notify(
        'Partita registrata. La classifica è aggiornata.'
      );
    }
  );
}

function listsPage(){
  main.innerHTML=`
    <section class="panel narrow">

      <h1>
        Carica lista
      </h1>

      <p class="intro">
        Salva le tue liste per tenerle sempre a disposizione.
      </p>

      <form id="list-form">

        <p
          class="error-inline"
          role="alert"
          hidden
        ></p>

        <label class="field">
          Giocatore

          <input
            value="${esc(state.user.name)}"
            readonly
          >
        </label>

        <label class="field">
          Nome lista

          <input
            name="name"
            required
            maxlength="100"
            placeholder="Es. Astra Militarum – 2000 pt"
          >
        </label>

        <label class="field">
          Fazione

          <input
            name="faction"
            required
            maxlength="80"
            placeholder="Es. Astra Militarum"
          >
        </label>

        <label class="field">
          File della lista (.txt)

          <span
            class="drop"
            id="drop"
          >

            <strong>
              Trascina qui il file .txt
            </strong>

            <input
              type="file"
              name="file"
              accept=".txt,text/plain"
              required
              aria-label="Seleziona file di testo"
            >

          </span>

          <small>
            Solo file .txt in UTF-8.
            Dimensione massima 1 MB.
          </small>
        </label>

        <button
          class="primary wide"
          type="submit"
        >
          Carica lista
        </button>

      </form>

    </section>

    <section class="panel">

      <h2>
        Liste caricate
      </h2>

      <div class="table-scroll">

        <table>

          <thead>
            <tr>
              <th>Data</th>
              <th>Giocatore</th>
              <th>Nome lista</th>
              <th>Fazione</th>

              <th>
                <span class="sr-only">
                  Download
                </span>
              </th>
            </tr>
          </thead>

          <tbody>

            ${
              [...state.lists]
                .reverse()
                .map(
                  l=>`
                    <tr>

                      <td>
                        ${dateLabel(l.date)}
                      </td>

                      <td>
                        ${esc(name(l.owner))}
                      </td>

                      <td>
                        ${esc(l.name)}
                      </td>

                      <td>
                        ${esc(l.faction)}
                      </td>

                      <td>
                        <a
                          class="button small-button"
                          href="api.php?action=download&amp;id=${l.id}"
                          download
                        >
                          Scarica .txt
                        </a>
                      </td>

                    </tr>
                  `
                ).join('')
            }

          </tbody>

        </table>

        ${
          !state.lists.length
            ? empty(
                'file',
                'Nessuna lista caricata.',
                'Carica la tua prima lista per averla sempre a disposizione.'
              )
            : ''
        }

      </div>

    </section>
  `;

  const drop=document.querySelector('#drop');

  const input=document.querySelector(
    '[name=file]'
  );

  drop.ondragover=e=>{
    e.preventDefault();
    drop.classList.add('dragover');
  };

  drop.ondragleave=()=>{
    drop.classList.remove('dragover');
  };

  drop.ondrop=e=>{
    e.preventDefault();

    drop.classList.remove('dragover');

    if(e.dataTransfer.files.length===1){
      input.files=e.dataTransfer.files;
    }else{
      notify(
        'Scegli un solo file alla volta.',
        true
      );
    }
  };

  bindForm(
    'list-form',
    async form=>{
      const file=input.files[0];

      if(
        !file ||
        !file.name.toLowerCase().endsWith('.txt')
      ){
        throw Error(
          'Scegli un file .txt.'
        );
      }

      if(file.size>1048576){
        throw Error(
          'Il file supera il limite di 1 MB.'
        );
      }

      let text;

      try{
        text=new TextDecoder(
          'utf-8',
          {
            fatal:true
          }
        ).decode(
          await file.arrayBuffer()
        );
      }catch{
        throw Error(
          'Salva il file come testo UTF-8 e riprova.'
        );
      }

      await api(
        'list',
        {
          name:form.elements.name.value,
          faction:form.elements.faction.value,
          filename:file.name,
          text
        }
      );

      await refresh();

      notify(
        'Lista caricata. È disponibile nell’archivio del settore.'
      );
    }
  );
}

function invitePage(){
  main.innerHTML=`
    <section class="panel narrow">

      <h1>
        Invita un giocatore
      </h1>

      <p class="intro">
        Genera un codice personale e condividilo con un amico.
        Potrà scegliere il proprio nome utente e la propria password.
      </p>

      <p>
        Ogni codice vale 7 giorni e può essere usato una sola volta.
      </p>

      <button
        class="primary"
        id="new-invite"
      >
        Genera codice invito
      </button>

      <div
        id="invite-result"
        class="invite-result"
        hidden
      ></div>

      <div class="actions">
        <a href="#classifica">
          Torna alla classifica
        </a>
      </div>

    </section>
  `;

  document.querySelector(
    '#new-invite'
  ).onclick=async e=>{

    e.target.disabled=true;

    try{
      const r=await api(
        'invite',
        {}
      );

      const box=document.querySelector(
        '#invite-result'
      );

      box.hidden=false;

      box.innerHTML=`
        <p>
          Pagina di registrazione:

          <a href="#registrati">
            ${esc(new URL('./',location.href).href)}#registrati
          </a>
        </p>

        <p>
          Codice invito:
        </p>

        <code>
          ${esc(r.code)}
        </code>

        <p class="hint">
          Copia il codice e invialo personalmente al tuo amico.
        </p>
      `;

    }catch(err){
      notify(
        err.message,
        true
      );

    }finally{
      e.target.disabled=false;
    }
  };
}

window.addEventListener(
  'hashchange',
  ()=>{
    if(state){
      render();
    }
  }
);

refresh().catch(
  e=>{
    main.innerHTML=`
      <section class="panel narrow">

        <h1>
          Settore non raggiungibile
        </h1>

        <p>
          ${esc(e.message)}
        </p>

        <button id="retry">
          Riprova
        </button>

      </section>
    `;

    document.querySelector(
      '#retry'
    ).onclick=()=>location.reload();
  }
);