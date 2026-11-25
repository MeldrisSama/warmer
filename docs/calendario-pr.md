# Calendario mensile e programmazione delle partite

La pagina Calendario ora presenta una griglia mensile da lunedì a domenica. Premendo un giorno si apre il modulo per programmare una partita; gli appuntamenti mostrano gli incontri previsti e il riepilogo della giornata.

## Funzioni

- Navigazione fra mesi, pulsante Oggi, filtri per campionato o partite libere e per i propri incontri.
- Creazione con almeno un giocatore, data, orario facoltativo, luogo e note.
- Secondo posto libero: un altro giocatore può premere Partecipa; il creatore può assegnare direttamente il secondo giocatore.
- Creatore, partecipanti e amministratori possono spostare o annullare un appuntamento. Soltanto creatore e amministratori possono cambiare i giocatori di una partita libera.
- Gli incontri dei campionati usano esclusivamente gli abbinamenti già pubblicati. Partecipanti e amministratori possono assegnare una data.
- Gli abbinamenti senza data restano in Data da concordare. Non vengono inventate date per le giornate.
- Incontri confermati, campionati in pausa e conclusi non possono essere riprogrammati.
- Le iscrizioni ai campionati aperti continuano a usare il modulo esistente, con esercito e roster.
- Su schermi piccoli, la griglia mostra il numero degli incontri e i dettagli si leggono nel riepilogo sotto il mese.

## Persistenza

Nuova tabella w40k_calendar_events, creata automaticamente da SectorStorage su MySQL o SQLite. Non vengono riscritti risultati, abbinamenti, roster o iscrizioni.

La programmazione è distinta dalla registrazione del risultato: non assegna punti né modifica la classifica. I risultati di campionato continuano a essere gestiti nella pagina del campionato.

L’orario è italiano. Il server impedisce due prenotazioni alla stessa ora per uno stesso giocatore, se è indicato un orario. Non viene stimata la durata delle partite. Sessione, CSRF, permessi e controllo della revisione proteggono le modifiche e l’assegnazione dell’ultimo posto libero.

## Verifiche

33 test selezionati superati:
- tests/calendar.test.cjs: griglia, filtri, escaping e API reale tramite PHP CGI con sessioni e SQLite isolato. Include creazione, partecipazione, permessi, CSRF, revisioni, date, conflitti, campionati e persistenza.
- tests/site-profile.test.cjs
- tests/theme.test.cjs
- tests/statistics.test.cjs
- tests/ui-feedback.test.cjs

Sintassi PHP/JavaScript e git diff --check superati.

La suite HTTP generale resta incompleta: le connessioni locali sono negate in questo ambiente. È stato inoltre rilevato un test preesistente che richiama standings(), funzione assente nella versione attuale.

Verifica visuale nel browser non completata: il server locale non è raggiungibile dall’anteprima e i file locali sono bloccati dalle regole del browser. Resta da verificare manualmente l’aspetto su desktop e mobile.

## Branch e pubblicazione

Base: calendario-campionati, commit b21a22bc0b42d27967de35646d8b2b18ce94714a.
Nuovo branch: feature/calendario-visuale-partite.

Finché la PR #37 è aperta, confrontare con calendario-campionati. Una PR diretta verso main comprenderà anche il primo intervento sul calendario.

Nessun deploy e nessuna modifica al database pubblicato sono stati eseguiti.

