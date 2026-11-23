# Ricerca rapida nel catalogo

Il comando **Ricerca rapida** e disponibile nell'archivio delle armate, nella barra desktop del builder e nel menu lista su telefono, in Build e Play. Cerca per nome, testo e riferimento nelle regole delle unita, potenziamenti, distaccamenti, keyword e stratagemmi; filtra per tipo e fazione, includendo le regole comuni. Nelle liste parte dalla fazione corrente, nell'archivio da tutte.

Il risultato mostra il contesto della scheda o del distaccamento; il dettaglio conserva testo inglese, riferimenti e CP/turno/fase degli stratagemmi. Keyword senza testo autonomo sono indicate come tali. I riferimenti descrizioneRef vengono risolti usando i testi del catalogo. Boarding Actions e Combat Patrol restano esclusi come nelle altre viste del builder. La ricerca mostra al massimo 80 risultati e invita ad affinare il termine se necessario.

Nessuna richiesta di rete o nuovo dato privato: usa il catalogo gia caricato, anche nella PWA offline. I link HTTP/HTTPS alle fonti restano esterni e richiedono connessione; URL eseguibili vengono scartati. La shell PWA gia include i tre file modificati con hash, senza nuovi asset da configurare.

File: builder.js, builder-workbench.js, builder.css. Test specifici in tests/quick-search.test.cjs con fixture sintetica e catalogo reale opzionale via BUILDER_CATALOG_PATH. QA Edge 320/390/1440 con catalogo v6 completo: accesso dall'archivio e dal Play/menu mobile, testo e CP, filtri, vuoto, ricerca con fetch bloccato, ritorno ai risultati, fonte, scorrimento, Escape e ritorno del focus. API simulate nel browser, nessun database usato. Safari/iPhone fisico non provati.
