# Immagine profilo

Ogni utente puo caricare, sostituire e rimuovere la propria foto dal Profilo. Il browser ritaglia al centro e converte in JPEG 256 x 256, massimo 48 KiB; accetta sorgenti JPG/PNG/WebP fino a 10 MiB. Il server verifica formato reale, MIME, dimensioni e peso indipendentemente dal browser.

La foto compare nel Profilo e nel collegamento account. Lettura autenticata, CSRF per scritture, nessuna cache offline. La colonna nullable `w40k_users.avatar` viene aggiunta in modo idempotente al primo accesso (richiede ALTER); contiene il piccolo data URL, mai incluso nello state JSON. Nessun file da ripulire o cartella da esporre. Sostituzione e rimozione sono transazionali.

Rilascio: storage.php, api.php, style.css e app.js; caricamento standard degli asset con hash e revisione shell PWA automatica. Nessuna modifica a config o dati di gioco.

Verifiche: 48 test PASS (profilo, temi, HTTP/SQLite e migrazione storage); Edge 320/390/1440 con upload PNG realmente convertito, salvataggio/rimozione simulati e nessun overflow. API reali coperte dai test HTTP, non dal browser. Safari/iPhone, MySQL e IIS non provati.
