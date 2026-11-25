# Date concordate e liste nelle programmazioni

Nei dettagli di ogni incontro di campionato compare Quando giochiamo? prima della consegna delle liste. Uno dei due partecipanti propone data e orario; l’altro può approvare o rifiutare. Il proponente può aggiornare o ritirare la propria proposta.

Soltanto l’approvazione dell’avversario pubblica la data nel calendario. Durante una proposta di spostamento, la data già concordata resta visibile fino all’approvazione. Non occorre avere consegnato le liste per concordare la partita. Un amministratore esterno all’incontro non può sostituirsi all’avversario per approvare.

Nel calendario le proposte personali sono raccolte in Date da approvare. Le partite confermate hanno il pulsante Liste esercito.

## Liste nelle programmazioni

- Consegna della propria lista dal builder oppure, per partite libere e campionati senza roster obbligatorio, incolla del testo o caricamento di un file .txt UTF-8 fino a 1 MB.
- Nei campionati la consegna usa gli stessi endpoint e controlli del roster già presenti. La lista consegnata dal calendario è la stessa visibile nella pagina dell’incontro.
- Nelle partite libere ogni partecipante consegna soltanto la propria lista. Il creatore della programmazione non può consegnarla per altri.
- Le liste vengono rivelate dopo entrambe le consegne e diventano definitive. Prima della rivelazione si può sostituire la propria lista.
- Una lista proveniente dal builder viene conservata come copia, senza seguire le modifiche successive.
- Se i partecipanti cambiano prima della rivelazione, le consegne incompatibili vengono invalidate; dopo la rivelazione non si possono cambiare i partecipanti.

## Implementazione

Nuove tabelle calendar_proposals e calendar_lineups con prefisso w40k_, create automaticamente da SectorStorage. Gli appuntamenti esistenti restano invariati; non vengono riscritti risultati, roster, iscrizioni o abbinamenti.

Le proposte e i relativi comandi richiedono sessione, CSRF, partecipazione all’incontro e revisione corretta. Il conflitto di orario viene controllato anche all’approvazione. La proposta non prenota anticipatamente uno slot.

## Verifiche

35 test superati nelle suite calendario, profili, temi, statistiche, feedback dell’interfaccia e roster. Un test facoltativo sul catalogo storico è saltato perché il catalogo non è disponibile.

Le prove API usano PHP CGI, sessioni reali e SQLite isolato. Coprono proposta senza liste, divieto di autoapprovazione, approvazione dell’avversario, rifiuto, ritiro, spostamento, conflitti sopraggiunti, riservatezza, sostituzione e blocco delle liste, invalidazione al cambio di partecipanti e rispetto del roster anche dal calendario.

Sintassi PHP/JavaScript e git diff --check superati. Non è stata completata una verifica visuale nel browser; MySQL non è stato provato.

## Base

Branch remoto: calendario-campionati-visuale.
Commit: bdd6dd45f122631af0cde07a8aa0d05e37d9cfb2.
Nuovo branch: feature/date-confermate-liste.

Nessun deploy o accesso al database del sito.
