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

## Army Builder (prima versione)

La pagina **Army Builder** è disponibile dopo il login, nel menu principale. Funziona senza nuove dipendenze e mantiene separate le vecchie liste `.txt`.

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
