Aggiunge statistiche personali con filtri richiudibili, risultati e confronti diretti, foto profilo con ritaglio/zoom e avatar in classifica, ricerca rapida nel catalogo anche offline.

Esclude creazione della lista dal roster e stampa, rinviate. Nessun cambiamento a roster e consegne esistenti. L'avatar richiede la nuova colonna nullable aggiunta automaticamente da storage.php.

Verifiche: 150 test superati e 6 opzionali saltati (catalogo reale non fornito), Node/PHP su SQLite isolato; pacchetto dedicato di 12 file con checksum SHA-256, FTPS obbligatorio e verifica PowerShell 5.1, inclusi rifiuto di manomissioni, file estranei e destinazione TEST. Le verifiche browser precedenti sono documentate nelle singole funzioni; l'ultima revisione visiva di ritaglio e filtri è ancora da confermare perché il nuovo tentativo Edge è rimasto bloccato. MySQL/IIS e PWA fisica non provati.

Sostituisce PR28 e PR30; PR29 e PR31 vengono chiuse conservando i branch per riprenderle più avanti. Nessun merge o deploy automatico.
