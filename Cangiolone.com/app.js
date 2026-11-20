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
  return typeof sectorOffline==='undefined' ? networkApi(action,data) : sectorOffline.request(networkApi,action,data);
}

async function networkApi(action,data,onProgress){

  const r=await fetch(

    'api.php?action='+action,

    {

      method:data?'POST':'GET',

      credentials:'same-origin',
      signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(onProgress?120000:15000):undefined,

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

    if(onProgress&&r.ok&&r.body?.getReader){
      const reader=r.body.getReader(),decoder=new TextDecoder();let content='',loaded=0;
      const encoding=r.headers.get('Content-Encoding'),length=Number(r.headers.get('Content-Length'));
      const total=(!encoding||encoding==='identity')&&length>0?length:null;
      for(;;){const chunk=await reader.read();if(chunk.done)break;loaded+=chunk.value.byteLength;content+=decoder.decode(chunk.value,{stream:true});onProgress({loaded,total});}
      content+=decoder.decode();value=JSON.parse(content);
    }else value=await r.json();

  }catch(error){
    if(['AbortError','TimeoutError'].includes(error.name))throw error;

    throw new Error(

      'Il server non ha risposto correttamente. Riprova tra poco.'

    );

  }



  if(!r.ok){

    const error=new Error(value.error||'Operazione non riuscita.');error.status=r.status;throw error;

  }



  return value;

}



async function refresh(){

  state=await api('state');
  if(typeof sectorOffline!=='undefined')sectorOffline.start(networkApi);

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
  const emailBanner=document.querySelector('#email-banner');
  let p=page();
  if(p==='liste'){history.replaceState(history.state,'','#builder');p='builder';}
  emailBanner.hidden=!(state.user && state.mailEnabled && !state.account?.email && !state.needsEmail
    && !['profilo','verify-email','reset-password'].includes(p));
  if(!emailBanner.hidden) {
    emailBanner.innerHTML=state.account.pendingEmail
      ? '<span>Controlla la posta per verificare il tuo indirizzo email.</span><a href="#profilo">Gestisci email</a>'
      : '<span>Aggiungi la tua email per recuperare la password e ricevere gli aggiornamenti.</span><a href="#profilo">Aggiungi email</a>';
  }



  nav.hidden=!state.user;



  if(!state.user){

    account.innerHTML='Per amici.<br>Per il 41° millennio.';

    if(state.mailEnabled && ['recupera-password','reset-password','verify-email'].includes(page())) emailAccountPage(page());
    else auth();

    return;

  }



  account.innerHTML=`<a href="#profilo" class="account-profile-link" aria-label="Apri il tuo profilo" title="Profilo" ${p==='profilo'?'aria-current="page"':''}>${profileIcon()}</a>`;

  nav.innerHTML=[

    ['classifica','Classifica'],
    ['campionati','Campionati'],
    ['partita','Nuova partita'],


    ['builder','Army Builder']

  ].map(

    ([id,label])=>

      `<a href="#${id}" data-theme-menu="${label}" ${

        p===id

          ? 'class="active" aria-current="page"'

          : ''

      }>${label}</a>`

  ).join('');

  nav.querySelector('a[href="#builder"]')?.addEventListener('click',event=>builderNavigate(event));



  if(typeof sectorOffline!=='undefined'&&sectorOffline.unavailable()&&(p!=='builder'||!sectorOffline.active())){
    emailBanner.hidden=true;
    main.innerHTML='<section class="panel narrow"><h1>Serve una connessione</h1><p>Offline puoi consultare, creare e modificare le tue liste nella PWA. Le altre funzioni richiedono dati online.</p><a href="#builder">Apri le liste</a></section>';
    return;
  }
  nav.hidden=state.needsEmail;
  if(state.needsEmail && !['verify-email','reset-password'].includes(p)){
    profilePage(true);
  }else if(p==='partita'){

    matchPage();

  }else if(p==='builder'){

    builderPage();

  }else if(p==='profilo'){
    profilePage();
  }else if(['verify-email','reset-password'].includes(p)&&state.mailEnabled){
    emailAccountPage(p);
  }else if(p==='campionati'){
    leaguesPage();
  }else if(p==='inviti'&&state.user.admin){

    invitePage();

  }else{

    standings();

  }

}



function emailAccountPage(route){
  const action=route==='recupera-password'?'passwordForgot':route==='reset-password'?'passwordReset':'emailVerify';
  const title=route==='recupera-password'?'Recupera la password':route==='reset-password'?'Scegli una nuova password':'Verifica indirizzo email';
  const token=new URLSearchParams(location.hash.split('?')[1]).get('token')||'';
  const fields=action==='passwordForgot'
    ? '<label class="field">Indirizzo email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>'
    : action==='passwordReset'
      ? '<label class="field">Nuova password<input type="password" name="password" minlength="12" maxlength="72" required autocomplete="new-password"></label>'
      : '';
  main.innerHTML=`<section class="panel narrow">
    <h1>${title}</h1>
    <form id="email-account-form">
      <p class="error-inline" role="alert" hidden></p>
      ${fields}
      <button class="primary" type="submit">${title}</button>
    </form>
    <p class="actions"><a href="#classifica">Torna a Cronache del settore</a></p>
  </section>`;
  bindForm('email-account-form',async form=>{
    const data=Object.fromEntries(new FormData(form));
    if(action!=='passwordForgot') data.token=token;
    await api(action,data);
    if(action==='passwordForgot'){
      notify('Se l’indirizzo è associato a un account, riceverai un link per reimpostare la password.');
      return;
    }
    location.hash=action==='emailVerify'&&state.user?'profilo':'classifica';
    await refresh();
    notify(action==='emailVerify'?'Indirizzo email verificato.':'Password aggiornata. Accedi con quella nuova.');
  });
}

function profileIcon(){return '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="11" r="5"/><path d="M5 28v-3c0-6 5-9 11-9s11 3 11 9v3"/></svg>';}

function profilePage(onboarding=false){
  const account=state.account||{},showEmailForm=state.mailEnabled&&(!account.email||Boolean(account.pendingEmail));
  main.innerHTML=`<section class="panel profile-page">
    <div class="profile-heading"><span class="profile-symbol" aria-hidden="true">${profileIcon()}</span><div><p class="profile-eyebrow">Il tuo account</p><h1>${onboarding?'Aggiungi la tua email':esc(state.user.name)}</h1><p class="profile-username">${esc(state.user.username||'')}${state.user.admin?' · Amministratore':''}</p></div></div>
    ${onboarding?'<p class="intro">Ti invieremo un link di verifica. Potrai usare l’indirizzo per accedere e recuperare la password.</p>':''}
    ${account.email?`<div class="profile-identity"><span>${esc(account.email)}</span><span class="profile-verified">Email verificata</span></div>`:''}
    <div class="profile-grid">
    ${showEmailForm?`<section class="account-settings profile-card">
      <h2>${account.pendingEmail?'Verifica la tua email':'Indirizzo email'}</h2>
      ${account.pendingEmail?`<p class="intro">Link inviato a ${esc(account.pendingEmail)}.</p>`:''}
      <form id="profile-email"><p class="error-inline" role="alert" hidden></p>
        <label class="field">Indirizzo email<input type="email" name="email" required maxlength="254" autocomplete="email" value="${esc(account.pendingEmail||'')}"></label>
        ${account.email?'<label class="field">Password attuale<input type="password" name="current" required autocomplete="current-password"></label>':''}
        <button class="primary" type="submit">${account.pendingEmail?'Invia di nuovo il link':'Invia il link di verifica'}</button>
      </form>
    </section>`:''}
    ${onboarding?'':'<section class="account-settings profile-card profile-appearance" id="profile-appearance"></section><section class="account-settings profile-card"><details class="profile-password"><summary>Cambia password</summary><form id="profile-password"><p class="error-inline" role="alert" hidden></p><label class="field">Password attuale<input type="password" name="current" required autocomplete="current-password"></label><label class="field">Nuova password<input type="password" name="password" minlength="12" maxlength="72" required autocomplete="new-password"></label><button class="primary" type="submit">Aggiorna la password</button></form></details></section>'}
    </div>
    <div class="profile-footer"><button id="logout" type="button" data-theme-menu="Esci">Esci dall’account</button></div>
  </section>`;
  if(!onboarding)window.SectorTheme.mount(main.querySelector('#profile-appearance'));
  if(showEmailForm)bindForm('profile-email',async form=>{
    const response=await api('emailSet',Object.fromEntries(new FormData(form)));
    if(response.mailFailed)history.replaceState(history.state,'','#profilo');
    await refresh();
    if(response.mailFailed){notify('Invio non riuscito. Puoi richiedere un nuovo link tra un minuto.',true);return;}
    if(onboarding&&openLoginDestination())return;
    notify(state.account.pendingEmail?'Link di verifica inviato.':'L’indirizzo è già verificato.');
  });
  if(!onboarding)bindForm('profile-password',async form=>{await api('passwordChange',Object.fromEntries(new FormData(form)));form.reset();notify('Password aggiornata.');});
  main.querySelector('#logout').onclick=async event=>{
    if(typeof builderDiscard==='function'&&!builderDiscard())return;
    const button=event.currentTarget;button.disabled=true;
    try{await api('logout',{});location.hash='classifica';await refresh();}catch(error){notify(error.message,true);button.disabled=false;}
  };
}

function openArmyLists(lists,title){
  document.getElementById('army-list-reader')?.close();
  const reader=document.createElement('dialog');
  reader.id='army-list-reader';reader.className='army-list-reader';
  reader.setAttribute('aria-labelledby','army-reader-title');
  reader.innerHTML=`<div class="reader-head"><h2 id="army-reader-title">${esc(title)}</h2><button type="button" data-close>Chiudi</button></div><label>Lista<select aria-label="Scegli la lista">${lists.map((list,index)=>`<option value="${index}">${esc(name(list.player))} · ${esc(list.title)}</option>`).join('')}</select></label><p role="status"></p><pre tabindex="0" aria-label="Testo della lista" hidden></pre><a hidden>Scarica TXT</a>`;
  document.body.append(reader);
  const select=reader.querySelector('select'),status=reader.querySelector('[role="status"]'),text=reader.querySelector('pre'),download=reader.querySelector('a');
  let request;
  async function load(){
    request?.abort();const controller=new AbortController();request=controller;
    text.textContent='';text.hidden=download.hidden=true;
    const list=lists[Number(select.value)];
    if(!list){status.textContent='Nessuna lista condivisa disponibile.';return;}
    status.textContent='Caricamento della lista…';
    try{
      const response=await fetch(list.url,{signal:controller.signal});
      if(!response.ok) throw new Error();
      const content=await response.text();if(controller.signal.aborted)return;
      text.textContent=content;text.hidden=download.hidden=false;download.href=list.url;status.textContent='';
    }catch(error){if(!controller.signal.aborted)status.textContent='Lista non disponibile. Riprova.';}
  }
  select.onchange=load;
  reader.querySelector('[data-close]').onclick=()=>reader.close();
  reader.addEventListener('close',()=>{request?.abort();reader.remove();},{once:true});
  reader.addEventListener('click',event=>{if(event.target!==reader)return;const box=reader.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)reader.close();});
  reader.showModal();load();
}

function recentMatchRow(match){
  const photo=match.photo?`<button class="small-button" data-photo="${esc(match.photo)}" type="button" aria-label="Vedi foto della partita tra ${esc(name(match.a))} e ${esc(name(match.b))}">Foto</button>`:'<span class="muted" aria-label="Nessuna foto">—</span>';
  const canChange=!match.leagueLocked&&(state.user.admin||match.by===state.user.id);
  const lists=(state.readableLists||[]).some(list=>list.match===match.id)?`<button class="small-button" type="button" data-match-lists="${esc(match.id)}">Liste</button>`:'';
  return `<tr class="${match.void?'cancelled':''}"><td>${dateLabel(match.date)}</td><td>${esc(name(match.a))}</td><td><strong class="result">${match.scoreA} – ${match.scoreB}</strong>${match.void?'<br><small>Annullata</small>':''}</td><td>${esc(name(match.b))}</td><td>${esc(match.mission||'—')}</td><td class="match-photo">${photo}</td><td><div class="match-actions">${lists}${canChange?`<button class="small-button" data-void="${esc(match.id)}" data-value="${!match.void}" type="button">${match.void?'Ripristina':'Annulla'}</button>`:''}</div></td></tr>`;
}


function openLoginDestination(){
  const next=new URLSearchParams(location.search).get('next');
  if(!next || !/^campionato\.php\?id=[a-f0-9]{24}(?:&fixture=[a-f0-9]{24})?$/.test(next)) return false;
  location.assign(next);
  return true;
}

function auth(){

  const setup=state.setup;

  const emailInvite=!setup&&page()==='invito';
  const register=!setup&&(page()==='registrati'||emailInvite);



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

              ? (emailInvite?'Crea il tuo account con l’indirizzo a cui è stato inviato l’invito.':'Crea il tuo account personale con il codice ricevuto da un amico.')

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

          ${setup||register?'Nome utente':'Nome utente o email'}



          <input

            name="username"

            required

            ${setup||register?'minlength="3" maxlength="32"':'maxlength="254"'}

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

          setup||(register&&!emailInvite)

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



        ${register&&!emailInvite&&state.mailEnabled?'<label class="field">Indirizzo email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>':''}

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

            ${!register&&state.mailEnabled?'<a href="#recupera-password">Password dimenticata?</a>':''}
            </div>

          `

      }



    </section>

  `;



  bindForm(

    'auth-form',

    async form=>{

      const data=Object.fromEntries(new FormData(form));
      if(emailInvite){
        data.inviteToken=new URLSearchParams(location.hash.split('?')[1]).get('token')||'';
        if(!data.inviteToken) throw new Error('Apri il link personale ricevuto per email.');
      }

      const response=await api(

        setup

          ? 'setup'

          : register

            ? 'register'

            : 'login',

        data

      );



      history.replaceState(history.state,'',response.mailFailed?'#profilo':'#classifica');
      await refresh();
      if(response.mailFailed) {
        notify('Account creato. Invio non riuscito, puoi richiedere un nuovo link dal Profilo.',true);
        return;
      }
      if(!state.needsEmail) openLoginDestination();

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



function leagueLink(league){
  return 'campionato.php?id='+encodeURIComponent(league.id);
}

function leagueBanner(){
  const active=state.leagues.filter(league=>!league.closed && !league.paused);
  const league=active.find(league=>league.joined) || active.find(league=>!league.start);
  if(!league && (active.length || !state.user.admin)) return '';
  const label=!league ? 'Organizza il campionato' : !league.start && !league.joined
    ? 'Iscriviti al campionato' : 'Vai al campionato';
  const status=league?.start ? 'Calendario pubblicato' : league?.joined
    ? 'Iscrizione confermata' : league ? 'Iscrizioni aperte' : '';
  return `<aside class="league-banner" aria-labelledby="league-banner-name">
    <div class="league-banner-copy">
      <strong id="league-banner-name">${esc(league?.name || 'Campionato Warhammer 40.000')}</strong>
      ${status ? `<span class="league-banner-status">${status}</span>` : ''}
    </div>
    <a class="button primary league-banner-link" href="${league ? leagueLink(league) : 'campionato.php?new=1'}">
      ${label}<span aria-hidden="true">→</span>
    </a>
  </aside>`;
}

function leaguesPage(){
  const groups=[
    ['In corso',league=>league.start && !league.closed && !league.paused],
    ['Da iniziare',league=>!league.start && !league.closed && !league.paused],
    ['In pausa',league=>league.paused && !league.closed],
    ['Conclusi',league=>league.closed]
  ];
  main.innerHTML=`<section class="panel league-directory">
    <div class="heading"><h1>Campionati</h1>
      ${state.user.admin ? '<a class="button primary" href="campionato.php?new=1">Crea campionato</a>' : ''}
    </div>
    ${state.leagues.length ? groups.map(([title,filter])=>{
      const leagues=state.leagues.filter(filter);
      if(!leagues.length) return '';
      return `<section class="league-group"><h2>${title}</h2><ul>
        ${leagues.map(league=>`<li><a href="${leagueLink(league)}">
          <strong>${esc(league.name)}</strong>
          <small>${league.entrants} ${league.entrants===1?'iscritto':'iscritti'}${league.joined?' · Sei iscritto':''}</small>
          <span aria-hidden="true">→</span>
        </a></li>`).join('')}
      </ul></section>`;
    }).join('') : empty('trophy','Nessun campionato','I campionati compariranno qui all’apertura delle iscrizioni.')}
  </section>`;
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



              <th scope="col">Foto</th>

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

                .map(recentMatchRow).join('')

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



  document.querySelectorAll('[data-match-lists]').forEach(button=>button.onclick=()=>openArmyLists((state.readableLists||[]).filter(list=>list.match===button.dataset.matchLists),'Liste della partita'));

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

      ${state.mailEnabled?`<section class="account-settings">
        <h2>Invito via email</h2>
        <form id="email-invite-form">
          <p class="error-inline" role="alert" hidden></p>
          <label class="field">Email del giocatore<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
          <button class="primary" type="submit">Invia invito via email</button>
        </form>
      </section>`:''}



      <div class="actions">

        <a href="#classifica">

          Torna alla classifica

        </a>

      </div>



    </section>

  `;



  if(state.mailEnabled) bindForm('email-invite-form',async form=>{
    const response=await api('invite',Object.fromEntries(new FormData(form)));
    if(response.mailFailed) throw new Error('Invio non riuscito. Puoi inviare un nuovo invito.');
    form.reset();
    notify('Invito inviato via email.');
  });

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
