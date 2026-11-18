# Completare le dotazioni guidate

Nel catalogo v5 ci sono 1.487 voci: 1.407 hanno una ricetta di dotazione, 80 non la hanno. Il conteggio iniziale di 573 ricette parziali includeva erroneamente 205 schede con la sola voce «None»/«None.» nelle opzioni. Ricompilando con il convertitore corretto, 1.039 riconoscono tutte le righe effettive e 368 restano parziali. Il conteggio misura l'interpretazione dei dati, non certifica tutte le restrizioni in prosa. I cataloghi già salvati non vengono riscritti automaticamente.

L'audit riproducibile è `php scripts/audit-builder-loadouts.php percorso/catalogo.json percorso/report.json`: non carica configurazione o database; elenca le singole righe non riconosciute e le schede senza ricetta. Il secondo percorso è facoltativo.

L'estensione in corso del convertitore (catalogo v6, 19 novembre 2026) ha portato le ricette a 1.478: 1.475 riconoscono tutte le righe delle opzioni e 3 restano parziali; 9 schede non hanno ancora una ricetta. Questi numeri si riferiscono all'ultima ricompilazione, non al catalogo storico già salvato. Il report distingue anche default non riconosciuti e default rifiutati alle taglie previste: entrambi risultano attualmente vuoti. Le schede residue restano nel report, senza considerarle completate.

Le ricette v2 conservano limiti separati per riga e per scelta, quantità condivise, sostituzioni di bundle, lock, incompatibilità e cambi per tutti i modelli. Le composizioni flessibili usano `loadoutSelections._models`; server, default personali e controlli client conservano la ripartizione. I modelli fissi con dotazioni numerate sono distinti in ruoli. Le correzioni dei nomi sono esplicite, senza ricerca approssimata.

Le omissioni verificate del CSV sono riparate da `builder-source-fixes.php` durante la normalizzazione: i due profili Plasma cannon del [Leman Russ Commander](https://wahapedia.ru/wh40k11ed/factions/astra-militarum/Leman-Russ-Commander), separati dal cannone Executioner, e la regola Relic Shield del [Death Company Captain with Jump Pack](https://wahapedia.ru/wh40k11ed/factions/space-marines/Death-Company-Captain-with-Jump-Pack). Gli alias per ID in `builderLoadoutAliases` riconciliano nomi della dotazione con i profili presenti: ad esempio [Huron Blackheart](https://wahapedia.ru/wh40k11ed/factions/chaos-space-marines/Huron-Blackheart) e [Chronomancer](https://wahapedia.ru/wh40k11ed/factions/necrons/datasheets.html). Le riparazioni sono idempotenti e non modificano liste o cataloghi storici nel database.

Una **ricetta** descrive al builder la dotazione iniziale e le scelte consentite per ciascun tipo di modello. La fonte contiene queste informazioni soprattutto come testo inglese; il convertitore riconosce alcune forme, come «Any number of models…» o «For every 3 models…». Se una frase non è riconosciuta, la scheda può conservare profili e testo, ma una sostituzione, un limite o l'assegnazione a un modello non è ancora automatizzata.

Per «sistemare manualmente una scheda» intendiamo curare questa descrizione strutturata durante l'importazione. Una volta completata, la stessa dotazione guidata è disponibile per tutti gli utenti. Non basta modificare il JSON generato: il normalizzatore ricompila le ricette e una successiva importazione perderebbe un ritocco non registrato nel convertitore.

Il lavoro necessario per ciascun caso è:

1. Confrontare la scheda della fonte della versione scelta: composizione, dotazione iniziale, alternative e note operative.
2. Separare i modelli eleggibili: sergente, soldati, specialisti o personaggi. Registrare quantità fisse/variabili e dotazioni di ciascuno.
3. Descrivere le sostituzioni: cosa viene tolto, cosa viene aggiunto, massimo per squadra/taglia e limiti condivisi fra modelli. Un launcher ogni tre modelli è un limite della squadra; non diventa un launcher per ogni sottogruppo. Un bundle scudo + martello deve restare un'unica scelta. Frag e Krak sono profili della stessa arma.
4. Registrare assegnazione al modello, eventuali costi aggiuntivi e modifiche alle statistiche del solo destinatario equipaggiato. Conservare come testo le condizioni di gioco, secondo la preferenza del gruppo.
5. Provare dotazione standard, minimo/massimo, cambio taglia, sostituzioni a squadra piena, salvataggio/riapertura, default personali, Play ed export. Il server deve rifiutare le quantità fuori limite anche se inviate senza usare l'interfaccia.
6. Pubblicare un nuovo catalogo locale e permettere la copia esplicita delle liste storiche, senza riscriverle automaticamente.

Conviene prima aggiungere le forme ricorrenti al convertitore, così una correzione copre più schede; per le eccezioni residue serve una mappatura curata per ID della scheda e versione della fonte. Questa seconda infrastruttura non è ancora un archivio completo di tutte le eccezioni.

Esempi nel contesto Dark Angels del catalogo v5: Captain e Captain With Jump Pack riconoscono due righe su tre; Dreadnought una su tre; Drop Pod non ha ancora una ricetta. Sono casi da esaminare, non indicazioni che tutto il loro equipaggiamento sia errato. Ravenwing Command Squad, assegnazione del grenade launcher, Storm Shield dei Terminator Assault e arma di Imperium's Sword hanno già controlli specifici sul catalogo reale.
