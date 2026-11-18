# Regression tests

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
