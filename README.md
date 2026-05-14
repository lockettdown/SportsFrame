# DiamondFrame

A clean, CapCut-inspired web app for sport-agnostic coaching video analysis.

## What is included

- Upload a training video or still image from any sport.
- Scrub the timeline, step frame by frame, pause, and capture a still frame.
- Annotate captured frames with freehand drawing, lines, arrows, circles, and text notes.
- Undo or clear annotations.
- Save annotated frames by athlete, session date, notes, and timestamp.
- Compare two videos side by side with independent timelines and optional synced playback.
- Run AI coaching analysis from sampled video frames or a still image.
- Pricing, checkout, billing portal, and premium-gated compare/export actions.
- Supabase schema with private user-owned tables and Row Level Security policies.
- Stripe Checkout, Billing Portal, and webhook endpoint examples.

## Run locally

Install dependencies, then start the app:

```bash
npm install
npm run dev
```

The editor is available at the Vite URL. Without Stripe/Supabase environment variables, payment and auth use demo-mode local state so the editor remains usable.

To connect the browser app to Supabase locally, create `.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

The publishable key is safe for browser use. Do not put service-role keys in `VITE_` variables.

## Backend setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor. For an existing database that already has `saved_frames`, run `supabase/saved_frames_metadata.sql` to add the saved-frame metadata columns.
3. Create private storage buckets for videos, saved frames, and reports.
4. Configure environment variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_ANNUAL_PRICE_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
APP_URL=
```

5. Run `npm run dev` for local development. The local dev server serves both Vite and the `api/` handlers so Stripe Checkout can call `/api/create-checkout-session`.
6. Deploy the API handlers in `api/` to a serverless host that supports raw request bodies for Stripe webhooks.

Every application table includes a `user_id` column and RLS policy tied to `auth.uid()`, so users can only create, read, update, and delete records they own.
