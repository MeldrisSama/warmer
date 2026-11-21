# Riparazione dei costi omessi dal catalogo

21 novembre 2026. Audit di tutte le 1.487 schede dello snapshot 2026-11-12 23:45:38: **88 schede riparate in 18 fazioni**, di cui 73 senza prezzi e 15 con taglie parziali.

Cause: valori CSV come ` 120` scartati da `ctype_digit`, didascalie di composizione che interrompevano il parser, fasce `6-10 models` non riconosciute. Il parser condiviso recupera i costi dallo stesso snapshot; conserva i prezzi già presenti, le fasce per copia e i sovrapprezzi delle ricette. Ordina le taglie ripristinate affinché la nuova unità parta dalla più piccola.

La riparazione avviene nella normalizzazione e nella lettura/validazione dei cataloghi già importati dello snapshot interessato. Ricompila soltanto le ricette delle unità interessate. Non riscrive cataloghi o liste nel DB e non richiede reimportazione. Una lista con costo manuale esplicito mantiene quel valore.

| Fazione | Schede riparate |
|---|---:|
| Adeptus Mechanicus | 3 |
| Aeldari | 17 |
| Astra Militarum | 6 |
| Adepta Sororitas | 5 |
| Chaos Daemons | 7 |
| Chaos Space Marines | 1 |
| Death Guard | 4 |
| Drukhari | 3 |
| Emperor’s Children | 6 |
| Genestealer Cults | 9 |
| Leagues of Votann | 5 |
| Necrons | 5 |
| Imperial Knights | 2 |
| Chaos Knights | 4 |
| T’au Empire | 1 |
| Thousand Sons | 3 |
| Tyranids | 4 |
| World Eaters | 3 |

Unico costo assente anche nella fonte: Sir Hekhtur, che entra in gioco alla distruzione di Canis Rex. Non è stato inventato un costo separato.

Verifiche: 4.828 prezzi alle estremità delle fasce di copie, sia PHP sia JavaScript; tutte le taglie delle ricette valide; lettura del vecchio payload, validazione di Eldrad e salvataggio default su SQLite isolato; riparazione idempotente. Conversione completa ripetuta dai CSV: 1.487 schede, nessuna nuova omissione di costi. Il catalogo originale resta intatto.

Comando audit: `php -d memory_limit=256M scripts/audit-builder-costs.php catalogo.json report.json`.

## Adeptus Mechanicus

- Tech-priest Dominus (`000000839`) — prezzo assente.
- Kataphron Destroyers (`000000842`) — taglie incomplete.
- Skitarii Vanguard (`000000849`) — prezzo assente.

## Aeldari

- Eldrad Ulthran (`000000568`) — prezzo assente.
- Avatar of Khaine (`000000581`) — prezzo assente.
- Farseer Skyrunner (`000000583`) — prezzo assente.
- Warlock (`000000585`) — prezzo assente.
- Warlock Skyrunners (`000000587`) — taglie incomplete.
- Spiritseer (`000000588`) — prezzo assente.
- Storm Guardians (`000000590`) — prezzo assente.
- Windriders (`000000591`) — taglie incomplete.
- Dire Avengers (`000000593`) — prezzo assente.
- Shining Spears (`000000602`) — prezzo assente.
- Dark Reapers (`000000607`) — prezzo assente.
- War Walkers (`000000612`) — taglie incomplete.
- Corsair Voidscarred (`000002532`) — prezzo assente.
- Shadowseer (`000002535`) — prezzo assente.
- The Visarch (`000002543`) — prezzo assente.
- Autarch Wayleaper (`000002759`) — prezzo assente.
- Corsair Skyreavers (`000004196`) — prezzo assente.

## Astra Militarum

- Cadian Command Squad (`000002609`) — prezzo assente.
- Cadian Shock Troops (`000002612`) — taglie incomplete.
- Catachan Jungle Fighters (`000002614`) — prezzo assente.
- Tempestus Aquilons (`000003834`) — prezzo assente.
- Krieg Command Squad (`000003889`) — prezzo assente.
- Catachan Heavy Weapons Squad (`000003894`) — prezzo assente.

## Adepta Sororitas

- Imagifier (`000000900`) — prezzo assente.
- Repentia Squad (`000000907`) — prezzo assente.
- Junith Eruita (`000002064`) — prezzo assente.
- Sisters Novitiate Squad (`000002507`) — prezzo assente.
- Intranzia Fraye (`000004215`) — prezzo assente.

## Chaos Daemons

- Skull Cannon (`000001116`) — prezzo assente.
- Kairos Fateweaver (`000001117`) — prezzo assente.
- Beasts Of Nurgle (`000001134`) — prezzo assente.
- Daemonettes (`000001142`) — prezzo assente.
- Seekers (`000001145`) — taglie incomplete.
- Fluxmaster (`000001464`) — prezzo assente.
- Shalaxi Helbane (`000001648`) — prezzo assente.

## Chaos Space Marines

- Vashtorr The Arkifane (`000002679`) — prezzo assente.

## Death Guard

- Noxious Blightbringer (`000001058`) — prezzo assente.
- Foul Blightspawn (`000001367`) — prezzo assente.
- Myphitic Blight-hauler (`000001374`) — prezzo assente.
- Mortarion (`000001377`) — prezzo assente.

## Drukhari

- Shadowseer (`000004159`) — prezzo assente.
- Corsair Voidscarred (`000004169`) — prezzo assente.
- Corsair Skyreavers (`000004199`) — prezzo assente.

## Emperor’s Children

- Fulgrim (`000004077`) — prezzo assente.
- Sorcerer (`000004085`) — prezzo assente.
- Shalaxi Helbane (`000004094`) — prezzo assente.
- Daemonettes (`000004095`) — prezzo assente.
- Fiends (`000004096`) — taglie incomplete.
- Seekers (`000004098`) — taglie incomplete.

## Genestealer Cults

- Neophyte Hybrids (`000000512`) — taglie incomplete.
- Acolyte Hybrids With Hand Flamers (`000003716`) — taglie incomplete.
- Von Ryan’s Leapers (`000003888`) — prezzo assente.
- Cadian Command Squad (`000003939`) — prezzo assente.
- Krieg Command Squad (`000003941`) — prezzo assente.
- Cadian Shock Troops (`000003948`) — taglie incomplete.
- Catachan Jungle Fighters (`000003949`) — prezzo assente.
- Death Korps Of Krieg (`000003950`) — prezzo assente.
- Catachan Heavy Weapons Squad (`000003968`) — prezzo assente.

## Leagues of Votann

- Brôkhyr Iron-master (`000002597`) — prezzo assente.
- Hearthkyn Warriors (`000002598`) — prezzo assente.
- Buri Aegnirssen (`000004140`) — prezzo assente.
- Cthonian Earthshakers (`000004145`) — prezzo assente.
- Berehk Stornbröw (`000004201`) — prezzo assente.

## Necrons

- Necron Warriors (`000000534`) — taglie incomplete.
- Plasmancer (`000002108`) — prezzo assente.
- Canoptek Reanimator (`000002112`) — prezzo assente.
- Lokhust Lord (`000002351`) — prezzo assente.
- The Silent King (`000002360`) — prezzo assente.

## Imperial Knights

- Tech-priest Dominus (`000003839`) — prezzo assente.
- Skitarii Vanguard (`000003843`) — prezzo assente.

## Chaos Knights

- War Dog Stalker (`000002563`) — prezzo assente.
- War Dog Karnivore (`000002564`) — prezzo assente.
- War Dog Brigand (`000002565`) — prezzo assente.
- War Dog Huntsman (`000002566`) — prezzo assente.

## T’au Empire

- Commander Farsight (`000000406`) — prezzo assente.

## Thousand Sons

- Tzaangor Shaman (`000001472`) — prezzo assente.
- Tzaangor Enlightened (`000001474`) — taglie incomplete.
- Kairos Fateweaver (`000004123`) — prezzo assente.

## Tyranids

- Tyrant Guard (`000000471`) — taglie incomplete.
- Zoanthropes (`000000475`) — taglie incomplete.
- Toxicrene (`000000497`) — prezzo assente.
- Von Ryan’s Leapers (`000002693`) — prezzo assente.

## World Eaters

- Angron (`000002621`) — prezzo assente.
- Lord Invocatus (`000002623`) — prezzo assente.
- Lord on Juggernaut (`000002625`) — prezzo assente.
