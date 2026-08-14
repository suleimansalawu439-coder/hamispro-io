# Hamispro.io Database Integration Tests

The default `pnpm test` suite is intentionally isolated from the project database. It covers router contracts, fallback behavior, and scheduled delivery with mocks. Persistence tests are opt-in and must use a disposable MySQL/TiDB database or a separate Supabase test project.

## Run the real persistence path

1. Create a disposable test database that contains the Hamispro schema. Do not point this command at the development, staging, or production database.
2. Set `TEST_DATABASE_URL` to that disposable database connection string.
3. Run the migrations against that database with `DATABASE_URL="$TEST_DATABASE_URL" pnpm drizzle-kit migrate`.
4. Execute `TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm test:db`.

The integration test generates unique email and article identifiers, verifies subscribe → read → update → read behavior, verifies recurring-series article create/update/read behavior, and removes only those generated rows from the disposable database in teardown. When `TEST_DATABASE_URL` is absent, the test is skipped so ordinary CI and preview builds remain safe.
