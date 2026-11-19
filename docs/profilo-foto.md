# Profilo, navigazione e ultime partite

Le correzioni generali del sito sono separate dal lavoro sulle schede del builder.

Il profilo si apre dall'icona utente in alto a destra; il pulsante Esci si trova nella pagina Profilo. L'icona è presente anche nell'intestazione della pagina campionato. La pagina raccoglie nome utente, ruolo ed email verificata, temi/colori e cambio password in una sezione espandibile. L'immagine profilo personalizzata è una preferenza futura: non è stato aggiunto un caricamento immagini.

Se l'email è già verificata non viene mostrato il modulo per inviare link di verifica. Il modulo resta disponibile per indirizzi mancanti o in attesa, compresa una modifica indirizzo ancora da confermare. Rimangono il flusso di onboarding e le verifiche della password del server.

La vecchia sezione Liste è stata rimossa dalla navigazione e dal renderer. I vecchi collegamenti `#liste` portano al List Builder. Non vengono cancellati file o dati storici, né rimosse le liste consegnate nei campionati.

In Ultime partite, Foto è una colonna autonoma. I comandi Annulla/Ripristina sono in una cella distinta e rispettano i permessi e il blocco degli incontri di campionato. Il contenitore flex dei pulsanti non è più applicato a un elemento td, così celle e bordi delle righe restano allineati. Le foto continuano a usare l'endpoint autenticato esistente.

Verifiche: 38 test pertinenti passati (profilo, temi e regressione HTTP in ambiente SQLite isolato). Prova browser locale con fixture: profilo a390pixel e tabella a1440, interazioni dei temi/cambio password, form verifica assente per email confermata, sette colonne/celle coerenti e assenza di overflow orizzontale. Non verificati Safari fisico o hosting IIS/MySQL.

File applicativi modificati: app.js, style.css, campionato.php e campionato.css. Nessuna modifica a database, configurazione o file del builder. Il codice è da distribuire solo quando richiesto; non usare il pacchetto FTPS del builder per queste modifiche.

## Lettura delle liste

Il pulsante Liste compare nelle azioni delle partite di campionato concluse; non compare accanto ai nomi dei giocatori nella classifica. Apre un popup di testo, con scelta della lista e download TXT: non apre il builder. Vengono mostrate le copie consegnate per incontri con risultato confermato e non annullato, non le bozze private del builder. Se non ci sono copie consultabili, il pulsante non compare. Le vecchie liste condivise senza collegamento a una partita non sono incluse in questa nuova vista.

Nel calendario del campionato tutti gli utenti autenticati possono leggere entrambe le liste appena entrambi i giocatori le hanno consegnate, anche prima del risultato. Una sola consegna rimane nascosta. La home non anticipa queste liste: le indicizza solo dopo la conferma del risultato. Le copie restano immutabili rispetto a successive modifiche o eliminazioni delle armate nel builder. Leggere un incontro altrui non permette di consegnare liste, proporre o confermare risultati per quell'incontro.

Questa aggiunta modifica anche api.php, league.php, storage.php e campionato.js; non richiede migrazioni o nuovi pacchetti. Lo stato generale carica soltanto metadati delle consegne, mentre il testo viene richiesto all'apertura del popup. Restano richiesti login e controlli sulle due consegne nell'endpoint di lettura.

## Verifica completa e rilascio

Branch aggiornato su main dopo la correzione della cache degli asset. Suite completa applicazione/builder/temi/HTTP: **111 test passati**. I precedenti 40 erano la selezione pertinente alle modifiche generali; i controlli dell'intero catalogo esterno restano separati e non sono compresi in questo numero. Rimangono i limiti di verifica Safari fisico e hosting MySQL/IIS.

Il pacchetto locale FTPS di questo aggiornamento contiene 10 file per `/cangiolone.com/warhammer/`: `app.js`, `campionato.js`, `style.css`, `campionato.css`, `assets.php`, `storage.php`, `league.php`, `api.php`, `campionato.php`, `index.php`. Include helper e pagine della correzione cache già presente su main, per evitare di ripristinare URL statici vecchi. Caricare dipendenze e asset prima di API e pagine di ingresso. Il pacchetto non contiene configurazioni, upload, database o cataloghi e non richiede una nuova importazione del catalogo.

Le partite confermate nel campionato attualmente vengono create senza foto: il calendario non offre un caricamento fotografico. La correzione della colonna Foto riguarda la visualizzazione delle foto esistenti nelle ultime partite della home.
