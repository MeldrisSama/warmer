# Verifica Build / Play — 18 novembre 2026

## Aggiornamento: schede, keyword e stratagemmi

**65/65 test passati** nella suite finale, inclusi sei nuovi controlli datasheet e la deduplicazione degli stratagemmi nei gruppi attached. Verificati lookup con parametri/qualifiche e abilità della stessa unità, escaping, dialogo per ID con focus restituito (DOM simulato), vecchi cataloghi e campi operativi/costi aggiuntivi degli stratagemmi. Sintassi PHP valida; diff senza errori di whitespace.

Catalogo reale v4 `2026-11-12 23:45:38 · b4-fd48d597`: 35 regole core, 1.487 voci, 1.407 ricette, 1.635 taglie, picco PHP 108 MiB con limite 128 MB. Audit di presentazione: 8.343 / 8.347 occorrenze di keyword risolte, quattro BLINDING LIGHT sull'Auriferous Orb senza testo nella fonte disponibile. Non certifica ogni regola o l'automazione completa. Banner ancora da integrare, nessuna fonte remota adatta verificata.

Anteprima SQLite aggiornata via API autenticata con il nuovo catalogo; due armate preesistenti confrontate integralmente e preservate. Nessuna armata/default di prova creata. Server temporaneo 8800 arrestato; listener preesistente 8799 non toccato.

Snapshot Play rigenerato con le template reali. Nuovo tentativo frontend con Edge: **GATE: ERROR (consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: check: timed out))**. Nessuna riesecuzione dopo ERROR. WARN copy-stat-strip sui valori dei profili; vecchie waiver senza risultati corrispondenti. Non attestata verifica visiva responsive/interattiva né un nuovo PASS. Controllare localmente schede, scorrimento tabelle, apertura keyword da tastiera/tocco e stratagemmi. Nessun push o deploy.

## Aggiornamento precedente: regole, dotazioni, default, effetti, alleati ed export

**58/58 test passati** nella suite completa aggiornata. Nuovi controlli PHP/JS e HTTP: conversione sicura del testo operativo, ricette per sottogruppi, compensazione Chainfist/Power Fist e quantità delle modalità, cambio taglia, persistenza e isolamento dei default, contingenti sbloccati da distaccamenti, rimozione delle autorizzazioni, valori base immutati e ricalcolo degli effetti, condizioni da attivare esplicitamente, formati TXT e copia negli appunti.

Verifica separata del catalogo reale con limite PHP 128 MB: **1.487 voci**, composte da 1.483 schede originali e quattro rappresentazioni Titanicus Traitoris; **1.407 ricette** di dotazione, **1.635 taglie** percorse, **234 record di effetti da abilità**, **101 concessioni di alleati** sui 36 contesti di fazione/capitolo. Picco osservato finale **108 MiB**. I record degli effetti non sono un conteggio di regole uniche: alcune abilità sono condivise fra più schede. Le ricette con tutte le righe di opzioni riconosciute sono 797, incluse le schede senza opzioni. Le altre hanno avvisi e possibilità di configurazione manuale; 80 voci restano senza dotazione guidata. Non è attestata la copertura completa di tutte le restrizioni o degli effetti in prosa.

L’importazione conserva separatamente i dati storici. Le nuove versioni hanno `featuresVersion: 3` e un identificativo della conversione nella versione. Le liste già salvate non vengono riscritte; una copia nel catalogo attivo è una bozza esplicita e verifica le corrispondenze dei dati selezionati. Il default è personale e separato dai dati delle liste. Nessun test sul database configurato nel repository.

La matrice degli alleati e i limiti sono in [builder-alleati.md](builder-alleati.md). Verificati in particolare Deathwatch Support disponibile fuori da Deathwatch, schede Astartes corrette e limite 500 punti, concessioni separate per Imperial Agents, legioni demoniache specifiche non incluse incondizionatamente nelle fazioni native, Brood Brothers/Final Day, Questor Forgepact, Iconoclast Fiefdom, Shadow Legion, Devoted of Ynnead e sostituzione della regola Corsairs and Travelling Players con Reaper’s Wager.

Snapshot delle template aggiornati con il nuovo catalogo. **GATE: ERROR (consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: check: timed out)).** Il nuovo tentativo con Edge è andato in timeout; non è stato rieseguito dopo l’errore. Il WARN copy-stat-strip riguarda numeri dei profili/costi nell’editor. Le vecchie eccezioni non corrispondevano a nuovi risultati del gate. Nessuna nuova attestazione di responsive, clipboard nativa, focus o interazioni su un browser/dispositivo reale; i test automatici relativi a UI e appunti sono simulati.

L’export GW app è testo leggibile, senza promessa di importazione nell’app ufficiale. WTC e Short sono impaginazioni testuali; non costituiscono certificazione di accettazione a un torneo. Il fallback degli appunti mostra testo selezionabile invece di fingere una copia riuscita. MySQL, IIS e pubblicazione non verificati. Nessun push o deploy.

## Aggiornamento: creazione guidata, distaccamenti e Play

Seconda tranche: creazione con gruppi Xenos/Chaos/Imperium/Adeptus Astartes e formati prima dell’editor; popup nativo dei distaccamenti con selezione, DP, Unique, regole consultabili e disposizione; categorie ordinate; destinazioni Leader/Support compatibili dal catalogo. Onslaught 3000 è un formato richiesto dal gruppo con DP espliciti, non un nuovo budget ufficiale inventato. Verificati 1000/2 DP, 2000/3 DP e l’eccezione Incursion con un solo distaccamento da 3 DP sulle fonti indicate in builder.md.

Rimossa l’animazione che veniva riapplicata a ogni ridisegno. La ricerca aggiorna solo l’elenco del catalogo, mantenendo il campo e gli altri pannelli. Quantità armi con −/+ e limite inferiore zero. Play presenta insieme tutti i modelli, poi tutte le armi ranged, tutte le melee e infine le regole, con provenienza dei membri. Un Support senza associazione è un errore esplicito nel client e nell’API; la bozza resta salvabile e il passaggio a Play è bloccato finché l’associazione manca.

**48/48 test passati**, con controlli aggiunti per gruppi e formati, ricerca senza ridisegno della pagina, quantità, ordinamento delle sezioni Play, errore Support, filtro delle destinazioni e popup che resta aperto durante selezione/deselezione e ripristina il focus alla chiusura. Questi ultimi sono test con DOM simulato, non una prova interattiva in un browser reale. Nuovi snapshot reali delle template: creazione, popup distaccamenti e configurazione armi, oltre ad archivio/Build/Play.

**GATE: ERROR (consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: check: timed out)).** Nuovo tentativo per questa tranche con Edge esplicitamente configurato; nessun nuovo PASS visivo. Il gate chiede di non rieseguirlo dopo l’errore. Un WARN copy-stat-strip riguarda i conteggi degli eserciti nelle quattro sezioni, dati dell’interfaccia. Le cinque eccezioni del rapporto storico non hanno corrisposto a nuove segnalazioni e non costituiscono verifiche superate. Verifica responsive e interattiva reale ancora da completare.

## Aggiornamento: archivio liste

Prima tranche delle correzioni autorizzata e applicata sul branch `builder-build-play`: ingresso nell’archivio personale, creazione 11ª con fazione giocabile, apertura con catalogo storico, ritorno protetto dalle modifiche non salvate, ordinamenti per fazione/creazione/ultima modifica. Ultima modifica è l’ordinamento predefinito, secondo la precisazione dell’utente. La creazione è assegnata dal server e conservata nel payload; non richiede una migrazione SQL e resta sconosciuta per le liste storiche prive del campo. Unbound Adversaries è esclusa dalle nuove liste del nuovo editor, anche lato server; le liste esistenti restano accessibili. Eliminato il selettore «Fazione da consultare». Configurazione distaccamenti mantiene apertura e focus durante gli aggiornamenti; etichetta «DP» e scelte disabilitate attenuate.

**39/39 test passati** sul codice aggiornato: sette test UI con VM, modello PHP e regressioni HTTP su SQLite temporaneo. Coperti ingresso, ordinamenti, escaping, creazione, date assegnate dal server, date storiche mancanti, apertura dei cataloghi originali, modifiche non salvate negli editor nuovo e storico, ripristino backup come nuova lista, blocco di operazioni concorrenti durante l’import e isolamento dei proprietari. Verificato anche il server dell’anteprima esistente: HTTP 200, autenticazione e lettura delle due liste già presenti con metadati corretti. Nuovo script `scripts/start-builder-preview.cjs` verificato per aggiornare e avviare quella cartella su 8799, senza ricreare database/account/liste. Nessun push o deploy.

**GATE: ERROR (consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: no Chrome found (set CHROME_PATH))).** Il gate non è stato rieseguito, come richiesto dal suo messaggio. Generati snapshot delle template aggiornate, incluso archivio, ma il controllo responsive e la prova interattiva completa in un browser non sono attestati come superati. Il rapporto storico sotto riguarda il commit precedente e non valida questa modifica.

## Rapporto storico sul primo Build / Play

**GATE: OPEN 16 (rounds used up).** Il gate della skill frontend non è passato; non viene presentato come superato. La pagina segue il requisito esplicito dell'utente: editor operativo a tre pannelli e stile Cangiolone, con due modalità della stessa lista.

## Verifiche funzionali

- 31 test passati: regressioni esistenti e nuovi controlli Build/Play, inclusi prezzi per copie, attachment senza doppio conteggio, quantità armi, potenziamenti, Unique, disponibilità DP e Force Disposition, cicli e riferimenti invalidi, escaping, proprietà delle armate e round trip SQLite.
- Importazione reale di 1.483 schede, 2 escluse perché virtuali o relative a fonti precedenti/fazione assente. CSV del 12 novembre 2026; tag Unique acquisiti dalle pagine di fazione il 18 novembre. Dati originali e JSON generato conservati nello workspace esterno, fuori Git.
- Prova HTTP con l'applicazione reale in una copia isolata: setup, import del catalogo completo, lettura dello snapshot, salvataggio e riapertura di una lista con leader attached e quantità armi. Nessun accesso al database configurato nel repository o sul sito.
- Normalizzazione e serializzazione dell'intero catalogo verificate con `memory_limit=128M`, picco misurato 84 MiB. L'importatore CSV usa 512 MB per le tabelle intermedie. Catalogo ottimizzato di circa 7,8 MB, compatibile con il limite POST PHP standard di 8 MiB per lo snapshot verificato.

## Frontend e strumenti

Applicata la skill `design-taste-frontend`: gerarchie, coerenza dei controlli, bordi, allineamenti, contrasto, microfeedback, focus e reduced motion. Palette e font conservati dal sito: verde scuro, avorio, oro, Georgia/Arial. Nessuna fotografia, effetto, palette estranea o dipendenza aggiunta. Voce: istruzioni operative in italiano, nomi delle schede dalla fonte.

Verifica `consistency.mjs` su 1440, 1024, 820, 768 e 390; tre giri del gate e screenshot con gli strumenti della skill. Gli screenshot sono snapshot statici delle vere template di produzione, con un catalogo reale, separati dalla prova funzionale delle API. Non sono simulazioni di avvenute interazioni nel browser. I risultati locali sono in `.taste-skill`, ignorata da Git.

Correzioni applicate dopo il controllo: focus sui summary, accesso da tastiera alle tabelle scorrevoli, skip link, pulsanti senza etichette spezzate su telefono, allineamento del footer, stato selezionato dei pannelli mobile. Nessuna modifica ai file della skill.

Screenshot finali controllati a 1440, 1024, 820, 768 e 390; Play anche a 1440 e 390. `perf.mjs` sullo snapshot Build: **PASS, 0 FAIL e 0 WARN**, layout shift 0.000 e nessuna richiesta fallita. Questa misura riguarda lo snapshot renderizzato, non il trasferimento iniziale del catalogo completo tramite API.

### Cinque eccezioni dichiarate nel gate

1. `copy-slop-word`: Supercharge è il nome reale di un profilo d'arma, non testo promozionale da riscrivere.
2. `text-only`: il contenuto è l'interfaccia di un editor, richiesta dall'utente, senza hero promozionale.
3. `card-visual`: le righe dell'armata contengono nome, quantità e punti; non richiedono immagini.
4. `copy-actions`: il comando di aggiunta su ogni unità non è una CTA ripetuta di una landing page.
5. `overlap-text`: il controllo confronta discendenti esterni allo scrollport con la libreria sottostante. Gli screenshot mostrano il clipping corretto del catalogo.

### Sedici segnalazioni ancora aperte

| Controllo | Posizione | Valutazione |
| --- | --- | --- |
| off-grid | input nome armata, 1440 | Padding interno della barra, intenzionale |
| moment-none | pagina, 1440 | Nessun effetto promozionale nel tool richiesto |
| hero-screen | workbench, 1440 | L'editor non ha una hero |
| section-height | footer, 1440 | Footer compatto del sito |
| section-height | workbench, 1440 | Editor con pannelli scorrevoli |
| one-section | footer, 1440 | Non è una sezione promozionale a schermo intero |
| one-section | toolbar, 1440 | Barra operativa dell'editor |
| one-heading | titolo catalogo, 1440 | Titoli dei tre pannelli contemporanei richiesti |
| container-edges | header, 1440 | Contenitore esistente del sito, senza `.wrap` della skill |
| container-edges | workbench, 1440 | Griglia operativa propria del progetto |
| container-edges | footer, 1440 | Contenitore esistente del sito |
| container-edges | shell, 1440 | Contenitore esistente del sito |
| container-edges | titolo dettaglio, 1440 | Titolo interno al terzo pannello |
| container-edges | titolo roster, 1440 | Titolo interno al pannello centrale |
| nav | brand dello snapshot, 390 | Lo snapshot mostra l'editor senza il menu autenticato dell'app |
| container | pagina, 1440 e 390 | Layout Cangiolone, non il contenitore marketing del kit |

129 WARN residui del gate, soprattutto contenuti che continuano oltre la prima schermata/scrollport e densità del testo delle regole. Non sono attestati come risolti. I profili su telefono possono scorrere orizzontalmente dentro la tabella; la pagina mantiene il layout verticale.

## Limiti pratici

Dotazioni e quantità dei profili vanno configurate esplicitamente; nessuna interpretazione automatica delle sostituzioni scritte in prosa. I costi per equipaggiamenti e le tariffe non interpretate si includono nel prezzo base manuale. Restano manuali gli alleati, le eccezioni di attachment, i vincoli dei potenziamenti e i modificatori condizionali. Unique e scelta della disposizione sono invece controllati anche sul server. Nessuna lista viene certificata come completamente legale.

Non verificati: dispositivo iPhone/Android reale, MySQL, hosting IIS, offline/PWA, distribuzione sul sito. Nessun push o rilascio eseguito. Il controllo visivo automatico su snapshot non sostituisce una prova interattiva completa del browser con una lista reale del gruppo.
