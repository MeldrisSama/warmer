# warmer

## HTTPS

Le pagine HTTP vengono reindirizzate a `https://cangiolone.com`, mantenendo percorso e query. Le richieste POST via HTTP vengono rifiutate prima di creare una sessione. Il certificato HTTPS deve essere attivo sull'hosting.

L'applicazione usa il valore `HTTPS` fornito dal server. Un eventuale proxy deve configurarlo correttamente. Gli header inoltrati dal client non vengono usati per riconoscere HTTPS.

Il server di sviluppo PHP su loopback accetta HTTP per eseguire i test e lavorare in locale.

## Avvio locale

```sh
php -S localhost:8000 -t Cangiolone.com Cangiolone.com/router.php
```

Il router protegge gli upload durante lo sviluppo. Su IIS va pubblicato anche `Cangiolone.com/web.config`, che blocca gli URL diretti della cartella `uploads`.

Le foto vengono servite dall'API dopo il login. I percorsi delle foto già salvate restano compatibili.
Repository che si dedicherà alla costruzione della sezione warmer di cangiolone.com

## Army Builder sperimentale nel repository

Questa sezione documenta il prototipo integrato nel codice. Per trovare **Army Builder** nel menu dopo il login serve un’installazione che includa il prototipo. Per creare un’armata, un amministratore deve prima importare un catalogo per l’edizione scelta. Le liste `.txt` del campionato si gestiscono separatamente.

- Cataloghi per edizione (`10` e `11`) con fonte, licenza, numero di versione e snapshot storico. Nessun datasheet commerciale è incluso.
- Importazione JSON riservata agli amministratori, con conferma esplicita sui diritti di utilizzo e ripubblicazione.
- Configurazione di fazioni, distaccamenti, composizione delle unità, numero di squadre ed equipaggiamenti opzionali.
- Conteggio punti e controlli sui limiti esplicitamente presenti nel catalogo; **non è una certificazione di validità secondo tutte le regole ufficiali**.
- Armate associate al proprietario, salvataggio delle bozze anche con avvisi, riapertura, eliminazione ed esportazione `.txt`.
- Ogni armata resta collegata alla versione del catalogo con cui è stata creata. I nuovi import non la modificano automaticamente.

### Come importare un catalogo

1. Accedi come amministratore e apri **Army Builder**.
2. Prepara un file JSON conforme all'[esempio dimostrativo](Cangiolone.com/builder-example.json). I nomi e i valori dell'esempio sono fittizi, non informazioni ufficiali di Warhammer 40K.
3. Verifica licenza e permessi di utilizzo dei dati, quindi seleziona il file e conferma di possedere i diritti necessari.
4. Importa il file. L'edizione indicata nel JSON diventa disponibile immediatamente ai giocatori autenticati.

Schema sintetico:

```json
{
  "edition": "10",
  "version": "mia-revisione-1",
  "source": "Mia fonte autorizzata",
  "license": "Identificativo licenza o autorizzazione",
  "factions": [{
    "id": "mia_fazione", "name": "Fazione",
    "detachments": [{"id":"mio_distaccamento","name":"Distaccamento"}],
    "units": [{
      "id":"mia_unita", "name":"Unità", "category":"Fanteria", "maxCopies":3,
      "points":[{"models":5,"points":80}],
      "equipment":[{"id":"opzione_1","name":"Opzione","points":10}]
    }]
  }]
}
```

Gli ID devono essere univoci nei rispettivi ambiti, in lettere minuscole, numeri, `_` o `-`. Le miniature e i punti sono numeri interi; i costi di equipaggiamento si sommano per squadra. Per ora l'equipaggiamento non include vincoli di mutua esclusione, i Leader e gli Enhancements non hanno una validazione dedicata, e l'app non esegue scraping né sincronizzazione automatica da siti terzi.

### Verifiche

```sh
node --test tests/builder.test.cjs
node --test tests/regression.test.cjs
```

La regressione completa richiede PHP con `pdo_sqlite`. Prima della distribuzione verificare anche il comportamento MySQL, fare un backup del database e predisporre una credenziale dedicata alle eventuali integrazioni future.

## Email di Warmer su Aruba

Gli account già presenti possono aggiungere e verificare un indirizzo dal **Profilo**. Il cambio password è disponibile dal profilo anche senza invio email. Il recupero dalla pagina di accesso usa un link monouso valido due ore. Cambio e recupero invalidano le altre sessioni.

Con la posta attiva, l’app accoda conferme di iscrizione, inviti selezionati dall’amministratore, messaggi agli iscritti, richieste di conferma del risultato, sblocco della lista per chi l’ha consegnata per primo e riepiloghi. Il riepilogo viene accodato una sola volta per destinatario, quando la giornata ha un esito per tutti gli incontri previsti. I riposi non contano. Ogni messaggio è inviato a un solo destinatario e include un’alternativa in testo semplice.

### Installazione e configurazione

1. Da un computer con PHP 8.1+, OpenSSL e Composer, installa le dipendenze bloccate e carica anche la cartella `Cangiolone.com/vendor` sul server, nella stessa cartella di `mail-worker.php`.

   ```sh
   composer install --working-dir=Cangiolone.com --no-dev
   ```

2. Pubblica anche il nuovo `web.config`, che blocca l’accesso HTTP diretto alle directory `private` e `vendor`. Copia [mail-config.example.php](mail-config.example.php) in `Cangiolone.com/private/mail.php` sul server. Imposta l’URL HTTPS, l’indirizzo e la password della casella Aruba. Genera una password separata da almeno 32 caratteri per `worker_secret`. Conserva entrambi i segreti sul server. Mantieni `config.php` con il database esistente. La configurazione della posta si attiva quando è disponibile il file privato compilato. Le due tabelle email si creano automaticamente.
3. Nel pannello Aruba **Hosting Windows → Scheduled task**, imposta un’attività per `https://cangiolone.com/warmer/mail-worker.php`. Usa `warmer-mail` come utente e `worker_secret` come password. Usa il test URL di Aruba per verificare che l’autenticazione arrivi a PHP. Imposta un intervallo di 30 minuti, se disponibile nel piano. Gli invii accodati partono alla prima esecuzione utile. Lo scheduler è separato dalle iscrizioni e dalla conferma degli incontri. [Guida Scheduled Tasks](https://guide.aruba.it/hosting-e-domini/hosting/hosting-windows/scheduled-task/scheduled-task-creazione-nuovo-task)
4. Verifica prima l’indirizzo del tuo account e prova il recupero password con un account di test. Controlla la consegna, il mittente e l’apertura del link. Le richieste indistinguibili in caso di indirizzo sconosciuto proteggono gli account. Gli errori di trasporto vengono registrati con l’ID della coda e l’invio viene ritentato. Il destinatario e il contenuto sono rimossi dalla coda dopo l’invio o alla scadenza.

Per eseguire manualmente il worker su un ambiente con accesso CLI usa `php Cangiolone.com/mail-worker.php`. La suite usa indirizzi fittizi e cattura HTML e testo localmente con il trasporto di prova. L’invio SMTP su Aruba e il passaggio delle credenziali HTTP dallo scheduler richiedono una verifica sull’hosting.
