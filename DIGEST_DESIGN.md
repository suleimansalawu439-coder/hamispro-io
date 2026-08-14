# Hamispro.io Personalized Digest Design

## Product behavior

The digest starts with a low-friction email signup for the **Ultimate Prompt Cheatsheet**. The signup response includes a private, opaque preferences token. The confirmation state exposes a “Manage your digest preferences” link without requiring a new account or login. Subscribers can select one or more editorial lanes, choose daily or weekly delivery, and select a timezone.

The digest is intentionally preference-driven rather than algorithmically opaque. Topic keys map directly to Hamispro categories: `hacks`, `prompts`, `freebies`, `tutorials`, and `news`. The recurring **The 5-Minute AI Brief** series belongs to `news`; **Prompt Clinic**, **Workflow Autopsy**, and **Free Tool Friday** map to their corresponding category lanes.

## Data model

| Field | Purpose |
|---|---|
| `email` | Unique subscriber address. |
| `topics` | Comma-separated category keys for compact storage; expose as an array in the API. |
| `frequency` | `daily` or `weekly`. |
| `timezone` | IANA timezone label used when calculating the delivery window. |
| `preferenceToken` | Opaque token used by the settings link; it is not an email address and does not grant admin access. |
| `lastDigestSentAt` | Idempotency marker for a future sender. |
| `unsubscribedAt` | Suppression marker that prevents future delivery. |

## Free-tier delivery boundary

Supabase is appropriate for storing subscriber preferences and selecting eligible articles, but it is not an email delivery provider by itself. The production sender should be a low-volume transactional email service with a verified sending domain. A single weekly batch job is the lowest-cost initial design: read active subscribers in bounded pages, select articles by topic and publication window, render a small HTML digest, send, and update `lastDigestSentAt` only after a successful provider response.

Do not use an in-process timer. The job should run through a platform-managed HTTP cron/Heartbeat callback at `/api/scheduled/sendDigest`, with idempotent selection based on `lastDigestSentAt`, `frequency`, and the subscriber timezone. This keeps the serverless process compatible with scale-to-zero operation. The project must be deployed before any platform schedule is created.

## Supabase portability note

The current Manus scaffold uses Drizzle's MySQL/TiDB dialect for its managed development database. The digest tables and APIs are deliberately portable, but Supabase production requires changing the schema imports to `drizzle-orm/pg-core`, switching the database client to a PostgreSQL driver, applying a PostgreSQL migration, and setting a Supabase pooled `DATABASE_URL`. The current digest UI is therefore implemented against the existing project database contract; it should not be described as a live Supabase connection until that dialect migration is completed.

## Suggested delivery sequence

Implement and validate the preference UI first. Add a provider secret and an email sender only after choosing the provider and verifying the sending domain. Then add the `/api/scheduled/sendDigest` Heartbeat handler, deploy, create the single weekly schedule, and verify idempotency with a small owner-only test batch before enabling all subscribers.
