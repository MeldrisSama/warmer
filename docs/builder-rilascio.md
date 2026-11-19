# Rilascio Army Builder v6

Il branch builder-build-play integra main aggiornato a 8a7cbb3 (inclusi i temi della PR #12). Commit di integrazione 30c3ca3. Verifica locale: merge senza conflitti residui, 94 test passati, nessun deploy effettuato.

## Percorso sul server

Directory applicativa Aruba/IIS gi? indicata per il progetto: **/cangiolone.com/warhammer/**. I percorsi sotto sono relativi a questa directory, dove si trova index.php. Il percorso fisico interno del provider non ? stato verificato in questa sessione.

La versione del repository deve essere quella della PR builder, con main integrato; evitare file presi dal vecchio worktree dei temi.

## File da caricare

Per il solo delta builder rispetto a main sono necessari questi 12 file nella directory applicativa:

- api.php
- builder-automation.php
- builder-engine.js
- builder-loadout-rules.php
- builder-model.php
- builder-source-fixes.php
- builder-v2.php
- builder-workbench.js
- builder.css
- builder.js
- campionato.js
- index.php

Il pacchetto locale di rilascio include anche questi 6 file condivisi dei temi, identici a main, cos? tutti i riferimenti del nuovo index.php funzionano anche se la PR temi non era ancora stata caricata sul server:

- app.js
- style.css
- theme.js
- theme.css
- campionato.php
- campionato.css

Caricare inoltre **tutti i 38 file** sotto /cangiolone.com/warhammer/assets/factions/, mantenendo questa struttura:

- assets/factions/LICENSE.txt
- assets/factions/UPSTREAM-README.md
- assets/factions/ac.svg
- assets/factions/adm.svg
- assets/factions/ae.svg
- assets/factions/am.svg
- assets/factions/aoi.svg
- assets/factions/as.svg
- assets/factions/cd.svg
- assets/factions/csm.svg
- assets/factions/dg.svg
- assets/factions/dru.svg
- assets/factions/ec.svg
- assets/factions/gc.svg
- assets/factions/gk.svg
- assets/factions/lov.svg
- assets/factions/manifest.json
- assets/factions/nec.svg
- assets/factions/ork.svg
- assets/factions/qi.svg
- assets/factions/qt.svg
- assets/factions/sm.svg
- assets/factions/sm_black_templars.svg
- assets/factions/sm_blood_angels.svg
- assets/factions/sm_dark_angels.svg
- assets/factions/sm_deathwatch.svg
- assets/factions/sm_imperial_fists.svg
- assets/factions/sm_iron_hands.svg
- assets/factions/sm_raven_guard.svg
- assets/factions/sm_salamanders.svg
- assets/factions/sm_space_wolves.svg
- assets/factions/sm_ultramarines.svg
- assets/factions/sm_white_scars.svg
- assets/factions/tau.svg
- assets/factions/tl.svg
- assets/factions/ts.svg
- assets/factions/tyr.svg
- assets/factions/we.svg

Totale pacchetto completo: **56 file**, di cui 18 nella directory applicativa e 38 in assets/factions. Per il solo delta builder con temi gi? pubblicati bastano 50 file (12+38). La cartella warhammer del pacchetto corrisponde alla directory warhammer gi? presente sul server: copiarne i contenuti, evitando un livello warhammer/warhammer. Il manifest locale riporta SHA-256 per ciascun file.

Il router.php aggiornato serve al server PHP locale e non occorre su IIS. Non caricare test, scripts, documentazione o screenshot. Conservare config.php, web.config, configurazione PHP/IIS, database e uploads esistenti; non sono inclusi nel pacchetto. Non usare configurazioni o database delle anteprime.

## Catalogo e requisiti di importazione

1. Caricare i file PHP e gli asset della stessa versione; aprire quindi l'app e ricaricare gli asset del browser.
2. Dal builder, come amministratore, aprire **Torna alle armate ? Catalogo e backup ? Importa catalogo JSON** e selezionare il file locale wahapedia-11-builder-v6.json (11.681.240 byte). Non caricare il JSON nella directory pubblica del sito tramite FTP.
3. Verificare la versione **2026-11-12 23:45:38 ? b6-8c6437a9**. Le nuove liste usano questo snapshot. Per quelle vecchie usare **Crea copia col catalogo attivo**, poi rivedere composizione e dotazioni; gli originali rimangono invariati.

File JSON locale: C:/Users/manue/Documents/ChatGPT/cangiolone/catalogo-wahapedia-11/wahapedia-11-builder-v6.json. Il catalogo ? fuori Git e fuori dal pacchetto pubblico.

L'importazione passa via JSON nell'API: post_max_size deve consentire almeno32M e l'hosting deve permettere almeno256M di memoria per l'importazione. L'app tenta di portare memory_limit a256M se inferiore. Un limite imposto dal provider va adeguato nel pannello hosting. Su MySQL verificare inoltre max_allowed_packet sufficiente per il catalogo; l'hosting MySQL/IIS non ? stato provato, mentre le prove applicative usano SQLite isolato. Nessuna migrazione SQL manuale richiesta: l'app crea la tabella dei default con CREATE TABLE IF NOT EXISTS usando l'utente database configurato, che deve avere i permessi necessari.

## Verifiche dopo upload

Aprire archivio e creazione lista, controllare icone, scelta distaccamenti e schede Build/Play; provare salvataggio/riapertura e copia di una lista storica, export e selezione nel campionato. Verificare anche la pagina Aspetto, perch? i temi sono conservati nell'integrazione. Non ? ancora disponibile l'accesso offline: liste e datasheet di intere fazioni sono attivit? futura registrata nella memoria locale.
