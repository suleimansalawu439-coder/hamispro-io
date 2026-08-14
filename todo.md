# Hamispro.io TODO

- [x] Define database schema for articles, categories, resources/freebies, and newsletter subscribers
- [x] Implement query helpers and tRPC routers for public articles, vault items, newsletter signup, and admin management
- [x] Build top navigation bar with search, category links, theme toggle, and mobile menu
- [x] Build magazine-style homepage with hero section, trending hacks, latest articles, and freebies spotlight
- [x] Build category listing and article detail pages with TOC, reading time, code blocks, and copy-to-clipboard prompts
- [x] Build Freebies & Resource Vault with search and filter capabilities
- [x] Build Google AdSense-ready ad slots (header leaderboard, in-content units, sidebar sticky, footer anchor)
- [x] Build email newsletter signup for the "Ultimate Prompt Cheatsheet" lead magnet
- [x] Build owner-only admin publishing panel with rich text editor, category tags, and publishing controls
- [x] Integrate LLM writing assistant in admin panel for summaries, SEO meta descriptions, and tag suggestions
- [x] Write unit tests and verify build & visual presentation
- [ ] Revisit Cloudflare R2 credentials and enable production media uploads before launch
- [x] Replace the admin body textarea with a verified rich-text/markdown authoring experience
- [x] Wire actual AdSense script and configurable slot IDs into the ad placements
- [ ] Verify R2 upload and public serving end-to-end after credentials are supplied
- [x] Enforce strict owner-openId access in both admin backend and frontend
- [x] Add owner-allowed and non-owner-admin-denied authorization tests
- [ ] Verify authenticated owner save-draft and publish flows after the editor swap
- [ ] Re-validate owner create/edit/publish flows after the rich-text editor replacement
- [x] Mark successful digest batches idempotently and test repeated-run suppression
- [x] Add DB-backed persistence tests or a documented disposable database test harness for digest preferences and series metadata
- [x] Add a scheduled /api/scheduled/sendDigest delivery scaffold with bounded idempotent selection
- [x] Add integration-level helper tests for digest preferences and recurring-series persistence
- [x] Define Hamispro.io editorial voice and recurring content series in project documentation
- [x] Add recurring-series metadata to articles and expose it in the owner admin workflow
- [x] Add newsletter topic preferences and personalized digest subscription data model
- [x] Add a digest-preferences UI and free-tier-safe digest delivery boundary
- [x] Add tests for recurring series metadata and digest preference persistence
- [ ] Implement rate limiting and audit logging for admin backend mutations
- [x] Create sanitized environment template document equivalent for Vercel deployment
- [x] Write detailed Vercel environment variable setup guide
- [ ] Add unit tests covering rate-limiting throttle and audit log recording
- [x] Replace in-memory admin rate limiting with a shared durable store compatible with Vercel/serverless instances
- [ ] Add durable rate-limit behavior verification across repeated requests
- [ ] Run the opt-in durable rate-limit integration test against a disposable database
- [ ] Design and implement automated AI intelligence ingestion pipeline (RSS, APIs, releases)
- [ ] Implement model-routing intelligence across DeepSeek-V4-Flash, DeepSeek-V4-Pro, glm-5.2, MiniMax3, and Qwen-3.6.7
- [x] Build owner review queue and AI-assisted editorial refinement workflow before publishing
- [x] Add scheduled ingestion handler and test coverage for the automated intelligence pipeline
- [x] Add explicit LLM-powered review-queue refinement actions for summary, angle, tags, and takeaways
- [x] Add review-queue procedure and publish-handoff tests
- [x] Add visible review-queue query and mutation error states

- [x] Show selected review-item load errors inside the populated detail panel and add a focused regression check

- [x] Fix upsertEditorialItem or add updateEditorialEnrichment so ingestion pipeline correctly persists scores, summaries, tags, modelUsed, and ready status
- [x] Add unit test coverage for editorial ingestion pipeline and scheduled cron handler

- [x] Add direct unit tests covering runEditorialIngestionPipeline parsing, enrichment, and run finalization

- [x] Add explicit failure-path unit tests for runEditorialIngestionPipeline and execute vitest run across all ingestion tests

- [x] Replace generic admin navigation with a rich owner operations sidebar and routed pages
- [x] Implement data-backed dashboard metrics for users, sessions, pageviews, article reads, searches, newsletter signups, ad views, ad clicks, and estimated revenue
- [x] Implement analytics, ads and revenue, sources, newsletter, activity, and settings owner pages
- [x] Add public event tracking for pageviews, article reads, searches, newsletter signups, ad views, and ad clicks
- [x] Add source health and ingestion run monitoring to the owner backend
- [x] Add freshness, evidence/provenance, story verification, and editorial diff workflows
- [ ] Complete launch-readiness verification for R2, owner publish flows, and durable security behavior

- [x] Add explicit error and retry states for ads, sources, runs, activity, and settings owner queries instead of silently rendering empty states
- [x] Make the Ads & Revenue page use real event-derived ad metrics rather than static placement fields
- [x] Add focused tests covering owner-page query failure states for ads, sources, activity, and settings

- [x] Separate event-derived ad impressions/clicks from provider-reported revenue with explicit backend fields and tests
- [x] Add render-level owner-page tests for visible Ads, Sources, Activity, and Settings error notices with retry controls

- [x] Add branch-level render tests for AdminOperationsPage or each owner view when Ads, Sources/Runs, Activity, and Settings queries fail

- [x] Add date-range filters and CSV export to the analytics dashboard and backend procedure
- [x] Add dark mode toggle and customizable theme settings in the owner Settings tab and backend persistence
- [x] Add test coverage for date-range analytics filtering, CSV export formatting, and theme settings persistence
- [x] Add backend tests for getDashboardMetrics(days) and dashboardMetricsCsv range-specific behavior
- [x] Add persistence tests for owner.theme and owner.accentColor system settings save-and-reload behavior
