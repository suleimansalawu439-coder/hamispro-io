# Hamispro.io Environment Variable Template

This is the safe, version-controlled equivalent of an `.env.example` file. It contains variable names and placeholders only. Copy the relevant names into Vercel's Environment Variables panel or into a local `.env.local` file. Never commit real credentials.

```dotenv
NODE_ENV=development
PORT=3000

# Current Manus runtime: MySQL/TiDB-compatible database URL.
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE

# Manus session and OAuth
JWT_SECRET=replace-with-a-long-random-secret
VITE_APP_ID=replace-with-manus-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=replace-with-owner-open-id
OWNER_NAME=Hamispro Owner

# Manus built-in APIs
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=replace-with-server-forge-key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im
VITE_FRONTEND_FORGE_API_KEY=replace-with-frontend-forge-key

# Cloudflare R2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-with-r2-access-key-id
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-access-key
R2_BUCKET_NAME=hamispro-media
R2_PUBLIC_BASE_URL=https://media.example.com

# AdSense; leave blank until approval and slot creation
VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOT_LEADERBOARD=replace-with-leaderboard-slot-id
VITE_ADSENSE_SLOT_IN_CONTENT=replace-with-in-content-slot-id
VITE_ADSENSE_SLOT_RECTANGLE=replace-with-rectangle-slot-id
VITE_ADSENSE_SLOT_ANCHOR=replace-with-anchor-slot-id

# Optional analytics
VITE_ANALYTICS_ENDPOINT=https://analytics.example.com
VITE_ANALYTICS_WEBSITE_ID=replace-with-analytics-website-id

# Digest provider adapter; empty means scheduled dry-run mode
DIGEST_PROVIDER_WEBHOOK_URL=https://email-adapter.example.com/hamispro/digest

# Planned Supabase PostgreSQL migration; not read by the current MySQL/TiDB runtime
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=replace-with-supabase-anon-key
SUPABASE_DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres
# SUPABASE_SERVICE_ROLE_KEY=server-only-value-never-expose-to-the-browser
```

## Public-versus-server-only rule

Only variables intentionally prefixed with `VITE_` are eligible for the browser bundle. Keep `JWT_SECRET`, `DATABASE_URL`, R2 access keys, `BUILT_IN_FORGE_API_KEY`, `DIGEST_PROVIDER_WEBHOOK_URL`, and any Supabase service-role key server-only. Do not put them in a variable that begins with `VITE_`.
