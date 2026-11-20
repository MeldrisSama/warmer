# Roster del campionato

Un nuovo campionato ha due limiti in punti, impostati dall’amministratore alla creazione: roster e singola partita. I campionati precedenti conservano il flusso di consegna esistente. Non si applicano limiti retroattivi.

Dopo l’iscrizione con la fazione, il giocatore sceglie una lista salvata nel builder come bacino. Ogni voce rappresenta una copia con taglia e composizione dei modelli dichiarate. Il bacino non deve avere Warlord, distaccamenti e requisiti di una lista da partita. I costi base, comprese le fasce di prezzo delle copie successive, vengono dal catalogo storico. I punti manuali non sono ammessi.

## Equipaggiamenti opzionali

La pagina mette in evidenza gli equipaggiamenti a pagamento di ciascuna copia, con costo unitario e quantità riservata. Quelli già montati nella lista sorgente sono preselezionati; devono essere compresi nella riserva. Si possono dichiarare anche alternative incompatibili tra loro, perché sarà la lista della partita a stabilire cosa viene effettivamente montato.

La riserva costa il massimo fra `costo unitario × quantità` delle opzioni dichiarate per quella copia. Non si sommano le opzioni diverse. La riserva non passa ad altre copie, e non autorizza opzioni non dichiarate.

| Opzioni dichiarate per una copia | Extra nel roster |
| --- | ---: |
| A da 15, B da 15 | 15 |
| A da 15, B da 25 | 25 |
| Due esemplari di A da 15 | 30 |

Il costo della copia nel roster è base + riserva equipaggiamenti. I potenziamenti dei distaccamenti sono esclusi dal roster: non sono dichiarati, conteggiati o vincolati a una copia del bacino. Si scelgono nella lista dell’incontro, dove continuano ad applicarsi i relativi costi e le regole del builder. Anche se la lista usata per preparare il bacino contiene potenziamenti, questi non entrano nel roster.

Le dotazioni gratuite sono modificabili. Nella partita il builder continua a sommare normalmente tutte le armi effettivamente montate, e controlla taglie, incompatibilità, sostituzioni e limiti interpretati dal catalogo. Dichiarare due opzioni incompatibili non permette di montarle insieme. Due opzioni compatibili da 15, entrambe montate, pesano 30 sul limite partita.

I profili alternativi della stessa arma, come Frag e Krak, non duplicano la riserva. Anche gli equipaggiamenti senza profilo d’arma sono identificati tramite la ricetta. La verifica non pretende di certificare le restrizioni espresse soltanto in prosa: restano i limiti del builder esistente.

## Consegne e versioni

Tutti devono consegnare il roster prima che l’amministratore pubblichi il calendario. Dopo l’avvio i roster restano bloccati; l’amministratore può aprire e chiudere una finestra comune. Pausa e chiusura del campionato impediscono modifiche anche con finestra aperta.

Ogni consegna di roster crea una nuova versione, con punti e opzioni indipendenti dalla lista sorgente. Il giocatore vede il proprio storico; agli altri vengono comunicati solo gli account che hanno già consegnato. Il controllo della versione precedente evita di sovrascrivere un aggiornamento da un’altra scheda del browser.

La lista dell’incontro deve provenire dal builder, usare la stessa fazione e lo stesso catalogo della versione attuale del roster, rispettare il limite partita e trovare una copia distinta compatibile per ogni unità. Un algoritmo di assegnazione evita di dipendere dall’ordine di copie identiche con riserve diverse. Non basta incollare un testo per aggirare i controlli. Nei nuovi campionati con roster, entrambe le liste devono essere consegnate prima di proporre il risultato.

Ogni consegna conserva testo, dati strutturati e riferimento alla versione del roster usata. Aggiornare il roster o modificare/eliminare la lista sorgente non modifica le consegne precedenti. Prima della rivelazione resta possibile sostituire esplicitamente una singola consegna con una lista verificata sul roster attuale. Dopo entrambe le consegne, o dopo la conferma del risultato, le liste restano definitive. La rivelazione mantiene i permessi del campionato esistente.

## Persistenza e rilascio

Tre nuove tabelle additive: `w40k_league_roster_settings`, `w40k_league_rosters`, `w40k_league_roster_lineups`. Nessuna riscrittura di roster, liste, cataloghi o incontri precedenti. Si usano connessione, lock applicativi e transazioni dello storage esistente. Non viene eseguito DDL del builder all’interno delle scritture di campionato.

File applicativi: `api.php`, `storage.php`, `league.php`, nuovo `league-roster.php`, `campionato.php`, `campionato.js`, `campionato.css`. Caricare il nuovo modulo PHP prima di `api.php`. Il catalogo attuale con dotazioni guidate è sufficiente; non serve rigenerarlo.

## Verifiche

`node --test tests/*.test.cjs`, con PHP 8.1+ e SQLite isolato. `league-roster-model.php` verifica costi massimi, costi partita, copie, taglie, assegnazione indipendente dall’ordine, costi manuali e opzioni sconosciute. Le regressioni HTTP coprono proprietario, fazione, consegne, blocco all’avvio, finestre, storico privato, conservazione delle liste e rollback dopo un errore simulato.

Per verificare esplicitamente il Defiler nel proprio catalogo locale, senza leggere configurazione o database:

```powershell
php -d memory_limit=256M tests/league-roster-catalog.php C:/percorso/catalogo.json
```

Anche il test Node esegue questo controllo quando è definito `BUILDER_CATALOG_PATH`. Verificati 128/128 test con il catalogo v6 locale. Dopo gli ultimi controlli su fazione e risultato, rieseguite le regressioni HTTP e il modello roster: 31 pass, un controllo opzionale del catalogo non richiesto in quella seconda esecuzione (già passato nella suite completa).

Edge reale a 390×844 e 1440×900: creazione con limiti numerici, iscrizione, caricamento delle opzioni, calcolo 15+15→15, consegna e comando di chiusura finestra. Entrambe le sequenze terminano PASS, senza overflow o controlli fuori viewport. Shell, CSS e JavaScript applicativi reali, API simulate con dati sintetici; le API reali sono provate dalla suite SQLite. Fixture e screenshot in `.taste-skill/roster-qa`, esclusi da Git. Nessuna certificazione del layout come landing page e nessun gate da landing dichiarato.

MySQL, IIS e Safari fisico richiedono una verifica separata. Nessun push, PR o rilascio eseguito.
