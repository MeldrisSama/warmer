# Regression tests

Latest refinement checks cover mandatory Warlord defaults and server validation, collapsed categories and search, independent Build vs combined Play sheets, dismissible errors that preserve validation, backdrop dismissal and the compact options menu for fixed units. The units export includes army metadata and selected upgrades while omitting weapon details.

Archive groups and creation popups are covered by `builder-archive.test.cjs`. Unified sheet ordering, unavailable Upgrade sections, price deduplication, scroll reset and minimal exports are covered by `builder-refinements.test.cjs`. `scripts/render-builder-preview.cjs <catalog.json> .taste-skill/builder-review` isolates builder snapshots from other visual reviews (keep the output at that directory depth for relative asset paths).

Build / Play, datasheets, automation and archive checks: `node --test tests/builder-refinements.test.cjs tests/builder-datasheets.test.cjs tests/builder-engine.test.cjs tests/builder-archive.test.cjs tests/builder.test.cjs tests/workbench.test.cjs tests/regression.test.cjs`.

`builder-refinements.test.cjs` and `refinements-model.php` check shared replacement limits across model types, defensive gear variants, fixed enhancement weapons and named bearers, fixed-size/non-Character controls, inline keyword lookup and collapsed stratagems. Clipboard checks exercise the export preview and format selector. HTTP checks cover private saved-list preview and league submission as an immutable snapshot, ownership, blind reveal and later edits/deletion in the builder.

Full-catalog UI audit: `node scripts/check-builder-profiles.cjs C:/path/to/wahapedia-11-builder-v5.json`. Checks real Azrael/Inner Circle Companions keyword strength/removal, Lion Helm recipients, Ravenwing grenade ownership/limit, Imperium's Sword and Storm Shield variants. Reads no configuration or database.
The workbench fixture contains synthetic game data. Checks cover copy-dependent prices, manual price overrides, Unique conflicts, DP availability, disposition compatibility, attachment cycles, weapon selections, escaping, persistence and ownership. The full Wahapedia export is kept outside Git. See `docs/builder.md` for import and an isolated HTTP preview.

Additional checks cover grouped faction creation and battle size selection, the Incursion single-3-DP exception, catalog-only search updates, weapon quantity buttons, compatible attachment targets, unattached Support errors, consolidated Play sections and a simulated DOM for the detachment dialog. VM/DOM tests do not establish real-browser responsive behavior.

`automation-model.php` builds a synthetic enriched catalog and exercises recipe compilation, mode synchronisation, server-derived counts, default ownership and ally detachment gating. `builder-engine.test.cjs` covers replacements and resize, future-only defaults, conditional effects, recipient changes, unchanged source profiles, text exports and clipboard output. The HTTP regression suite covers default endpoints and cross-owner isolation.

The separately acquired full catalog stays outside Git. Check it explicitly with `php -d memory_limit=128M tests/builder-catalog.php C:/path/to/wahapedia-11-builder-v4.json`. This normalizes all records, tests all interpreted unit sizes, verifies contingent IDs and the important detachment grants, and checks the real Chainfist replacement, Deep Strike text and optional core reference library. It is not a complete legality audit of every prose restriction.

`builder-datasheets.test.cjs` checks parameterized and qualified weapon keywords, same-unit ability lookup, escaped rendering, catalog-ID dialog lookup and focus return, old catalogs without core rules, and stratagem metadata and operational fields. Workbench checks also verify stratagem deduplication across attached members. Dialog tests use a DOM mock; they do not certify real-browser interaction.

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
