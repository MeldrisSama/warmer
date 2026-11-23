# Lista dal roster ufficiale

Nel campionato il comando **Crea lista dal roster** apre una nuova bozza del builder, vuota e distinta dal pool. Il catalogo mostra soltanto le unita dichiarate; se esistono piu copie, il giocatore sceglie quella con le riserve desiderate. Ogni copia conserva taglia e composizione; le dotazioni gratuite restano modificabili e i potenziamenti sono scelti normalmente nella lista.

Il riferimento `rosterSource` viene conservato nei salvataggi e nell'offline esistente. Il server rilegge sempre il roster del proprietario: copie, taglie, composizione, equipaggiamenti extra e limite partita sono verificati prima del salvataggio. Warlord e distaccamenti possono restare incompleti in una bozza. Nessun salvataggio consegna automaticamente la lista: la consegna resta nel campionato e usa tutti i controlli gia presenti sul roster attuale.

Una lista derivata conserva il catalogo storico del proprio roster anche durante la sincronizzazione. Per una nuova versione ripartire dal comando nel campionato. I roster e le consegne definitive precedenti restano immutati. Nessuna migrazione o rigenerazione del catalogo.

File: api.php, league-roster.php, builder-model.php, builder-sync.php, builder.js, builder-engine.js, builder-workbench.js, campionato.js. Moduli PHP prima dell'API; script e shell PWA usano gli hash esistenti.

Verifiche HTTP con SQLite isolato: autenticazione/proprietario, snapshot contraffatto, copie estranee, taglie, limite, conservazione del riferimento anche se omesso in un aggiornamento, bozze incomplete, sincronizzazione con catalogo attivo diverso e vecchie consegne. Edge 320/390/1440 con selezione copie, blocco duplicati, riserve, salvataggio e riapertura simulati; API reali provate dai test HTTP. Safari fisico/MySQL/IIS non provati.
