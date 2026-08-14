# Hamispro.io Vercel Environment Setup Guide

## Purpose

This guide explains how to configure Hamispro.io for Vercel without placing credentials in chat, Git, or deployment artifacts. Real values belong in Vercel's encrypted Environment Variables panel. The repository should contain only `ENVIRONMENT_TEMPLATE.md` and this guide.

> **Security rule:** Never paste `R2_SECRET_ACCESS_KEY`, `JWT_SECRET`, database passwords, or Supabase service-role keys into source files, screenshots, issues, or chat.

## 1. Configure Vercel project environments

Open the Vercel project, navigate to **Settings → Environment Variables**, and add each variable with the correct environment scope. Use **Preview** for a disposable or staging database and **Production** for the live database. Do not reuse a production database for Preview deployments.

| Variable group | Preview | Production | Scope |
|---|---:|---:|---|
| `JWT_SECRET`, `DATABASE_URL`, `OWNER_OPEN_ID` | Required | Required | Server-only |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | Optional for preview | Required for live media uploads | Server-only except public base URL |
| `VITE_ADSENSE_*` | Usually blank | Add after approval | Browser-visible configuration |
| `DIGEST_PROVIDER_WEBHOOK_URL` | Blank or test adapter | Verified provider adapter | Server-only |
| `SUPABASE_*` | Only in a Supabase migration branch | Only after PostgreSQL migration passes | Server-only except anon key |

For each secret, choose **Sensitive** where Vercel offers that option. Limit production access to the project owners and use separate R2 API tokens for Preview and Production. Keep the R2 token scoped to the Hamispro bucket with only the object permissions the application requires.

## 2. Current database contract

The current Hamispro.io runtime uses the Manus full-stack scaffold with Drizzle's MySQL/TiDB dialect. Therefore, the production value currently consumed by the application is `DATABASE_URL` with a MySQL/TiDB-compatible connection string.

Supabase is PostgreSQL. Adding `SUPABASE_DATABASE_URL` alone does not switch the application to Supabase; the server database imports, driver, migration output, and integration tests must first be migrated to the PostgreSQL dialect. Keep Supabase variables documented but inactive until that migration has passed against a disposable Supabase project.

## 3. Configure Cloudflare R2

Create an R2 bucket for media, create a narrowly scoped API token, and set the S3-compatible endpoint in Vercel as `R2_ENDPOINT`. Set `R2_BUCKET_NAME` to the bucket name and `R2_PUBLIC_BASE_URL` to the public custom domain or R2 public URL used to serve objects.

The R2 API token should not be used in browser code. The browser uploads through the owner-only server procedure, and the server writes to R2 through the storage abstraction. Configure the public media domain with the appropriate HTTPS certificate and CORS policy. Do not expose the access key or secret in `VITE_` variables.

## 4. Configure the owner identity

Set `OWNER_OPEN_ID` to the exact Manus OAuth open ID of the owner account. The backend checks this value in `ownerProcedure` for every admin query and mutation. `VITE` client configuration is not used for authorization; the client-side `isOwner` flag is only a user-experience gate.

Set `JWT_SECRET` to a long, random value. Rotating it invalidates existing sessions, so perform rotation deliberately and confirm that the owner can sign in again afterward.

## 5. Admin security controls

Owner mutations use the shared `admin_rate_limit_buckets` table when `DATABASE_URL` is available. The limits are per owner and action: article saves are capped at 30 per minute, media uploads at 10 per minute, and writing-assistant calls at 12 per minute. This shared bucket is what makes throttling effective across Vercel instances and cold starts. The in-memory fallback exists only for database-free local tests and should not be treated as the production enforcement layer.

Administrative actions are also written to `admin_audit_logs` with the owner identity, action, resource type, resource identifier when available, request IP, user agent, and metadata that deliberately excludes article bodies and secrets. Audit writes are best-effort so a transient logging failure does not block publishing; monitor the server logs for `[AdminAudit]` failures.

## 6. Configure AdSense

Leave the AdSense variables blank until the site is approved and the slot IDs exist. After approval, set `VITE_ADSENSE_CLIENT_ID` and the four slot variables. These values are intentionally browser-visible and are not credentials. Do not treat AdSense slot IDs as secrets.

## 7. Configure the personalized digest

The scheduled route `/api/scheduled/sendDigest` is dry-run by default. To enable delivery, set `DIGEST_PROVIDER_WEBHOOK_URL` to a verified server-side email adapter that accepts the Hamispro JSON payload and returns a successful HTTP status only after accepting the message. The handler records `lastDigestSentAt` only after provider acknowledgment, which prevents a repeated scheduled run from sending the same batch indefinitely.

Do not create a production schedule until the application is deployed and the provider adapter has been tested with a disposable subscriber. The schedule must be a platform-managed callback; do not use `setInterval`, `node-cron`, or another in-process timer in a scale-to-zero deployment.

## 8. Local development

For local work, copy the variable names from `ENVIRONMENT_TEMPLATE.md` into `.env.local`. Keep `.env.local` in `.gitignore`. Use a disposable database for schema tests and run the opt-in persistence suite with `TEST_DATABASE_URL`; never point that test at production.

```bash
cp ENVIRONMENT_TEMPLATE.md /tmp/hamispro-env-reference.md
# Create .env.local manually from the variable names; do not copy real production values into Git.
pnpm check
pnpm test
pnpm test:db
pnpm build
```

The regular test suite is safe to run without a database. The database integration suite is skipped unless `TEST_DATABASE_URL` is present, as documented in `DB_INTEGRATION_TESTS.md`.

## 9. Deployment checklist

Before deploying, confirm that the Preview environment uses a disposable database, all server-only values are absent from the browser bundle, R2 uploads are restricted to the owner procedure, and the AdSense slots are blank or approved. After deploying Preview, test owner sign-in, draft save, media upload, audit-log insertion, and digest dry-run behavior. Only then add Production values and deploy the live environment.

For further Vercel configuration details, consult the [Vercel Environment Variables documentation](https://vercel.com/docs/environment-variables) and the [Cloudflare R2 S3 API documentation](https://developers.cloudflare.com/r2/api/s3/api/).
