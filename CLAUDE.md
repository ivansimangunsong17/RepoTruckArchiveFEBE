# Project Instructions

ATMS monorepo: `fe-truck-management-system/` (React + Vite) and `be-truck-management-system/` (Node `node:http` + PostgreSQL, raw SQL). UI text and error messages are in Indonesian.

## Documentation

Before working on a feature, read only the docs relevant to the task:

- `docs/PROJECT_CONTEXT.md`: architecture, modules, roles, deployment
- `docs/BUSINESS_RULES.md`: status flows, locks, permissions per domain
- `docs/DATABASE_OVERVIEW.md`: tables, relationships, constraints, migrations
- `docs/API_CONVENTIONS.md`: routes, auth, responses, errors, new-endpoint checklist
- `docs/CURRENT_STATUS.md`: implemented features, known issues, test status
- `docs/PM2.md`: production runtime (PM2 backend process, static frontend, deploy commands)

Treat docs as snapshots. The code is the source of truth.

## Working Rules

1. Search before reading. Inspect only the files relevant to the task; don't scan the whole repo unless necessary.
2. Understand the existing implementation before editing.
3. Keep the current architecture (routes → controller → service → repository → mapper) unless asked to change it.
4. Change the schema only through a new idempotent migration in `be-truck-management-system/src/db/migrations/`.
5. Keep API compatibility (response shape `{ data, message }` / `{ error: { code, message, details } }`) unless told otherwise.
6. Don't refactor unrelated code. Reuse existing patterns and utilities before adding abstractions.
7. When adding a permission, update both `be/src/modules/users/users.mapper.js` and `fe/src/constants/roles.js`.
8. Don't invent business requirements. Mark uncertainties, and ask the project owner only when implementation can't safely proceed.
9. Update `docs/CURRENT_STATUS.md` after meaningful completed work. Update other docs only when architecture, business rules, schema, or API conventions actually change.

## Process

Task → relevant docs → search → identify affected modules → inspect → minimal change → test/build → update CURRENT_STATUS.md if appropriate → concise summary.

## Testing Safety

- Backend unit tests: `cd be-truck-management-system && DATABASE_URL= node --test`. A plain `npm test` loads `.env`, and if `DATABASE_URL` is set, `src/integration/backend-flow.test.js` **deletes data** in that database. Run it only against a disposable database.
- Backend syntax check: `npm run check`.
- Frontend: `npm run lint`, `npm run test:run` (~5 min), and `npx vite build --outDir <temp dir>` (keeps the existing `dist/` intact).
- Some UI tests time out under heavy CPU load. If a test you didn't touch fails in a full run, re-run it alone (or the suite with `--maxWorkers=1`) before treating it as a regression.
- Run only the checks relevant to the change.
- Never run `scripts/clear-dev-database.js` or `scripts/convert-legacy-vendor-orders.js --apply` without explicit owner approval.

## Final Report

After coding, report only:
- Result
- Files changed
- Tests/build performed
- Remaining issue or risk

Don't repeat large code blocks from files you already edited.
