# warmer

## HTTPS

Le pagine HTTP vengono reindirizzate a `https://cangiolone.com`, mantenendo percorso e query. Le richieste POST via HTTP vengono rifiutate prima di creare una sessione. Il certificato HTTPS deve essere attivo sull'hosting.

L'applicazione usa il valore `HTTPS` fornito dal server. Un eventuale proxy deve configurarlo correttamente. Gli header inoltrati dal client non vengono usati per riconoscere HTTPS.

Il server di sviluppo PHP su loopback accetta HTTP per eseguire i test e lavorare in locale.
Repository che si dedicherà alla costruzione della sezione warmer di cangiolone.com
