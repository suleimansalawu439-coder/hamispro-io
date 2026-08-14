# Hamispro.io Deployment Guide: Vercel, Supabase, and Cloudflare R2

This guide walks you through preparing, configuring, and deploying **Hamispro.io** to the **Vercel Free Tier**, backed by **Supabase PostgreSQL** and **Cloudflare R2**.

---

## Architecture Overview

Hamispro.io is engineered for high-performance server-side rendering (SSR) and edge-speed asset delivery:
1. **Frontend & SSR (Vercel):** Server-side rendered React 19 + Vite routes with dynamic meta tags, structured data, and sub-50ms TTFB.
2. **Database (Supabase):** Managed PostgreSQL database accessed via Drizzle ORM using pooled connection strings.
3. **Storage (Cloudflare R2):** S3-compatible object storage with zero egress fees for article cover images and downloadable resources.

---

## Step 1: Set Up Supabase Database

1. Create a free project at [Supabase](https://supabase.com).
2. Go to **Project Settings > Database** and copy the **Connection String (URI)**. Ensure you select the **Pooler** connection string (Port 6543) with `pgbouncer=true` for serverless/Vercel compatibility.
3. Apply the Drizzle schema migrations to your Supabase database:
   ```bash
   export DATABASE_URL="postgres://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
   pnpm drizzle-kit migrate
   ```

---

## Step 2: Set Up Cloudflare R2 Storage

1. Navigate to **R2** in your [Cloudflare Dashboard](https://dash.cloudflare.com) and create a bucket named `hamispro-media`.
2. Generate an **R2 API Token** with `Read and Write` permissions and note down:
   - `R2 Endpoint URL`: `https://[account-id].r2.cloudflarestorage.com`
   - `Access Key ID`
   - `Secret Access Key`
3. Bind a public domain or enable R2.dev public access for the bucket so uploaded assets serve instantly at edge speed.

---

## Step 3: Deploy to Vercel (Free Tier)

1. Push your repository to GitHub.
2. Log in to [Vercel](https://vercel.com) and click **Add New > Project**. Import your Hamispro.io repository.
3. **Build & Development Settings:**
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist/public`
4. **Environment Variables:**
   Add the following variables in **Project Settings > Environment Variables**:
   - `DATABASE_URL`: Your Supabase pooler connection string.
   - `JWT_SECRET`: A secure random signing secret (32+ characters).
   - `R2_ENDPOINT`: Your Cloudflare R2 endpoint URL.
   - `R2_ACCESS_KEY_ID`: Your R2 access key.
   - `R2_SECRET_ACCESS_KEY`: Your R2 secret key.
   - `R2_BUCKET_NAME`: `hamispro-media`
   - `R2_PUBLIC_BASE_URL`: Your R2 public domain or URL.
   - `CANONICAL_ORIGIN`: `https://hamispro.io` (or your assigned `.vercel.app` domain).
5. Click **Deploy**. Vercel will build the SSR bundle and deploy your site globally.

---

## Verification

Once deployed, visit your Vercel deployment URL to verify:
- **SSR & SEO:** Right-click and view page source; confirm that `<title>`, `<meta name="description">`, and `<link rel="canonical">` match the requested article or category.
- **Content Hub:** Test navigation across Hacks, Prompts, Freebies, Tutorials, and News.
- **Vault & Newsletter:** Test resource filtering and newsletter lead-magnet capture.
- **Admin Studio:** Authenticate as the designated owner and test the rich-text authoring desk.
