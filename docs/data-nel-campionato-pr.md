# Data futura direttamente nel campionato

Nella sezione Campionato, ogni incontro ancora da disputare dei due partecipanti espone il pulsante Programma data. Il pulsante apre i dettagli e porta il focus al campo della data futura.

Il pannello Programma la partita si trova immediatamente prima dei punti e della registrazione del risultato. È disponibile anche quando le liste non sono state consegnate. I campi distinguono Data futura proposta e Data effettiva della partita.

L’avversario continua a dover approvare la proposta prima della pubblicazione nel calendario. Permessi e regole del campionato restano invariati.

## Verifiche

21 test superati nelle suite calendario e profili. Controllati posizione del pannello, disponibilità senza liste, apertura/focus del pulsante, privacy degli osservatori e flussi API esistenti. Sintassi JavaScript e git diff --check superati. Nessuna verifica visuale nel browser.

## Applicazione con GitHub Desktop

Base: main aggiornato, commit 79b272a623e412a832a20e5f86bc20ffd7bbc366.
Nuovo branch: fix/data-nel-campionato.

1. Estrai lo ZIP fuori dal repository.
2. Aggiorna main e crea il nuovo branch.
3. Copia le cartelle Cangiolone.com, tests e docs dallo ZIP nel repository, unendo le cartelle.
4. Crea il commit e pubblica il branch. Usa questo documento come descrizione PR.

Sono modificati solo due file applicativi: campionato.js e campionato.css. Non ci sono modifiche a database o configurazione. La patch inclusa contiene anche test e documentazione. Nessun deploy è stato eseguito.
