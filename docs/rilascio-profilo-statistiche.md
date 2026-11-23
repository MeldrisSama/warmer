# Statistiche, profilo e ricerca rapida

Pacchetto dedicato: statistiche personali, avatar con ritaglio/zoom e ricerca rapida. La creazione della lista dal roster e la stampa sono rinviate e non incluse. Il profilo di altri giocatori cliccabile non fa parte di questo rilascio.

Contiene solo 12 file applicativi: storage.php, router.php, statistics.js, theme.js, style.css, builder.js, builder-workbench.js, builder.css, app.js, api.php, index.php, service-worker.php. Nessun config, database, catalogo dati, upload o credenziale. Nessuna cancellazione. Non usare i vecchi pacchetti per questo aggiornamento.

La base del sito deve includere il rilascio PWA di PR27. Il manifest registra commit e base esatti; il costruttore controlla che corrisponda all'elenco delle modifiche. Se main avanza prima della pubblicazione, il comando PR si ferma: integrare, ripetere i controlli e rigenerare il pacchetto. Il pacchetto non include i successivi cambiamenti del server.

## Verifica senza collegarsi al server

Aprire PowerShell nella cartella del pacchetto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-Profilo-Statistiche.ps1 -CheckOnly
```

Controlla ambiente, elenco esatto dei file, destinazione e checksum SHA-256. Una modifica locale o una destinazione TEST vengono rifiutate.

## Pubblicazione GitHub

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Pubblica-PR.ps1
```

Il launcher usa il checkout locale indicato al momento della generazione. Esegue fetch, verifica base e checkout pulito, push, creazione/aggiornamento della nuova PR e lettura dell'head. Soltanto dopo chiude le PR28–31 ancora aperte se i branch corrispondono a quelli previsti; non elimina i branch e non fa merge. Non tocca altre PR. Ripetibile in caso di interruzione. Se GitHub non è raggiungibile, si ferma senza dichiarare completate le operazioni.

## Upload FTPS, da eseguire esplicitamente

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-Profilo-Statistiche.ps1 -CheckConnection
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-Profilo-Statistiche.ps1
```

Host predefinito ftp.cangiolone.com, porta21 con TLS obbligatorio (porta990 per FTPS implicito). Destinazione /cangiolone.com/warhammer; alternativa /warhammer. Utente e password vengono chiesti interattivamente. Password solo in memoria/stdin di curl, mai in file o argomenti. Verifica TLS del provider Aruba conservata dal precedente uploader, senza opzioni insecure.

Prima controlla connessione e directory; carica dipendenze e asset, poi API e index, infine service-worker. Richiede al database il permesso ALTER per aggiungere idempotentemente users.avatar. Non cambia gli account, i risultati o i roster e non richiede reimportazione del catalogo. A fine upload riaprire il sito online; controllare caricamento foto e statistiche. Il pacchetto non sostituisce la verifica su MySQL/IIS e sul telefono.
