# Cronache del settore — rilascio ufficiale

Questo pacchetto aggiorna l'applicazione esistente in **https://www.cangiolone.com/warhammer/**. Comprende PWA, liste e Play offline, sincronizzazione automatica con scelta esplicita dei conflitti, titolo e logo definitivi, riparazione dei costi omessi, salvataggi del catalogo completo e integrazione dei roster/pool del campionato. Le API di campionato e le immagini delle partite restano online.

## Caricamento

Aprire PowerShell nella cartella del pacchetto ed eseguire:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-Cronache.ps1 -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Upload-Cronache.ps1
```

Host predefinito `ftp.cangiolone.com`; utente e password FTP richiesti interattivamente. Se l'account FTP parte già dal dominio, aggiungere `-RemoteDirectory /warhammer`. Le sole destinazioni ammesse sono `/cangiolone.com/warhammer` e `/warhammer`. `-CheckConnection` controlla accesso e cartella senza caricare file. TLS verificato e credenziali trasmesse a curl via stdin, senza salvarle.

Lo script verifica tutti i checksum prima di collegarsi, poi carica nell'ordine del manifest: immagini e dipendenze, applicazione, API, pagina iniziale, service worker per ultimo. Non cancella file. In caso di interruzione, ripetere lo stesso comando per completare lo stesso pacchetto.

Sono esclusi `config.php`, database, cataloghi JSON del gioco, seed, credenziali, account, foto e allegati. La configurazione e il database ufficiali restano quelli già sul server. Le tabelle aggiuntive del builder vengono create con il normale inizializzatore già presente. Non occorre reimportare il catalogo né registrare nuovamente gli utenti. Le versioni storiche restano conservate.

## Dopo il caricamento

Aprire il sito online e verificare titolo, logo e salvataggio di una lista e di un pool. Per l'offline installare **l'indirizzo ufficiale**, non quello `/warhammer-test/`: su iPhone, Safari → Condividi → Aggiungi alla schermata Home. Aprire l'icona, accedere con l'account ufficiale e attendere «Disponibile offline». Verificare poi archivio, creazione/modifica/salvataggio e Play senza rete. Il browser normale richiede connessione.

La prova **Cangiolone TEST** conserva account, dati e icona separati. Le sue liste locali non passano automaticamente all'app ufficiale: per liste che si vogliono mantenere, esportare un backup JSON dalla prova e ripristinarlo nell'archivio ufficiale. Non cancellare la prova prima di avere verificato i dati utili.

In caso di doppia modifica alla stessa lista compare un popup: scegliere quale salvataggio mantenere. Gli aggiornamenti del catalogo non chiedono questa scelta. I pool mantengono modalità e riserve degli equipaggiamenti anche nella sincronizzazione.

## Generazione riproducibile

Dal repository pulito, dopo avere integrato `main` e committato:

```powershell
node scripts/build-official-release.cjs --output C:\percorso\nuovo-pacchetto
```

Il manifest registra commit del rilascio, base `origin/main`, dimensioni e SHA-256. Il generatore non legge la configurazione ufficiale e rifiuta una cartella di destinazione già esistente. Non usa il seed della prova e non sovrascrive il vecchio pacchetto FTPS.
