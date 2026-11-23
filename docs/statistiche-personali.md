# Statistiche personali

La voce **Statistiche** apre `#statistiche` per l'utente connesso. Mostra numero di partite, vittorie/pareggi/sconfitte, percentuale di vittorie, differenza e media dei punti fatti/subiti, ultimi dieci risultati in ordine cronologico, confronti diretti e storico.

I filtri Dal/Al sono inclusivi; tipo, campionato e avversario si combinano e restano nell'URL. Selezionare un campionato imposta il tipo Campionato; scegliere Amichevoli azzera il campionato. Gli intervalli invertiti vengono rifiutati. La percentuale è vittorie / partite, includendo i pareggi nel denominatore. Senza partite percentuale e medie mostrano un trattino.

La sorgente è esclusivamente `state.matches`: niente somma con i risultati delle fixture. L'API aggiunge `leagueId` ricavato dalle fixture con risultato confermato, indipendente dal blocco gestionale `leagueLocked`. Gli incontri annullati e quelli altrui sono esclusi. Le proposte pendenti e i riposi non producono partite nel registro. Nessuna inferenza della fazione delle amichevoli o lettura delle bozze del builder.

La funzione richiede la rete anche nella PWA. Il nuovo script fa parte della shell del service worker per non interromperne l'aggiornamento; i risultati non vengono aggiunti alla cache offline. Nessuna migrazione, dipendenza o modifica ai punteggi.

Verifiche: `node --test tests/statistics.test.cjs tests/site-profile.test.cjs tests/theme.test.cjs tests/regression.test.cjs` con PHP 8.1+ e SQLite isolato. Per cache e distribuzione eseguire anche `tests/offline.test.cjs`, `tests/pwa-test-release.test.cjs` e `tests/official-release.test.cjs`; quest'ultimo richiede un checkout committato e pulito.

Distribuzione futura: caricare `statistics.js`, `style.css` e `app.js`, poi `api.php` e `index.php`, infine `service-worker.php`. Usare un pacchetto coerente; questa implementazione locale non aggiorna i precedenti pacchetti FTPS.
