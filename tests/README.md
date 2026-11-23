# Regression tests

Personal statistics: `node --test tests/statistics.test.cjs tests/site-profile.test.cjs tests/theme.test.cjs tests/regression.test.cjs`. Checks cover score orientation, inclusive filters, draws/empty results, deduplication, void exclusion, escaping and filter submission. HTTP regressions verify stable league metadata on confirmed matches and null metadata on friendlies. See `docs/statistiche-personali.md`; browser checks remain necessary for touch layouts and scrolling.

`builder-mobile-loadouts.test.cjs` checks direct single-weapon choices, conservative quantity controls for squads/multiple slots/equipment-defined models, and escaped rule parameters. Its PHP companion verifies the November snapshot repair, explicit values, idempotence and future-snapshot isolation; `BUILDER_CATALOG_PATH` optionally checks all 908 parameterized abilities in the v6 catalog, including Chaos Titan copies. Browser QA must also exercise mobile filters, roster scroll restoration and all six weapon statistics at 320/390px. Run the entire suite with `node --test tests/*.test.cjs` (PHP 8.1+ with SQLite; set `PHP_BINARY` when needed).

Asset checks cover content-hashed JS/CSS URLs on both entry pages, changes with preserved file timestamps, stable URLs for unchanged files, public loading through the router and login/CSRF preservation. Deploy `assets.php` alongside `index.php` and `campionato.php`; upload assets and the helper before the entry pages. Already-open pages use the new files on their next reload.

General site/profile checks: `node --test tests/site-profile.test.cjs tests/theme.test.cjs tests/regression.test.cjs`. They cover the verified/pending email states, Profile header icon, logout from Profile, removed legacy Lists navigation and redirect, escaping, and seven aligned recent-match cells with separate photo/actions columns. The legacy list API and league lineups remain covered by HTTP regressions; hiding the old page does not remove stored data.

The same suite covers read-only list links on standings and recent matches, observer access to league lists after both submissions, no participant controls for observers, and homepage indexing only after a confirmed, non-void result. Saved builder drafts remain owner-only; submitted snapshots survive builder edits/deletion. A single submission and anonymous requests remain protected.

League photo checks cover participant-only upload/replacement after confirmation, cross-season and observer rejection, invalid image data, anonymous downloads, unchanged scores, closed seasons, cancelled matches and rollback preserving the previous file without orphaning the replacement. UI checks verify file limits, observer-only viewing and absence of upload controls before confirmation.

`builder-loadout-rules.test.cjs` / `loadout-rules-model.php` cover bundle consumption, independent row quotas, all-model swaps, footnote thresholds, locked and incompatible equipment, optional slots, numbered bearers, reverse-order dependencies, shared replace-or-add limits and the verified missing plasma profiles. Optional model allocation is preserved through API save/defaults in `automation-model.php`; tampered counts are rejected. Include `tests/builder-loadout-rules.test.cjs` in the full command below.

Latest refinement checks cover mandatory Warlord defaults and server validation, collapsed categories and search, independent Build vs combined Play sheets, dismissible errors that preserve validation, backdrop dismissal and the compact options menu for fixed units. The units export includes army metadata and selected upgrades while omitting weapon details.

Archive groups and creation popups are covered by `builder-archive.test.cjs`. Unified sheet ordering, unavailable Upgrade sections, price deduplication, scroll reset and minimal exports are covered by `builder-refinements.test.cjs`. `scripts/render-builder-preview.cjs <catalog.json> .taste-skill/builder-review` isolates builder snapshots from other visual reviews (keep the output at that directory depth for relative asset paths).

Build / Play, datasheets, automation and archive checks: `node --test tests/builder-loadout-rules.test.cjs tests/builder-refinements.test.cjs tests/builder-datasheets.test.cjs tests/builder-engine.test.cjs tests/builder-archive.test.cjs tests/builder.test.cjs tests/workbench.test.cjs tests/regression.test.cjs`.

Full-catalog client/server comparison: `node scripts/check-builder-loadouts.cjs C:/path/to/wahapedia-11-builder-v6.json` (set `PHP_BINARY` when needed). It exercises every allowed alternative from each default/formation, checks disabled choices, and streams quantities, gear costs and base prices to `tests/builder-loadout-cases.php`. It reads no application configuration or database and writes only ignored QA artifacts. On v6 this verified 11,852 payloads in 1,758 configurations; it does not exhaust every sequence of replacements.

`builder-refinements.test.cjs` and `refinements-model.php` check shared replacement limits across model types, defensive gear variants, fixed enhancement weapons and named bearers, fixed-size/non-Character controls, inline keyword lookup and collapsed stratagems. Clipboard checks exercise the export preview and format selector. HTTP checks cover private saved-list preview and league submission as an immutable snapshot, ownership, blind reveal and later edits/deletion in the builder.

Full-catalog UI audit: `node scripts/check-builder-profiles.cjs C:/path/to/wahapedia-11-builder-v6.json`. Checks real Azrael/Inner Circle Companions keyword strength/removal, Lion Helm recipients, Ravenwing grenade ownership/limit, Imperium's Sword and Storm Shield variants. On v6 it also checks Shadow Spectres' Exarch price, both six-model Headtakers formations and copy-dependent prices, Aquila's ten-model bearer, Cassius' named profiles/gear and jump packs, and the equipped-only Relic Shield bonus. Reads no configuration or database.
The workbench fixture contains synthetic game data. Checks cover copy-dependent prices, manual price overrides, Unique conflicts, DP availability, disposition compatibility, attachment cycles, weapon selections, escaping, persistence and ownership. The full Wahapedia export is kept outside Git. See `docs/builder.md` for import and an isolated HTTP preview.

Additional checks cover grouped faction creation and battle size selection, the Incursion single-3-DP exception, catalog-only search updates, weapon quantity buttons, compatible attachment targets, unattached Support errors, consolidated Play sections and a simulated DOM for the detachment dialog. VM/DOM tests do not establish real-browser responsive behavior.

`automation-model.php` builds a synthetic enriched catalog and exercises recipe compilation, mode synchronisation, server-derived counts, default ownership and ally detachment gating. `builder-engine.test.cjs` covers replacements and resize, future-only defaults, conditional effects, recipient changes, unchanged source profiles, text exports and clipboard output. The HTTP regression suite covers default endpoints and cross-owner isolation.

The separately acquired full catalog stays outside Git. Check it explicitly with `php -d memory_limit=128M tests/builder-catalog.php C:/path/to/wahapedia-11-builder-v4.json`. This normalizes all records, tests all interpreted unit sizes, verifies contingent IDs and the important detachment grants, and checks the real Chainfist replacement, Deep Strike text and optional core reference library. It is not a complete legality audit of every prose restriction.

`builder-datasheets.test.cjs` checks parameterized and qualified weapon keywords, same-unit ability lookup, escaped rendering, catalog-ID dialog lookup and focus return, old catalogs without core rules, and stratagem metadata and operational fields. Workbench checks also verify stratagem deduplication across attached members. Dialog tests use a DOM mock; they do not certify real-browser interaction.

Appearance checks: `node --test tests/theme.test.cjs`. Covers all 20 presets in the dropdown, three custom colors and swatches, browser persistence/reset, malformed or unavailable storage, and contrast on independent light/dark/saturated backgrounds. The Orks check covers explicitly marked menu labels, dynamically rendered menus, restoration on a different preset/custom colors, and unchanged rules/user content. The HTTP suite verifies shared assets and early loading on both entry pages. Preference storage is browser-local and shared by accounts using that browser.

From the repository root, run:

```sh
node --test tests/regression.test.cjs
```

Requirements: Node.js 22+ and PHP 8.1+ with `pdo_sqlite` enabled. No npm or Composer packages are needed. If PHP is not on PATH, specify its executable:

```powershell
$env:PHP_BINARY = 'C:\path\to\php.exe'
node --test tests/regression.test.cjs
```

The suite checks source syntax, storage persistence and rollback, literal wiki credential parsing, standings and ties, HTML escaping, authentication, CSRF, invitation reuse, rate limiting, match permissions and validation, retry deduplication, cancellation, list downloads, and image uploads.

It creates a temporary application copy with a generated configuration, SQLite databases, sessions, and uploads. The HTTP server binds only to `127.0.0.1` on a temporary port. The deployed configuration and existing uploads are never copied or used. The temporary directory and server are removed after the run.

Photo tests enforce authentication, reject direct upload URLs, and verify cleanup after validation or database failures. The temporary server uses the application's development router. The IIS access rule is checked as XML, with its behavior on the deployed IIS server still requiring verification.

Transport tests simulate IIS HTTPS server variables and remote HTTP requests. They verify redirects, rejected HTTP writes, Secure cookies, and HSTS. The loopback-only PHP development server continues to support HTTP.

MySQL locking and SQL compatibility, SQLite concurrency, deployed TLS certificates, backups, and browser rendering are not covered. SQLite integration tests do not establish MySQL correctness.

Ally catalog regressions: `node --test tests/builder-allies.test.cjs` (PHP_BINARY as above). Covers duplicated host-faction datasheets, conditional recruitment, ally points caps, forbidden selections, canonical/host alias display deduplication and runtime correction of stored catalogs without rewriting their payload. Set BUILDER_CATALOG_PATH to a local enriched JSON to also run the real-catalog visibility checks; otherwise only that external-data test is skipped.

Enhancement effect regressions: `node --test tests/builder-enhancements.test.cjs`. Covers qualified keywords, compound stat/keyword effects, bearer scope, native keyword preservation, situational and activated effects left unapplied, added abilities and runtime refresh of existing catalogs without rewriting payloads. Set BUILDER_CATALOG_PATH to include the real Deathwing Knights/Furious Assault example in Build and Play.

PWA checks: `node --test tests/offline.test.cjs` covers transactional synchronization, idempotent retries, concurrent edit/delete conflicts, explicit resolution, ownership, catalog migration and automatic point changes without content conflicts. Optional browser integration: `node scripts/check-pwa-browser.cjs [catalog.json]`, using installed Chromium (CHROME_PATH optional) and PHP_BINARY. It creates its own nested app, SQLite, sessions and browser profile in ignored `.taste-skill`, tests cold offline startup, saving, reconnect, conflict UI, account isolation, points refresh, browser-only restrictions, cache exclusions and responsive widths. Standalone detection is simulated; physical mobile installation remains a separate check. See [PWA details](../docs/pwa-offline.md).

Deployment package checks: `node --test tests/pwa-test-release.test.cjs` builds a fixture release without production config, checks SQLite seed/user separation, test session and manifest, worker cache namespaces, token-protected diagnostic/setup HTTP behavior, and Windows PowerShell upload validation (checksums and allowed destinations). No FTP connection is made. Instructions for the operator: [iPhone test deployment](../docs/prova-pwa-ios.md).


`ui-feedback.test.cjs` covers the six original SVG loaders, native/ally category separation, conditional Army Builder navigation, dismissible connection notices and the automatic conflict dialog with explicit choices and offline preservation. Component/VM checks do not establish visual browser behavior. The browser QA script is updated for SVG loaders, dismiss buttons and automatic dialogs; a restricted environment may prevent launching Edge/CDP.
# Audit costi del catalogo

`php -d memory_limit=256M scripts/audit-builder-costs.php percorso/catalogo.json [report.json]` controlla i prezzi di tutte le fazioni, taglie e fasce di copie senza usare configurazione o DB. `tests/builder-costs.test.cjs`, con `BUILDER_CATALOG_PATH`, verifica anche PHP/JavaScript, lettura del catalogo già importato, salvataggio e default su SQLite in memoria. Lo snapshot corretto conserva i prezzi originali della fonte.
