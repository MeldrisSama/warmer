# Calendario campionati e accesso alle iscrizioni

La nuova voce Calendario mostra gli incontri di tutti i campionati, raggruppati per giornata, e permette di filtrare per campionato, stato e partecipazione personale.

I campionati con iscrizioni aperte hanno un collegamento al modulo esistente: esercito, pool e opzioni del roster continuano a essere verificati dalle regole attuali. Chi è già iscritto vede la conferma e può aprire il campionato.

Il calendario distingue incontri da giocare, risultati da confermare, partite giocate e riposi. Gli incontri dei campionati in pausa e conclusi restano consultabili. Un risultato annullato non viene presentato come valido.

Il progetto non assegna date o orari agli incontri: la pagina segue le giornate già generate e mostra la data soltanto per i risultati registrati.

## Implementazione

- Pagina autenticata index.php#calendario e endpoint GET calendar.
- Metadati derivati da leagueState; nessun testo di lista o proposta privata nella risposta.
- Iscrizione attraverso campionato.php, mantenendo autenticazione, CSRF e validazione roster esistenti.
- Collegamenti diretti agli incontri anche per chi consulta una partita altrui.
- Nessuna migrazione del database o nuova dipendenza.

## Verifiche

- node --test tests/calendar.test.cjs: 3 test superati.
- node --check su app.js e campionato.js.
- php -l su api.php.
- git diff --check.

Non sono stati eseguiti test HTTP con database né verifiche visuali su browser desktop e mobile. Prima del merge verificare l’iscrizione con e senza roster in un ambiente di prova.

## Installazione manuale

Lo ZIP contiene quattro file applicativi da copiare mantenendo i percorsi:

- Cangiolone.com/api.php
- Cangiolone.com/app.js
- Cangiolone.com/campionato.js
- Cangiolone.com/style.css

Include inoltre il test e questa descrizione. Base: main, commit ded860ca4f2de22dac360a7417874676849acab2. Non sovrascrivere eventuali modifiche successive senza confrontarle.

Branch: feature/calendario-campionati. Aprire una pull request verso main usando il titolo e il testo di questo documento. Il sito non è stato aggiornato.
