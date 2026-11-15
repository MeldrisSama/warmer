# Regression tests

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

Two executable TODO cases document existing problems: orphan photos after a rejected match and unauthenticated static photo access. They currently fail as TODOs without failing the suite. When each problem is fixed, remove its `todo` option so it becomes a required regression test.

MySQL locking and SQL compatibility, SQLite concurrency, hosting HTTPS, backups, and browser rendering are not covered. SQLite integration tests do not establish MySQL correctness.
