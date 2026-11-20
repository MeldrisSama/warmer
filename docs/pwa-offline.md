# PWA e liste offline

Nome previsto per il sito principale e l'app installata: **Cronache del settore**. Il pacchetto di prova mantiene **Cangiolone TEST**. Il logo definitivo fornito dall'utente è conservato in [design/cronache-del-settore-logo.png](../design/cronache-del-settore-logo.png), con trasparenza originale. Le icone PWA 192 e 512 px derivano da questa immagine, ridimensionata integralmente su fondo nero per le schermate Home. Sono dichiarate `any`, senza promettere un ritaglio `maskable` che taglierebbe le ali. La prova conserva le proprie icone TEST.

La PWA è la stessa applicazione PHP/JavaScript, installabile tramite il browser. Il manifest apre `index.php#builder` in modalità standalone nel percorso dell'applicazione, anche sotto `/warhammer/`. L'offline si attiva automaticamente solo all'apertura dall'icona; nella scheda normale del browser richiede connessione. Il riconoscimento standalone è una scelta di interfaccia, non una barriera di autorizzazione: le API mantengono autenticazione, proprietà e CSRF.

## Comportamento

- Dopo il primo accesso online, vengono scaricati l'interfaccia, il catalogo completo attivo, tutte le proprie liste e i cataloghi necessari alle versioni storiche. «Disponibile offline» compare solo dopo il completamento dei dati e dell'installazione del service worker.
- Archivio, creazione, modifica, salvataggio, schede e regole dell'editor funzionano anche riaprendo l'app senza rete. Il salvataggio esplicito viene confermato solo dopo il commit IndexedDB. Restano gli avvisi sulle modifiche non salvate dell'editor.
- Play è disponibile offline nella PWA, con profili, armi, regole e stratagemmi del catalogo scaricato. Classifiche, campionati, registrazione partite, profilo e funzioni amministrative richiedono connessione. Foto, allegati, pagine del campionato e risposte delle API non entrano mai nella cache del service worker.
- Il salvataggio PWA scrive prima sul dispositivo. Al ritorno della rete, all'apertura/rientro nell'app e dal pulsante Sincronizza viene verificato l'account e avviato l'allineamento. Non dipende da Background Sync, non disponibile su tutti i dispositivi.
- Se la lista cambia solo da una parte, si allinea automaticamente. Se entrambe le parti cambiano, oppure una parte elimina e l'altra modifica, la coda rimane sospesa per quella lista. Un avviso porta all'archivio, dove si possono confrontare i salvataggi e scegliere dispositivo oppure online, comprese le eliminazioni. Nessuna fusione automatica o copia imposta all'utente.
- Cataloghi, versioni, date e punti sono esclusi dal confronto del contenuto utente. Alla sincronizzazione le liste compatibili passano automaticamente al catalogo attivo e ricalcolano i punti. Se una scheda/dotazione è rimossa o cambia identità, si conserva l'intera lista con il catalogo precedente e un avviso da rivedere. Il cambio di catalogo non apre il dialogo dei conflitti.

## Persistenza e sincronizzazione

`offline.js` usa IndexedDB (`sector-offline`, versione 1) per cataloghi separati per account/versione e record delle liste con revisione di partenza, operazione, generazione locale e conflitto eventualmente sospeso. Scritture transazionali; Web Locks serializza i sincronizzatori dello stesso account quando disponibile. Un salvataggio avvenuto durante una richiesta già in corso mantiene la propria generazione e viene ritentato. La risposta del server aggiorna la revisione di partenza anche per un editor che ha ricevuto ulteriori modifiche.

`builder-sync.php` riutilizza la validazione esistente dentro una transazione. La revisione è un hash del contenuto della lista e l'operazione salvata rende sicuro il nuovo tentativo dopo la perdita della risposta. MySQL usa `SELECT ... FOR UPDATE` sulle righe esistenti; SQLite è utilizzato nei test. Nessuna migrazione di schema: l'identificativo dell'ultima operazione e l'eventuale avviso catalogo sono metadati nel payload. Gli endpoint di lettura usati dalla sincronizzazione controllano anche l'account atteso, evitando di scaricare dati di un account appena cambiato nel contenitore dell'altro.

Il token CSRF e la sessione completa non vengono salvati offline. Sul dispositivo resta l'identità minima necessaria per riaprire le liste del precedente accesso; le copie locali non sono cifrate dall'app. Il logout online rimuove l'accesso automatico offline, conservando le modifiche in coda per un successivo accesso allo stesso account. Nessun invio della coda se l'account della sessione è diverso o non autenticato. Il browser può rifiutare la richiesta di storage persistente o l'utente può cancellare i dati: mantenere il backup JSON per le liste importanti.

`service-worker.php` genera la revisione dell'interfaccia dai contenuti e preinstalla solo una lista esplicita di asset con gli stessi hash completi usati da `assetUrl`. Un aggiornamento parziale non prende il controllo della vecchia app. Le vecchie cache dell'interfaccia vengono rimosse all'attivazione del nuovo worker; IndexedDB, cookie e preferenze non vengono azzerati. La navigazione offline è limitata alla pagina principale nel percorso dell'app.

## Rilascio e verifiche

Caricare prima i nuovi file PHP/JS, il manifest e `assets/pwa/icon-192.png` / `icon-512.png`, poi le pagine d'ingresso; conservare gli hash degli asset. Includere `web.config` per il MIME `.webmanifest` su IIS. Richiede HTTPS sul sito reale e il service worker nello stesso percorso di `index.php`. Non cambiare configurazione, cataloghi o database per installare la PWA. La nuova funzione necessita sia dei file client sia dell'endpoint di sincronizzazione.

Test modello: `node --test tests/offline.test.cjs`. Suite completa: `node --test tests/*.test.cjs` con PHP 8.1+, PDO SQLite e Node 22+.

Prova browser: `node scripts/check-pwa-browser.cjs [catalogo-reale.json]` con PHP_BINARY e Chromium installato (CHROME_PATH opzionale). Usa copia applicativa, account e SQLite isolati in `.taste-skill`, nessuna configurazione o upload di produzione. Verifica il percorso annidato `/warhammer/`, avvio offline in una nuova pagina, creazione/modifica/salvataggio, riconnessione, confronto e scelta del conflitto, cambio account, aggiornamento punti, esclusioni della cache e viewport 390/1440. La modalità standalone viene simulata nel browser reale: restano da provare installazione/apertura fisiche su Android e iPhone e MySQL concorrente sullo stesso database di prova.

## Sincronizzazione automatica e avanzamento

La PWA controlla sempre i dati all'avvio, al ritorno in primo piano (pageshow, focus e visibilità), all'ingresso nel builder e dopo ogni salvataggio/eliminazione. Eventi di apertura ravvicinati condividono il controllo già in corso; una modifica locale durante il controllo richiede un altro passaggio al termine, per non perdere la coda. Senza connessione il salvataggio resta sul dispositivo e il passaggio viene avviato al ritorno online.

Il controllo delle liste è indipendente dalla preparazione del service worker. Confronta subito le revisioni delle copie locali modificate con quelle online e segnala conflitti anche fuori dall'archivio, prima di scaricare cataloghi. Le versioni di catalogo restano escluse dal confronto. Le copie già salvate sono consultabili durante il controllo, conservando le modifiche non salvate dell'editor.

Una fascia visibile in tutte le pagine della PWA mostra la fase corrente e l'avanzamento: numero reale dei file per la preparazione dell'app, byte ricevuti per il catalogo, numero di liste per gli invii. Le fasi senza una dimensione totale nota usano un progress indeterminato. I byte della risposta decompressa non vengono confrontati con il Content-Length compresso. I download del catalogo hanno un timeout più ampio rispetto alle operazioni normali. Conferma finale ed errori sono espliciti; l'ultima sincronizzazione riuscita include i secondi e non avanza se restano modifiche/conflitti o in caso di errore.

L'endpoint builderCatalog con metadata=1 restituisce ID e revisione leggera, senza schede. La revisione comprende payload e sorgenti delle riparazioni runtime: un catalogo già disponibile con la stessa revisione non viene riscaricato ad ogni salvataggio. Cache e database offline già presenti vengono mantenuti.


## Categorie, navigazione e risoluzione dei conflitti

Epic Hero, Character e Other restano sezioni distinte dell’armata su telefono e PC; gli alleati sono in Other anche nel catalogo mobile, mantenendo l’etichetta del contingente e i filtri. I gruppi attached restano uniti sotto la propria unità principale. Il menu Army Builder apre l’archivio se si è già nel builder (con conferma per abbandonare modifiche non salvate); arrivando da altre sezioni riprende la vista e l’armata precedenti.

Le notifiche di perdita/ripristino connessione sono in alto e richiudibili con ×. Una notifica chiusa non ricompare nei successivi render o salvataggi fino al cambio di connessione. La fascia di attività è visibile durante i lavori e per una breve conferma finale; senza rete a riposo resta soltanto la notifica richiudibile. Errori e dettagli delle code rimangono nell’archivio.

Sei SVG originali animati sostituiscono le barre: ingranaggio e auspex, stella del Caos e fenditura Warp, glifo Necron e denti/bulloni Orki. Una scelta casuale per sincronizzazione, mantenuta durante i cambi di fase; testo, MB/contatori e percentuali note rimangono visibili. Rispetto di prefers-reduced-motion e SVG decorativi aria-hidden.

I conflitti aprono automaticamente un dialog grande, con dispositivo e online affiancati (in colonna sul telefono), confronto leggibile, date ed esplicita scelta confermata. Nessuna scelta predefinita. Finché online il popup richiede risoluzione; se la connessione manca può essere chiuso per continuare offline, con entrambe le versioni conservate. Le modifiche non salvate nell’editor vengono incluse scegliendo la versione del dispositivo, oppure abbandonate solo dopo conferma scegliendo online. Account differenti e cataloghi non generano questo popup.


La sezione manuale «Sincronizza ora» è stata rimossa dall’archivio PWA: i controlli automatici, le notifiche in alto e il dialog dei conflitti coprono il flusso. Nel browser normale rimangono soltanto le istruzioni di installazione. L’eventuale richiesta di accedere di nuovo è nella fascia di errore globale.
