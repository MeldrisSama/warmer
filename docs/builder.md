# Army Builder 11ª: Build e Play

Il nuovo editor usa il catalogo `schemaVersion: 2`. I cataloghi e le armate precedenti restano nel database e si aprono con l'editor storico. Nessuna migrazione distruttiva o aggiornamento automatico dei cataloghi delle liste.

## Catalogo locale Wahapedia

Acquisire i CSV dalla specifica dell'[export 11ª](https://wahapedia.ru/wh40k11ed/the-rules/data-export/) e le pagine HTML delle fazioni indicate in `Factions.csv`. Conservare le pagine come `<faction_id>.html` (per esempio `SM.html`) in una cartella separata: contengono i tag Unique non presenti nei CSV. L'importatore non esegue script né effettua richieste di rete.

```powershell
php -d memory_limit=512M scripts/import-wahapedia.php C:/dati/csv C:/dati/catalogo-11.json C:/dati/faction-pages
```

Lo script gestisce UTF-8/BOM, il delimitatore `|` e le descrizioni multilinea dell'export. Conserva schede e costi condizionati; interpreta automaticamente le fasce standard per numero di copie e i costi per taglia. Le tariffe non strutturabili e i costi di equipaggiamento richiedono un prezzo base manuale comprensivo della dotazione, a cui vengono aggiunti i potenziamenti selezionati. Il dettaglio mostra sempre le righe originali dei costi. Il convertitore fallisce se manca una pagina di fazione o cambia il formato riconosciuto dei tag Unique.

Importare il JSON come amministratore dalla sezione «Armate salvate e catalogo». Anche la schermata iniziale senza catalogo accetta il nuovo JSON. Ogni import crea uno snapshot immutabile. Il browser mostra la fonte/versione nel dettaglio del catalogo. Il file generato e i dati di gioco rimangono fuori Git.

Limite applicativo: 28 MB di catalogo, 32 MB di richiesta import. PHP/IIS devono consentire la dimensione effettiva della richiesta; l'export usato nello sviluppo produce circa 7,8 MB e passa con `post_max_size=8M`. Il convertitore richiede più memoria dell'API per le tabelle intermedie; il comando sopra usa 512 MB. Per cataloghi futuri più grandi verificare anche `post_max_size`, `memory_limit` e i limiti IIS, senza cambiare quelli degli altri endpoint.

## Utilizzo

- Build: scegliere fazione, punti, DP, distaccamenti e Force Disposition nella configurazione dell'armata. La disposizione viene scelta tra quelle offerte dai distaccamenti selezionati. I distaccamenti con lo stesso tag Unique non sono combinabili: le scelte in conflitto sono disabilitate e il server rifiuta combinazioni incompatibili.
- Incursion 1000 e Strike Force 2000 impostano rispettivamente 2 e 3 DP. Per formati personalizzati il budget è modificabile esplicitamente.
- Il clic sul nome nel catalogo consulta la scheda; `+` aggiunge un'istanza. Il clic su una voce dell'armata apre «Profili e regole»; «Configura unità» apre dotazione, quantità, note, Warlord, potenziamenti e attachment.
- La dotazione è esplicita: inserire le quantità dei profili utilizzati, comprese le modalità alternative della stessa arma. Non viene dedotta automaticamente dai testi delle opzioni. I profili non selezionati non compaiono nella scheda della lista.
- Gli attachment associano istanze, non tipi di unità. Le compatibilità note sono indicate; eccezioni, combinazioni di più leader/support, alleati e restrizioni di equipaggiamento restano manuali. I cicli e i riferimenti orfani sono rifiutati. La rimozione di un bodyguard libera i suoi membri.
- Play raggruppa bodyguard, leader e support senza duplicare punti. Il clic sul gruppo mostra subito statistiche, armi selezionate e regole di tutti i membri. Le statistiche restano quelle di fonte: i modificatori condizionali non sono applicati automaticamente.
- Salva armata conserva la bozza anche con avvisi. Nessuna lista è certificata come pienamente legale: le regole non automatizzate richiedono verifica manuale.
- TXT comprende configurazione e riferimenti degli attachment. Backup JSON conserva tutti i dati della lista; il ripristino crea una nuova armata e richiede che lo snapshot del catalogo sia ancora disponibile sullo stesso server.

Le modifiche restano in memoria quando si cambia pagina interna; nuova lista, apertura di una lista diversa e import chiedono di abbandonare modifiche non salvate. Il browser avvisa alla chiusura/ricarica. Salvare prima di logout o chiusura del browser.

## Anteprima e verifiche

```powershell
$env:PHP_BINARY='C:/path/to/php.exe'
node --test tests/builder.test.cjs tests/workbench.test.cjs tests/regression.test.cjs
node scripts/preview-builder.cjs C:/dati/catalogo-11.json C:/path/to/NEW-preview-folder
```

Il secondo comando copia solo i file applicativi, crea una configurazione SQLite nuova, avvia `127.0.0.1:8798` e verifica import, salvataggio e lettura via API. Non legge né copia `config.php`, database o upload esistenti. La cartella deve essere nuova. Credenziali solo locali e usa e getta: `preview` / `BuilderPreview!2026`. Il processo rimane attivo; Ctrl+C ferma il server.

`node scripts/render-builder-preview.cjs C:/dati/catalogo-11.json` genera tre snapshot HTML delle vere template in `.taste-skill/qa` per gli strumenti della skill frontend. Sono snapshot statici di verifica visiva, non sostituiscono l'applicazione e le prove delle API. Stile, layout e gerarchie seguono Cangiolone; le ricette marketing della skill (hero, sezioni a schermo intero, effetti promozionali) non si applicano a questo editor operativo.
