# Armata, catalogo e schede: interfaccia aggiornata

Aggiornamento del 19 novembre 2026 dopo il riscontro su iPhone. **Il flusso compatto è riservato al telefono.** Su PC restano la disposizione originale a tre colonne in Build (catalogo, armata, dettagli), le due colonne in Play e i comandi persistenti di nome, salvataggio, export e configurazione. Il raggruppamento dell'armata e le correzioni di schede/equipaggiamenti valgono su entrambe le interfacce.

Il nome della lista viene chiesto durante la creazione, insieme a esercito e formato. Sul telefono entrando si vede l'armata, con nome, punti e Salva in vista. Il menu apre cambio Build/Play, rinomina, configurazione dell'armata/distaccamenti, esportazioni, backup e ritorno all'archivio. In Play offre anche gli stratagemmi generali. La navigazione generale occupa una sola riga scorrevole e l'intestazione estesa del sito lascia spazio al builder. Sul desktop si conservano toolbar e selettori precedenti, senza menu compatto o pulsante flottante.

L'armata è raggruppata, nell'ordine, in Character, Battleline, Infantry, Mounted e Vehicle; eventuali schede fuori da questi tipi restano in Other, senza nasconderle o chiamarle Infantry. Gli alleati seguono il loro tipo. I gruppi attached rimangono uniti nella categoria del bodyguard. Ogni categoria ha un pulsante + per aprire il catalogo filtrato. Il pulsante flottante apre tutto il catalogo e scompare nei dettagli, in Play e mentre è aperto un popup. La ricerca ha un pulsante × esplicito per cancellare il testo.

Aggiungere dal catalogo sul telefono mantiene visibile l'armata, senza aprire automaticamente la configurazione. Toccare una voce dell'armata apre la scheda con profili e controlli, con un pulsante per tornare. Sul desktop il dettaglio resta nella terza colonna e l'aggiunta apre la configurazione come prima. Menu e popup sono scorrevoli entro l'altezza disponibile. La selezione di un distaccamento aggiorna anche il riepilogo della configurazione quando si chiude il selettore.

## Armi e costi

Armi con stesso nome, caratteristiche, keyword, modificatori e provenienza nella stessa unità vengono raccolte in una sola riga, sommando le quantità e conservando i nomi dei modelli portatori. Profili modificati o armi di unità diverse restano distinti. Questo vale anche in Play e nei gruppi attached.

Ogni modalità mostra il nome completo in evidenza, ad esempio «Fealty - Sweep» e «Fealty - Strike», con il piccolo simbolo ↳ davanti ai profili alternativi. Nessuna intestazione separata spezza il nome dell'arma. La quantità non viene raddoppiata sommando modalità alternative.

Le scelte di wargear a pagamento indicano esplicitamente il costo aggiuntivo per modello o per unità, anche nei selettori con molte configurazioni. Il valore deriva dai costi strutturati del catalogo: non vengono inventati sovrapprezzi dalle descrizioni.

Ogni scelta mostra l'inventario completo, comprese le armi mantenute: ad esempio «Power Klaw + Kombi-rokkit» è distinguibile da «Kustom Choppa + Kombi-rokkit». Il catalogo Boyz ammetteva già le combinazioni indipendenti, ma l'etichetta mostrava soltanto l'ultima sostituzione, creando due voci apparentemente uguali. La prova sul catalogo reale verifica entrambi i Nob della squadra da venti con Klaw e Rokkit insieme.

I distaccamenti già scelti compaiono soltanto come nomi cliccabili: la regola si legge nel popup. Rimossa l'espansione duplicata dentro la configurazione.

## Enhancement, Upgrade e regole

Il portatore di un Enhancement deve essere un modello Character. Per Ravenwing Command Squad viene ammesso soltanto Ravenwing Champion, correggendo il CSV che estendeva Character a tutti i modelli; il server rifiuta Ancient/Apothecary come portatori. Riferimento ufficiale: [descrizione GW della Ravenwing Command Squad](https://www.warhammer-community.com/en-gb/articles/i5taZMDC/run-rings-around-your-enemies-with-the-new-ravenwing-detachment-in-codex-supplement-dark-angels/). La correzione opera anche sui cataloghi già importati.

Gli Upgrade non chiedono un portatore individuale; eventuali vecchie associazioni vengono scartate in salvataggio. Gli effetti strutturati sul portatore di un Upgrade vengono trattati come effetti sulla sua unità, mantenendo le condizioni di gioco non automatizzate.

Regole Datasheet, Wargear ed Enhancement/Upgrade sono riquadri leggibili con testo più grande. Quelle generiche Core/Faction/Army sono raccolte in «Altre regole». I testi lunghi (oltre 450 caratteri) partono chiusi e si leggono espandendo il riquadro. Keyword e rimandi rimangono cliccabili e il contenuto importato continua a essere escapato.

## Verifiche e rilascio

101 test automatici passati, inclusi casi di raggruppamento delle armi, modalità alternative, costi, portatore Ravenwing, Upgrade senza portatore, regole lunghe, etichette delle combinazioni e popup dei distaccamenti senza duplicati. Audit del catalogo v6 e dei profili reali passati, compresa la combinazione Klaw/Rokkit di entrambi i Nob. Verifica browser Edge headless con interazioni reali su fixture del catalogo v6, a 320/390/1440 pixel: menu, ricerca/cancellazione, aggiunta, apertura scheda, ritorno, Build/Play e popup distaccamenti. Safari e iPhone fisici non disponibili nell'ambiente: la correzione parte dalle immagini dell'utente, ma non viene dichiarata una prova su dispositivo reale.

Per un sito che ha già ricevuto il primo pacchetto, aggiornare **solo** questi file nella directory `/cangiolone.com/warhammer/`:

- builder.js
- builder-workbench.js
- builder-engine.js
- builder.css
- builder-v2.php

Il catalogo v6 esistente resta utilizzabile: questo aggiornamento cambia interfaccia e validazione a runtime, senza richiedere una nuova importazione o riscrivere le liste salvate. Ricaricare gli asset del browser dopo l'upload. Nessun intervento su configurazione, database o upload.
