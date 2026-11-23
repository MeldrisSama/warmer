# Schede stampabili

Nel builder 11a edizione, il comando **Schede stampabili** apre l'anteprima della lista corrente. Su desktop e nella testata accanto a Build/Play; su telefono e nel menu lista. **Stampa / Salva PDF** richiama il dialogo nativo del browser. Non servono finestre aggiuntive, librerie, salvataggio sul server o rete.

L'anteprima contiene riepilogo punti/Warlord/distaccamenti, verifiche ancora aperte, dotazioni e note effettive, profili dei modelli e delle armi selezionate, regole delle unita e potenziamenti scelti. Leader e Support sono riuniti con la relativa unita. Le regole dei distaccamenti, le definizioni Core richiamate e gli stratagemmi Core/dei distaccamenti selezionati sono inclusi. I riferimenti Core e gli stratagemmi sono raccolti una volta, non ripetuti per ogni gruppo.

Riutilizza i renderer e il motore degli effetti del Play. I modificatori gia applicati dal builder vengono indicati con sottolineatura e fonti; non vengono attivate nuove condizioni o inventate regole. Le dotazioni non selezionate e i potenziamenti non scelti restano esclusi. Eventuali problemi di validazione sono riportati, senza certificare la lista come regolare.

La generazione lavora su una copia del draft, compreso quello non salvato. Non modifica selezioni, dirty state, modalita Build/Play o catalogo. Ogni voce compare una sola volta anche in presenza di associazioni non valide; restano visibili gli avvisi. Pool e liste vuote non aprono la stampa.

Le schede sono statiche: tutti i testi sono aperti, senza pulsanti o popup di regole. Layout chiaro indipendente dal tema, stampa A4 verticale con margini12mm, intestazioni delle tabelle ripetute e righe protette dai tagli. Le schede dei gruppi e le appendici partono su pagina nuova; testi lunghi proseguono su piu pagine. Il numero di pagine dipende dalle regole presenti nella lista. Il dialogo nativo consente di scegliere pagine e stampante/PDF.

Chiudendo l'anteprima o premendo Escape si torna alla lista con il focus ripristinato. Logout, cambio account o navigazione fuori dal builder rimuovono la copia visibile. Nessuna foto, credenziale o dato degli altri utenti viene letto per preparare le schede.

File applicativi: app.js, builder-workbench.js, builder.css. Sono gia nella shell PWA con hash: la nuova stampa usa i dati gia disponibili offline. Nessun nuovo endpoint, schema, asset o catalogo da configurare. Non serve reimportare i dati.

Verifiche: tests/builder-print.test.cjs copre copie/attached, equipaggiamenti, potenziamenti, note, punti, escaping, associazioni errate e assenza di modifiche al draft/offline. tests/site-profile.test.cjs verifica la chiusura delle copie a logout/cambio account/navigazione. QA Edge reale320/390/1440 con catalogo v6 completo e rete bloccata: accesso desktop/mobile, anteprima, regole aperte, comando nativo simulato, ritorno/focus, Escape e privacy. PDF A4 reale prodotto con Chromium e renderizzato con Poppler per controllo visivo di tutte le pagine.

Safari/iPhone e PWA fisica, dialogo nativo su telefono e stampante fisica non provati. Le impostazioni e la paginazione possono variare fra browser.
