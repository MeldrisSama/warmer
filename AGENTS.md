# Repository Guidelines

## Project Scope

This is a hobby project for a small, private Warhammer 40k gaming group. Prioritize reliability, security, maintainability, and a pleasant interface. Improve the existing structure incrementally and justify new dependencies or architectural layers.

Keep this guide updated with shared contributor instructions and current commands. Store personal preferences, local environment details, investigation notes, and pending plans in the external project memory.

## Project Structure & Module Organization

This repository contains the Warhammer 40k section of cangiolone.com. Application files live directly in `Cangiolone.com/`:

- `index.php`: HTML shell and security headers.
- `app.js` and `style.css`: browser interface, client behavior, and responsive styles.
- `api.php`: JSON endpoints, sessions, authentication, validation, and photo uploads.
- `storage.php`: PDO persistence through `SectorStorage`, supporting MySQL and SQLite.
- `config.php`: application and database settings.
- `builder.js`, `builder-workbench.js`, `builder-engine.js` and `builder.css`: archive, army editor, profiles and loadout interactions.
- `builder-model.php`, `builder-v2.php`, `builder-automation.php`, `builder-loadout-rules.php` and `builder-source-fixes.php`: versioned catalogs, validation, recipes and curated source repairs.
- `uploads/matches/`: match photos; preserve existing attachments.
- `web.config`: IIS default-document and directory-browsing configuration.

## Build, Test, and Development Commands

Run commands from the repository root. Use PHP 8.1 or newer, with the PDO driver for your selected database. No asset build or package installation is configured.

- `php -S localhost:8000 -t Cangiolone.com Cangiolone.com/router.php`: serve the application locally with its development router; open `http://localhost:8000`.
- `php -l Cangiolone.com/api.php`: check PHP syntax; repeat for `index.php`, `storage.php`, and `config.php`.
- `node --check Cangiolone.com/app.js`: check JavaScript syntax when Node.js is available.
- `node --test tests/regression.test.cjs`: run regressions with Node.js 22+ and PHP 8.1+ with `pdo_sqlite`; set `PHP_BINARY` if PHP is not on PATH. See `tests/README.md`.
- Full application, builder, theme and HTTP suite: `node --test tests/*.test.cjs`.

Use an isolated database for API checks. MySQL credentials come from the sibling `wiki/LocalSettings.php`; SQLite settings require `driver: sqlite` and a writable `path`.

## Coding Style & Naming Conventions

Follow adjacent code: four-space PHP blocks, two-space JavaScript blocks, camelCase functions and variables, and PascalCase classes. Keep PHP strict types, native browser APIs, and Italian interface text. No formatter or linter is configured. Avoid unrelated reformatting of the compact CSS and HTML.

## Testing Guidelines

Tests use Node's built-in runner and PHP, with no package dependencies or coverage threshold. The runner uses a temporary application copy, generated SQLite configuration, sessions, and uploads. Coverage includes storage rollback, credential parsing, standings, escaping, authentication, CSRF, invites, rate limiting, permissions, matches, lists, private photos, themes and builder workflows. Do not assume VM/DOM tests establish responsive browser behavior: verify real browser interaction and scrolling, including dialogs, on small and desktop viewports. MySQL and concurrent requests remain untested.

Game data stays outside Git. Full-catalog checks accept an explicit local JSON path and never load deployment configuration: `php -d memory_limit=256M tests/builder-catalog.php <catalog.json>`, `node scripts/check-builder-profiles.cjs <catalog.json>` and `node scripts/check-builder-loadouts.cjs <catalog.json>`. Read `docs/builder-dotazioni.md` before changing recipes. Preserve historical catalogs/lists; fixes belong in the converter or curated source mappings, not only in a generated JSON file.

## Commit & Pull Request Guidelines

History uses short Italian and English subjects without enforced prefixes. Use descriptive subjects. PRs should explain changes, list validation, link relevant issues, and show screenshots for UI changes.

Preserve the configured author identity and never add coauthor trailers. Keep unrelated worktrees and branches untouched.

## Security & Configuration

Never test against the configured deployed database or commit credentials, local databases, or private uploads. Preserve CSRF checks, authorization, output escaping, upload validation, and transactional error handling.
