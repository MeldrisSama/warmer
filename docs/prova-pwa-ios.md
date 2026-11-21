# Provare Cangiolone TEST su iPhone

Questo pacchetto pubblica una copia di prova sullo stesso hosting Aruba, senza modificare `/warhammer/`, la wiki o il database MySQL utilizzato dal gruppo. Non richiede un sottodominio, un nuovo certificato o un database MySQL dal pannello.

## Cosa contiene

- App: `https://www.cangiolone.com/warhammer-test/`, con nome e icona **Cangiolone TEST**.
- Database SQLite separato: `mdb-database/warhammer-pwa-test/pwa.sqlite`, creato da PHP a partire dal seed compresso `seed.sqlite.gz`, già con il catalogo completo v6. Nessun utente, partita, foto o lista del gruppo viene copiato.
- Sessione PHP, IndexedDB, account offline, cache dell'app e preferenze del tema separati dalla versione ufficiale.
- `Upload-PwaTest.ps1`: caricamento FTPS con TLS e verifica dei checksum. Password richiesta con input nascosto, non salvata nei file né negli argomenti dei processi.
- `SETUP-CODE.txt`: codice per creare il primo amministratore di prova. Resta sul tuo PC, non viene caricato. Conserva questa cartella per poter ripetere i controlli e i caricamenti con la stessa configurazione.

SQLite deve essere disponibile nel PHP dell'hosting. Lo script lo controlla prima di caricare il database: non tenta mai di collegarsi a MySQL come alternativa. La cartella `mdb-database` è quella predisposta per la scrittura nell'hosting Windows Aruba; se servono permessi aggiuntivi, lo script si ferma con un messaggio specifico.

## 1. Apri PowerShell nella cartella del pacchetto

Apri PowerShell dal menu Start. Se il pacchetto è nella posizione preparata in questa sessione:

```powershell
Set-Location 'C:\Users\manue\Documents\ChatGPT\cangiolone\pwa-test'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1 -CheckOnly
```

Deve stampare «Pacchetto TEST verificato» e il numero dei file. Questo comando non fa connessioni di rete e non carica nulla. `ExecutionPolicy Bypass` vale soltanto per il processo avviato, senza cambiare la policy del PC.

Non modificare i file dentro `files`: il controllo dei checksum rifiuta file diversi dal pacchetto preparato.

## 2. Carica la prova

Tieni a disposizione host, nome utente e password FTP del tuo hosting Aruba. Sono le credenziali FTP, non quelle dell'account Cangiolone o del database MySQL.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1
```

Lo script chiede:

1. Host FTP: il nome indicato nel pannello Aruba, senza `ftp://` (per esempio `ftp.cangiolone.com`).
2. Utente FTP: il valore del pannello.
3. Password FTP: l'input è nascosto.

La porta predefinita è 21 con TLS esplicito obbligatorio. Se il pannello richiede FTPS implicito sulla porta 990:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1 -Port 990
```

Per impostazione predefinita la radice FTP è `/cangiolone.com`, come negli upload precedenti. Se il tuo accesso FTP entra già nella radice del dominio, usa:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1 -RemoteRoot '/'
```

Scegli in base a ciò che mostra il client FTP: se vedi la cartella `cangiolone.com`, mantieni il valore predefinito; se vedi direttamente `warhammer`, `wiki` e `mdb-database`, usa `/`. Non indicare `/warhammer` come destinazione: il parametro lo rifiuta.

Durante il caricamento vengono prima installate le protezioni della cartella database. Un controllo HTTPS deve ricevere accesso negato al file innocuo `probe.txt`; solo dopo si carica il seed compresso. PHP verifica dimensione e SHA-256 del contenuto prima di creare il database, solo se assente. Poi si verificano PHP, SQLite e permessi. Dipendenze prima, pagina iniziale e service worker per ultimi. Nessun file remoto viene cancellato. Se config o database di prova esistono già, vengono conservati insieme agli account e alle liste.

Opzionale, per controllare soltanto connessione FTPS e radice prima dell'upload:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1 -CheckConnection
```

## 3. Crea l'account di prova dal PC

Quando il caricamento termina, apri:

`https://www.cangiolone.com/warhammer-test/`

Devi vedere **Cangiolone TEST**. La prima schermata chiede di creare l'amministratore:

1. Apri `SETUP-CODE.txt` sul PC e copia il codice nel campo iniziale richiesto dal sito.
2. Scegli nome giocatore e nome utente di prova, per esempio `provaiphone`.
3. Scegli una password nuova per la prova e completa la registrazione.
4. Apri Army Builder: il catalogo completo è già disponibile. Crea una lista chiamata `Prova iPhone` e salvala.

Non usare l'account del sito ufficiale: questo ambiente ha utenti diversi. Il codice iniziale serve una sola volta per creare il primo amministratore. Non viene più richiesto per i normali accessi.

Per verificare lo stato dell'installazione senza FTP e senza scrivere dati:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-PwaTest.ps1 -CheckHttp
```

Deve indicare HTTPS, PHP, SQLite, permessi e catalogo OK; dopo la registrazione anche account iniziale creato True. Il diagnostico richiede il codice tramite header: aprendolo direttamente nel browser restituisce «Non trovato» ed è normale.

## 4. Installa la PWA su iPhone

1. Con connessione attiva, apri Safari e vai all'indirizzo della **prova**.
2. Tocca Condividi, poi **Aggiungi alla schermata Home**. Se presente, attiva **Apri come app web** e premi Aggiungi.
3. Torna alla schermata Home e apri l'icona **Cangiolone TEST**. Deve aprirsi come app, senza la normale barra di Safari.
4. Accedi con l'account di prova. Se Safari era già autenticato, controlla comunque l'accesso dentro l'app: non dare per scontato che i due accessi siano condivisi.
5. Vai all'archivio Army Builder e aspetta **Disponibile offline**. Il primo download richiede connessione.

Il pacchetto usa già `www.cangiolone.com`, verificato come dominio canonico dell'hosting. Mantieni lo stesso dominio nell'installazione della PWA e negli accessi dal PC. Non impostare il dominio senza www: reindirizza a quello con www.

## 5. Prova senza rete

1. Attiva modalità aereo e verifica che Wi-Fi e dati mobili siano entrambi spenti.
2. Apri `Prova iPhone`, cambia il nome o aggiungi un'unità e premi **Salva**. Deve confermare il salvataggio sul dispositivo.
3. Crea e salva anche una nuova lista.
4. Chiudi completamente la PWA dall'elenco delle app e riaprila dalla sua icona, sempre senza rete. Le liste salvate devono essere presenti e modificabili.
5. Apri Play e verifica profili, armi, regole e stratagemmi senza rete. Campionati/Classifica/Nuova partita devono mostrare la richiesta di connessione.
6. Riattiva la rete, torna all'app e attendi la sincronizzazione automatica. Dal PC ricarica l'archivio della prova: devono comparire anche le modifiche del telefono.

Nel browser normale l'offline resta disabilitato: questo comportamento è voluto. Durante la prova non cancellare dati Safari o reinstallare la PWA mentre ci sono modifiche ancora da sincronizzare.

## 6. Prova il conflitto

1. Con PC e telefono online, sincronizza e apri la stessa lista su entrambi.
2. Metti offline il telefono, rinomina la lista `Versione telefono` e salva.
3. Sul PC, nello stesso ambiente di prova, rinominala `Versione PC` e salva.
4. Riattiva la rete sul telefono e attendi la sincronizzazione automatica. Deve comparire il conflitto: confronta i salvataggi, scegli quale tenere e conferma.
5. Ricarica la lista sul PC e controlla che sia rimasta la versione scelta.

Per provare il caso eliminazione/modifica, ripeti modificando sul telefono e cancellando dal PC. Deve chiedere di scegliere. Gli aggiornamenti di catalogo e punti non devono aprire questo dialogo; per provarli basta importare un diverso catalogo dall'account amministratore della prova, lasciando intatto quello ufficiale.

## Se lo script si ferma

- **Checksum non valido:** il pacchetto è stato modificato o copiato incompleto. Non saltare la verifica; recupera la cartella preparata integra.
- **Cartella radice FTP non trovata:** verifica `/cangiolone.com` rispetto a `/` come descritto sopra.
- **Errore TLS/certificato:** usa l'host FTP corretto del provider. Lo script mantiene la verifica del certificato; non richiede di disattivarla.
- **IP FTP bloccato:** nel pannello Aruba verifica gli IP consentiti per l'accesso FTP.
- **PDO_SQLITE mancante:** abilita l'estensione se il pannello lo consente oppure chiedi al gestore hosting se può abilitarla. Non copiare la configurazione MySQL del sito ufficiale dentro la prova. Se il piano non supporta SQLite, occorre preparare una variante con database MySQL realmente separato.
- **Permessi di scrittura:** nel File Manager Aruba seleziona solo `mdb-database/warhammer-pwa-test` e assegna scrittura alla cartella e ai file contenuti. Ripeti lo script. Non occorre cambiare i permessi del sito ufficiale.
- **Protezione storage non verificata:** non caricare il database manualmente. Se HTTP500, controlla la configurazione IIS della sola sottocartella di prova; se HTTP200, il blocco dei download non è applicato.
- **Schermata DB non disponibile:** esegui `-CheckHttp` e riporta il messaggio; non usare il database ufficiale come ripiego.

Per ripetere l'upload usa la stessa cartella del pacchetto: lo script conserva il database e la configurazione remoti esistenti. Per un futuro aggiornamento del codice si prepara un nuovo pacchetto mantenendo il codice iniziale originale (opzione `--setup-code-file` del generatore); non sostituire manualmente il file SQLite.

## Ricostruzione del pacchetto, per chi sviluppa

Dal repository, con Node22+ e PHP8.1+ con PDO_SQLITE:

```powershell
$env:PHP_BINARY = 'C:\percorso\php.exe'
node scripts/build-pwa-test-release.cjs --catalog 'C:\percorso\catalogo.json' --output 'C:\nuova-cartella-pacchetto'
```

Per aggiornare un ambiente di prova già inizializzato, aggiungi `--setup-code-file 'C:\percorso\vecchio-pacchetto\SETUP-CODE.txt'`: la configurazione avrà lo stesso codice iniziale, mentre lo script conserverà il database remoto esistente.

La cartella di uscita deve essere nuova: il generatore non sovrascrive codice iniziale o database di un pacchetto già preparato. Il manifest contiene hash del codice effettivo, incluse le modifiche locali non committate. Non vengono letti o copiati config.php, utenti, database o upload di produzione. I file da caricare sono solo quelli sotto `files`, selezionati dal manifest; guida, script, manifest e codice iniziale rimangono sul PC.

Riferimenti: [FTPS Aruba](https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/configurazione-client-ftp-pubblicazione-ftp-ftps), [cartelle hosting Windows](https://guide.aruba.it/hosting-e-domini/hosting/hosting-windows/pubblicazione-gestione-sito-windows/cartelle-file-default), [permessi File Manager](https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/file-manager/assegnare-modificare-permessi-cartella), [PWA su iPhone](https://support.apple.com/it-it/guide/iphone/iphea86e5236/ios).

Correzione per hosting Aruba verificata il 20 novembre 2026: il dominio senza www risponde301; l’autorizzazione IIS nella sottocartella è bloccata a livello hosting (500.19 / 0x80070021). Il pacchetto usa il filtro hiddenSegments per negare la cartella warhammer-pwa-test, senza modificare le autorizzazioni IIS del server. Se avevi caricato soltanto i primi due file, ripeti lo stesso script aggiornato: sovrascrive la protezione e il file di prova, poi verifica HTTP403/404 prima di procedere. Nessuna cancellazione manuale necessaria.

Trasferimento del seed: il pacchetto invia via FTPS `seed.sqlite.gz` e lo installa tramite una richiesta HTTPS autenticata dal codice iniziale. PHP verifica il contenuto esatto, limita la decompressione alla dimensione prevista e non sostituisce mai un database esistente. Il file `local-seed.sqlite` sul PC è una copia locale del seed, non viene caricato. Se fallisce FTPS, il nuovo messaggio indica il file e la risposta estesa del server; non ignorare l’errore o i controlli di integrità.

Aggiornamento sincronizzazione: la PWA controlla automaticamente i dati ogni volta che viene aperta o torna in primo piano e dopo ogni salvataggio/eliminazione. La fascia sopra il contenuto mostra preparazione dell'app, controllo dei conflitti, download e invio delle liste, con progress bar quando il lavoro è in corso. Il catalogo viene riscaricato soltanto quando cambia; gli errori sono visibili e l'ultima sincronizzazione riuscita mostra anche i secondi. Per aggiornare la prova già installata esegui lo stesso Upload-PwaTest.ps1: il database remoto viene conservato. Dopo l'upload apri la PWA online, poi chiudi l'app e le eventuali schede Safari della prova e riaprila per consentire l'attivazione dell'interfaccia offline aggiornata. Non cancellare dati Safari e non reinstallare l'app per questo aggiornamento.

Aggiornamento interfaccia: il pacchetto comprende ora 81 file, inclusi sync-icons.js e sync-icons.css. Le notifiche offline/online in alto sono richiudibili; le icone animate casuali sostituiscono le barre di attesa. I conflitti richiedono scelta in un popup ampio. Epic Hero e Character sono separati, gli alleati sono in Other su mobile e PC. Dal menu Army Builder: se si è nel builder si apre l’elenco, da un’altra sezione si riprende l’armata precedente. Caricare sempre l’intero pacchetto con lo script per includere anche dipendenze e hash aggiornati.

La sezione «Sincronizza ora» non è più presente nella PWA: la sincronizzazione parte automaticamente all’apertura, al ritorno online e dopo salvataggi/eliminazioni. Stato e notifiche sono in alto; i conflitti si risolvono nel popup.
