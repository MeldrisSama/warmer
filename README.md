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
