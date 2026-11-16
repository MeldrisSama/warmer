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

- Con la posta attiva, la registrazione con **codice amico** chiede anche l'indirizzo email e invia il link di verifica automaticamente.
- In **+ Giocatore**, un amministratore può generare un codice amico o inviare un link personale via email. Il link vale sette giorni e si usa una volta sola. L'account creato tramite quel link ha già verificato l'indirizzo a cui è stato inviato.
- Un utente già connesso senza email vede un banner con un collegamento al **Profilo**. Chi accede con nome utente e password inserisce l'indirizzo subito dopo il login. Per la prima associazione basta la sessione attiva. Per sostituire un indirizzo già verificato serve la password attuale.
- Si accede con nome utente o email verificata e password. Il cambio password è disponibile dal profilo anche senza invio email. Il link di recupero vale due ore e si usa una volta sola. Cambio e recupero invalidano le altre sessioni.

Con la posta attiva, l'app prova a inviare subito tutte le email, dopo aver salvato l'azione che le genera. Il riepilogo parte quando viene confermato l'ultimo risultato della giornata. I riposi non contano. Ogni messaggio è individuale e include un’alternativa in testo semplice. In caso di errore Warmer registra il tentativo nel log PHP. Dal Profilo l'utente può chiedere un nuovo link di verifica. Gli invii automatici hanno un solo tentativo per messaggio.

### Installazione e configurazione

1. Su un computer con PHP 8.1+, OpenSSL e Composer, installa le dipendenze. Pubblica con FTPS o con il File Manager Aruba il contenuto di `Cangiolone.com/` nella cartella esistente `/warhammer/`. Carica anche `vendor/` accanto a `mail-delivery.php`. Conserva il `config.php` in uso e la cartella delle foto `uploads/`.

   ```sh
   composer install --working-dir=Cangiolone.com --no-dev
   ```

2. Carica `web.config`, che blocca l’accesso HTTP diretto a `private/` e `vendor/`. Se `/warhammer/private/mail.php` è già configurato, mantienilo. Per una prima installazione, usa [mail-config.example.php](mail-config.example.php). Imposta `base_url` a `https://www.cangiolone.com/warhammer/`, `smtp_host` a `smtps.aruba.it` e `smtp_port` a `465`. `username` e `password` sono le credenziali della casella. Le tabelle esistenti sono compatibili. [Parametri SMTP di Aruba](https://guide.aruba.it/hosting-e-domini/email/configurazione-posta/parametri-configurazione-posta)
3. Se esiste il task Aruba **Warmer email**, disabilitalo. `mail-worker.php` risponde `410`. Gli invii nuovi partono dalla richiesta che li genera. Se c'erano messaggi ancora in attesa nel vecchio sistema, richiedi un nuovo invito o link quando serve.
4. Verifica il tuo indirizzo dal Profilo, poi prova un invito e il recupero password con un account di test. Controlla il mittente e l’apertura dei link. Se la consegna fallisce, consulta i log PHP.

La suite usa indirizzi fittizi e cattura HTML e testo localmente. L’invio SMTP reale richiede una verifica sull’hosting.
