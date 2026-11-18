# Verifica Build / Play — 18 novembre 2026

**GATE: OPEN 16 (rounds used up).** Il gate della skill frontend non è passato; non viene presentato come superato. La pagina segue il requisito esplicito dell'utente: editor operativo a tre pannelli e stile Cangiolone, con due modalità della stessa lista.

## Verifiche funzionali

- 31 test passati: regressioni esistenti e nuovi controlli Build/Play, inclusi prezzi per copie, attachment senza doppio conteggio, quantità armi, potenziamenti, Unique, disponibilità DP e Force Disposition, cicli e riferimenti invalidi, escaping, proprietà delle armate e round trip SQLite.
- Importazione reale di 1.483 schede, 2 escluse perché virtuali o relative a fonti precedenti/fazione assente. CSV del 12 novembre 2026; tag Unique acquisiti dalle pagine di fazione il 18 novembre. Dati originali e JSON generato conservati nello workspace esterno, fuori Git.
- Prova HTTP con l'applicazione reale in una copia isolata: setup, import del catalogo completo, lettura dello snapshot, salvataggio e riapertura di una lista con leader attached e quantità armi. Nessun accesso al database configurato nel repository o sul sito.
- Normalizzazione e serializzazione dell'intero catalogo verificate con `memory_limit=128M`, picco misurato 84 MiB. L'importatore CSV usa 512 MB per le tabelle intermedie. Catalogo ottimizzato di circa 7,8 MB, compatibile con il limite POST PHP standard di 8 MiB per lo snapshot verificato.

## Frontend e strumenti

Applicata la skill `design-taste-frontend`: gerarchie, coerenza dei controlli, bordi, allineamenti, contrasto, microfeedback, focus e reduced motion. Palette e font conservati dal sito: verde scuro, avorio, oro, Georgia/Arial. Nessuna fotografia, effetto, palette estranea o dipendenza aggiunta. Voce: istruzioni operative in italiano, nomi delle schede dalla fonte.

Verifica `consistency.mjs` su 1440, 1024, 820, 768 e 390; tre giri del gate e screenshot con gli strumenti della skill. Gli screenshot sono snapshot statici delle vere template di produzione, con un catalogo reale, separati dalla prova funzionale delle API. Non sono simulazioni di avvenute interazioni nel browser. I risultati locali sono in `.taste-skill`, ignorata da Git.

Correzioni applicate dopo il controllo: focus sui summary, accesso da tastiera alle tabelle scorrevoli, skip link, pulsanti senza etichette spezzate su telefono, allineamento del footer, stato selezionato dei pannelli mobile. Nessuna modifica ai file della skill.

Screenshot finali controllati a 1440, 1024, 820, 768 e 390; Play anche a 1440 e 390. `perf.mjs` sullo snapshot Build: **PASS, 0 FAIL e 0 WARN**, layout shift 0.000 e nessuna richiesta fallita. Questa misura riguarda lo snapshot renderizzato, non il trasferimento iniziale del catalogo completo tramite API.

### Cinque eccezioni dichiarate nel gate

1. `copy-slop-word`: Supercharge è il nome reale di un profilo d'arma, non testo promozionale da riscrivere.
2. `text-only`: il contenuto è l'interfaccia di un editor, richiesta dall'utente, senza hero promozionale.
3. `card-visual`: le righe dell'armata contengono nome, quantità e punti; non richiedono immagini.
4. `copy-actions`: il comando di aggiunta su ogni unità non è una CTA ripetuta di una landing page.
5. `overlap-text`: il controllo confronta discendenti esterni allo scrollport con la libreria sottostante. Gli screenshot mostrano il clipping corretto del catalogo.

### Sedici segnalazioni ancora aperte

| Controllo | Posizione | Valutazione |
| --- | --- | --- |
| off-grid | input nome armata, 1440 | Padding interno della barra, intenzionale |
| moment-none | pagina, 1440 | Nessun effetto promozionale nel tool richiesto |
| hero-screen | workbench, 1440 | L'editor non ha una hero |
| section-height | footer, 1440 | Footer compatto del sito |
| section-height | workbench, 1440 | Editor con pannelli scorrevoli |
| one-section | footer, 1440 | Non è una sezione promozionale a schermo intero |
| one-section | toolbar, 1440 | Barra operativa dell'editor |
| one-heading | titolo catalogo, 1440 | Titoli dei tre pannelli contemporanei richiesti |
| container-edges | header, 1440 | Contenitore esistente del sito, senza `.wrap` della skill |
| container-edges | workbench, 1440 | Griglia operativa propria del progetto |
| container-edges | footer, 1440 | Contenitore esistente del sito |
| container-edges | shell, 1440 | Contenitore esistente del sito |
| container-edges | titolo dettaglio, 1440 | Titolo interno al terzo pannello |
| container-edges | titolo roster, 1440 | Titolo interno al pannello centrale |
| nav | brand dello snapshot, 390 | Lo snapshot mostra l'editor senza il menu autenticato dell'app |
| container | pagina, 1440 e 390 | Layout Cangiolone, non il contenitore marketing del kit |

129 WARN residui del gate, soprattutto contenuti che continuano oltre la prima schermata/scrollport e densità del testo delle regole. Non sono attestati come risolti. I profili su telefono possono scorrere orizzontalmente dentro la tabella; la pagina mantiene il layout verticale.

## Limiti pratici

Dotazioni e quantità dei profili vanno configurate esplicitamente; nessuna interpretazione automatica delle sostituzioni scritte in prosa. I costi per equipaggiamenti e le tariffe non interpretate si includono nel prezzo base manuale. Restano manuali gli alleati, le eccezioni di attachment, i vincoli dei potenziamenti e i modificatori condizionali. Unique e scelta della disposizione sono invece controllati anche sul server. Nessuna lista viene certificata come completamente legale.

Non verificati: dispositivo iPhone/Android reale, MySQL, hosting IIS, offline/PWA, distribuzione sul sito. Nessun push o rilascio eseguito. Il controllo visivo automatico su snapshot non sostituisce una prova interattiva completa del browser con una lista reale del gruppo.
