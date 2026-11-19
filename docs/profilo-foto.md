# Profilo, navigazione e ultime partite

Le correzioni generali del sito sono separate dal lavoro sulle schede del builder.

Il profilo si apre dall'icona utente in alto a destra; il pulsante Esci si trova nella pagina Profilo. L'icona è presente anche nell'intestazione della pagina campionato. La pagina raccoglie nome utente, ruolo ed email verificata, temi/colori e cambio password in una sezione espandibile. L'immagine profilo personalizzata è una preferenza futura: non è stato aggiunto un caricamento immagini.

Se l'email è già verificata non viene mostrato il modulo per inviare link di verifica. Il modulo resta disponibile per indirizzi mancanti o in attesa, compresa una modifica indirizzo ancora da confermare. Rimangono il flusso di onboarding e le verifiche della password del server.

La vecchia sezione Liste è stata rimossa dalla navigazione e dal renderer. I vecchi collegamenti `#liste` portano al List Builder. Non vengono cancellati file o dati storici, né rimosse le liste consegnate nei campionati.

In Ultime partite, Foto è una colonna autonoma. I comandi Annulla/Ripristina sono in una cella distinta e rispettano i permessi e il blocco degli incontri di campionato. Il contenitore flex dei pulsanti non è più applicato a un elemento td, così celle e bordi delle righe restano allineati. Le foto continuano a usare l'endpoint autenticato esistente.

Verifiche: 38 test pertinenti passati (profilo, temi e regressione HTTP in ambiente SQLite isolato). Prova browser locale con fixture: profilo a390pixel e tabella a1440, interazioni dei temi/cambio password, form verifica assente per email confermata, sette colonne/celle coerenti e assenza di overflow orizzontale. Non verificati Safari fisico o hosting IIS/MySQL.

File applicativi modificati: app.js, style.css, campionato.php e campionato.css. Nessuna modifica a database, configurazione o file del builder. Il codice è da distribuire solo quando richiesto; non usare il pacchetto FTPS del builder per queste modifiche.
