# Army Builder 11ª: Build e Play

## Schede, keyword e stratagemmi

I profili dei modelli sono raccolti in blocchi con caratteristiche allineate. Le armi mantengono la tabella comparabile, con origine del membro attached e keyword sotto il nome. Le keyword risolte aprono un dialogo nativo accessibile da mouse, tocco e tastiera, chiudibile con Escape/Chiudi e con ripristino del focus. Il testo inglese proviene dalla libreria Core Rules del catalogo oppure dall'abilità della stessa scheda; i parametri e le qualifiche rimangono nel titolo, anche per keyword aggiunte dagli effetti. Le keyword prive di testo restano visibili senza pulsante.

Il catalogo locale aggiornato è `wahapedia-11-builder-v4.json`, schema 2 / featuresVersion 3 con libreria opzionale `coreRules` (35 regole). Il quarto argomento del convertitore è la pagina HTML Core Rules dell'11ª, acquisita separatamente: viene estratto il testo operativo, escludendo lore e numeri concatenati ai titoli. I vecchi cataloghi restano leggibili senza quella libreria; per usare i nuovi riferimenti su una lista storica, creare esplicitamente una copia con il catalogo attivo.

Gli stratagemmi mostrano nome, CP, tipo, turno, fase e campi WHEN / TARGET / EFFECT / RESTRICTIONS. Le eventuali opzioni +1CP e il testo non strutturato sono conservati. Nei gruppi attached ogni stratagemma compare una volta, con le unità di provenienza. La legenda verificata a pagina 55 dei [Core Rules ufficiali dell'11ª](https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf) è blu per Your turn, rosso per Opponent’s turn e verde per Either player’s turn; le etichette testuali accompagnano sempre il colore. Metadati sconosciuti hanno un colore neutro.

Riferimento identificato: [Warmind](https://warmind.online/), sezione Datasheets, con profili compatti, armi effettivamente selezionate e unità attached sulla stessa pagina. La rifinitura mantiene colori e tipografia Cangiolone. Non è stata attestata una prova interattiva dell'app Warmind. I banner restano da integrare: l'export non fornisce URL di immagini e non è stata verificata una fonte remota con corrispondenza e incorporamento adatti; nessuna apertura della CSP o immagine AI.

## Catalogo builder 3 e automazioni

Il convertitore produce ancora schema 2, con `featuresVersion: 3`: testo operativo strutturato, provenienza/Legends, distinzione Upgrade, gruppi di dotazione, effetti riconosciuti e contingenti alleati. Il nuovo file locale è `wahapedia-11-builder-v3.json`. L’import crea un nuovo catalogo immutabile; le liste esistenti non vengono migrate. «Crea copia col catalogo attivo» apre una bozza separata, rimappando le armi per nome e conservando l’originale. Si ferma se manca una scheda, un’arma selezionata, un potenziamento o un distaccamento; non scarta dati in silenzio.

Dotazione standard e gruppi di sostituzione sono disponibili sulle schede riconosciute. Il catalogo verificato contiene 1.483 schede originali e quattro rappresentazioni Titanicus Traitoris ottenute sostituendo i keyword come previsto dalla fonte. Sono riconosciute dotazioni per **1.407 / 1.487** voci; **797** hanno anche tutte le righe di opzioni riconosciute (incluse quelle senza opzioni). Gli altri casi restano manuali, con avviso e passaggio esplicito alla configurazione manuale. La presenza di una ricetta non certifica tutte le restrizioni della scheda.

I gruppi distinguono sergente e altri modelli. Aumentare un’alternativa sottrae la dotazione di base nello stesso gruppo; diminuirla restituisce la base. Se più scelte del giocatore potrebbero essere sacrificate, l’operazione viene fermata finché il giocatore non riduce una scelta. Le modalità della stessa arma hanno quantità sincronizzate. Cambio taglia e armi a costo aggiuntivo vengono ricalcolati; i punti base manuali restano un override comprensivo della dotazione.

«Salva come mio default» registra una configurazione per tipo di unità, proprietario e versione del catalogo. Si applica solo alle nuove istanze, senza modificare quelle esistenti. Associazioni, Warlord, note, punti manuali ed Enhancement/Upgrade sono esclusi dal default. Al cambio di catalogo/taglia non compatibili, il default non viene applicato automaticamente. «Dotazione standard» e «Rimuovi mio default» sono azioni distinte.

Gli effetti sono derivati da regole esatte riconosciute, senza modificare il catalogo. Supportati keyword d’arma, modificatori numerici mappati, Save e invulnerabile, con distinzione portatore/unità/gruppo attached, provenienza e valori base consultabili. I bonus al solo portatore non sono estesi arbitrariamente a un’unità con più modelli. Gli effetti condizionati riconosciuti richiedono attivazione esplicita e vanno disattivati al termine della condizione; non sono salvati come bonus permanenti. Molte condizioni, aure, abilità a scelta e regole in prosa restano non automatizzate e devono essere verificate: **nessun parser universale o certificazione di legalità completa**.

Enhancement e Upgrade sono distinti nell’interfaccia e conservano costi e armi dedicate. La validazione segnala duplicazioni, più di un potenziamento per unità/gruppo e oltre tre copie dello stesso Upgrade; due/tre copie dello stesso Upgrade consumano un solo slot complessivo, mantenendo tutti i costi.

Legends, Titanic e alleati hanno filtri indipendenti. Gli alleati sono concessi per ID dalle regole della fazione e dai distaccamenti selezionati: vedere [matrice e limiti](builder-alleati.md). Rimuovere un’autorizzazione conserva le unità e segnala l’errore. Quote Agents, Knights/Titans, punti, Battleline dei Daemons e divieti Warlord/potenziamenti sono verificati anche sul server. Restano manuali, fra gli altri, l’imbarco iniziale dei trasporti Agents e i casi in prosa non strutturati.

Esportazione TXT in tre impaginazioni: **GW app · testo**, **WTC** e **Short**, con download oppure **Copia testo**. Il fallback offre testo selezionato se gli appunti non sono disponibili. Le etichette indicano convenzioni testuali, non un’importazione garantita nell’app GW né approvazione automatica da parte di un organizzatore WTC. Backup/ripristino JSON resta il formato completo per l’applicazione.

Il nuovo editor usa il catalogo `schemaVersion: 2`. I cataloghi e le armate precedenti restano nel database e si aprono con l'editor storico. Nessuna migrazione distruttiva o aggiornamento automatico dei cataloghi delle liste.

## Catalogo locale Wahapedia

Acquisire i CSV dalla specifica dell'[export 11ª](https://wahapedia.ru/wh40k11ed/the-rules/data-export/) e le pagine HTML delle fazioni indicate in `Factions.csv`. Conservare le pagine come `<faction_id>.html` (per esempio `SM.html`) in una cartella separata: contengono i tag Unique non presenti nei CSV. L'importatore non esegue script né effettua richieste di rete.

```powershell
php -d memory_limit=512M scripts/import-wahapedia.php C:/dati/csv C:/dati/catalogo-11.json C:/dati/faction-pages C:/dati/core-rules.html
```

Lo script gestisce UTF-8/BOM, il delimitatore `|` e le descrizioni multilinea dell'export. Conserva schede e costi condizionati; interpreta automaticamente le fasce standard per numero di copie e i costi per taglia. Le tariffe non strutturabili e i costi di equipaggiamento richiedono un prezzo base manuale comprensivo della dotazione, a cui vengono aggiunti i potenziamenti selezionati. Il dettaglio mostra sempre le righe originali dei costi. Il convertitore fallisce se manca una pagina di fazione o cambia il formato riconosciuto dei tag Unique.

Importare il JSON come amministratore dalla sezione «Armate salvate e catalogo». Anche la schermata iniziale senza catalogo accetta il nuovo JSON. Ogni import crea uno snapshot immutabile. Il browser mostra la fonte/versione nel dettaglio del catalogo. Il file generato e i dati di gioco rimangono fuori Git.

Limite applicativo: 28 MB di catalogo, 32 MB di richiesta import. Il catalogo builder 3 verificato occupa circa 10,1 MB: usare `post_max_size=32M` per importarlo. Gli script delle anteprime impostano questo limite e 256 MB di memoria solo per il loro server isolato. La normalizzazione completa è stata verificata anche con limite 128 MB (picco 108 MiB); questo non attesta un import IIS/MySQL in produzione. Il convertitore richiede DOM e usa 512 MB per gli intermedi. Nessuna modifica automatica alla configurazione del sito pubblicato.

## Utilizzo

- L’ingresso mostra l’archivio personale delle armate salvate sul server. Sono disponibili apertura, eliminazione e ordinamento per fazione, creazione o ultima modifica (predefinito, più recenti prima). Le date di creazione mancanti nelle liste storiche sono indicate come non disponibili, senza ricavarle dall’ultima modifica.
- «Crea nuova lista» apre la scelta dell’esercito nei gruppi Xenos, Chaos, Imperium e Adeptus Astartes. Poi scegliere Incursion 1000, Strike Force 2000 oppure Onslaught 3000, prima di aprire il builder. Unbound Adversaries è esclusa. Le liste storiche si aprono con il proprio catalogo e l’editor corrispondente. «Torna alle armate» chiede conferma se ci sono modifiche non salvate. Il catalogo unità segue la fazione della lista.
- Build: «Distaccamenti» apre un popup; le checkbox selezionano, il nome espande le regole. La scelta rimane aperta durante le modifiche e il popup conserva il focus. Escape, «Chiudi» o clic sullo sfondo lo chiudono. Le scelte sono applicate alla bozza; «Salva armata» le conserva sul server. Nel popup si sceglie anche la disposizione fra quelle offerte dai distaccamenti selezionati. Unique e DP disabilitano le combinazioni incompatibili.
- Incursion 1000 e Strike Force 2000 impostano rispettivamente 2 e 3 DP. Incursion consente anche un unico distaccamento da 3 DP, secondo l’eccezione delle regole. La tabella 11ª consultata non definisce Onslaught: la voce 3000 richiesta dal gruppo conserva DP espliciti, modificabili dalla creazione e dalla configurazione. Fonti: [GW](https://www.warhammer-community.com/en-gb/articles/95fucn12/building-an-army-in-the-new-edition-of-warhammer-40000/) e [Wahapedia, Muster Armies](https://wahapedia.ru/wh40k11ed/the-rules/core-rules/#Muster-Armies), consultate il 18 novembre 2026.
- Il clic sul nome nel catalogo consulta la scheda; `+` aggiunge un'istanza. Il clic su una voce dell'armata apre «Profili e regole»; «Configura unità» apre dotazione, quantità, note, Warlord, potenziamenti e attachment.
- La dotazione guidata usa gruppi di modelli e sostituzioni −/+. Le modalità della stessa arma condividono la quantità. Per i casi non riconosciuti resta la configurazione manuale, senza cancellare i dati salvati. I profili non selezionati non compaiono nella scheda della lista.
- Il catalogo raggruppa nell’ordine Epic Hero, Character, Battleline, Infantry, Mounted/Beast, Vehicle, Other, con precedenza fra ruoli/keyword. La ricerca aggiorna soltanto il catalogo, senza ricreare la schermata. Rimossa l’animazione d’ingresso che si ripeteva a ogni aggiornamento.
- Le associazioni sono proposte ai Leader/Support pertinenti, solo verso istanze compatibili secondo `leads` del catalogo. Le copie sono distinte e i posti già occupati da un membro dello stesso ruolo sono esclusi; la scelta resta del giocatore. Le associazioni storiche da verificare restano visibili e rimovibili. Eccezioni in prosa non modellate restano manuali. I cicli e i riferimenti orfani sono rifiutati. La rimozione di un bodyguard libera i suoi membri.
- Un Support senza associazione produce un errore esplicito nel client e nella validazione API. Può essere salvato come bozza; l’interfaccia blocca il passaggio a Play finché non è associato.
- Play raggruppa bodyguard, leader e support senza duplicare punti. Il dettaglio mostra prima tutti i profili dei modelli, poi tutte le armi ranged, tutte le melee e infine tutte le regole, con provenienza per ciascun membro. I profili derivano dai valori di fonte e dagli effetti strutturati pertinenti; gli altri effetti richiedono verifica manuale.
- Salva armata conserva la bozza anche con avvisi. Nessuna lista è certificata come pienamente legale: le regole non automatizzate richiedono verifica manuale.
- TXT comprende configurazione e riferimenti degli attachment. Backup JSON conserva tutti i dati della lista; il ripristino crea una nuova armata e richiede che lo snapshot del catalogo sia ancora disponibile sullo stesso server.

Le modifiche restano in memoria quando si cambia pagina interna; nuova lista, apertura di una lista diversa e import chiedono di abbandonare modifiche non salvate. Il browser avvisa alla chiusura/ricarica. Salvare prima di logout o chiusura del browser.

## Anteprima e verifiche

```powershell
$env:PHP_BINARY='C:/path/to/php.exe'
node --test tests/builder-engine.test.cjs tests/builder-archive.test.cjs tests/builder.test.cjs tests/workbench.test.cjs tests/regression.test.cjs
node scripts/preview-builder.cjs C:/dati/catalogo-11.json C:/path/to/NEW-preview-folder
```

Il secondo comando copia solo i file applicativi, crea una configurazione SQLite nuova, avvia `127.0.0.1:8798` e verifica import, salvataggio e lettura via API. Non legge né copia `config.php`, database o upload esistenti. La cartella deve essere nuova. Credenziali solo locali e usa e getta: `preview` / `BuilderPreview!2026`. Il processo rimane attivo; Ctrl+C ferma il server.

Per aggiornare e avviare **l’anteprima già esistente su questa postazione**, conservando account e liste:

```powershell
Set-Location 'C:\Users\manue\projects\warmer'
$env:PHP_BINARY='C:\Users\manue\AppData\Local\Temp\warmer-php84\php.exe'
node scripts/start-builder-preview.cjs
```

Aprire `http://127.0.0.1:8799/#builder` e accedere con l’account locale di prova. Lo script verifica che il database configurato sia esattamente `preview.sqlite` nella cartella `warmer-builder-play-preview-4`, aggiorna soltanto i file applicativi tracciati di primo livello, esclude `config.php` e lascia intatti database e upload. Se la porta è occupata si ferma senza arrestare processi. È possibile indicare cartella e porta: `node scripts/start-builder-preview.cjs C:/Users/manue/projects/warmer-builder-play-preview-4 8800`. Non crea una nuova anteprima. Lasciare aperto il terminale; Ctrl+C arresta il server.

`node scripts/render-builder-preview.cjs C:/dati/catalogo-11.json` genera snapshot HTML delle vere template in `.taste-skill/qa` per gli strumenti della skill frontend. Sono snapshot statici di verifica visiva, non sostituiscono l'applicazione e le prove delle API. Stile, layout e gerarchie seguono Cangiolone; le ricette marketing della skill (hero, sezioni a schermo intero, effetti promozionali) non si applicano a questo editor operativo.
