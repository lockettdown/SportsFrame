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

## Backend setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create private storage buckets for videos, saved frames, and reports.
4. Configure environment variables:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
APP_URL=
```

5. Deploy the API handlers in `api/` to a serverless host that supports raw request bodies for Stripe webhooks.

Every application table includes a `user_id` column and RLS policy tied to `auth.uid()`, so users can only create, read, update, and delete records they own.
