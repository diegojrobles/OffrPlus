# Offr+

A full-stack web app for finance students to track networking contacts and job applications. Built with **React**, **Vite**, and **Supabase** (auth + Postgres with row-level security).

## Features

- **Secure authentication** — email/password sign up and sign in via Supabase Auth
- **Contacts** — name, company, role, date met, follow-up date, notes
- **Applications** — company, role, status, date applied, notes
- **Dashboard** — summary stats, upcoming follow-ups, recent applications
- **Dark minimal UI** — clean layout with green accent

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migrations in:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_contacts_app_links_resumes.sql`
   - `supabase/migrations/003_pipeline.sql`
   - `supabase/migrations/004_calendar.sql`
3. Under **Authentication → Providers**, enable **Email** (enabled by default).
4. For local dev, you may disable **Confirm email** under Authentication → Settings, or confirm via the email link Supabase sends.
5. Copy your project **URL** and **anon public** key from **Project Settings → API**.

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Application statuses

- Applied
- Phone Screen
- Superday
- Offer
- Rejected
- Withdrawn

## Security

- All tables use **Row Level Security (RLS)** so users only read/write their own rows.
- The anon key is safe in the browser; never expose the **service role** key in frontend code.

## AI keyword analyzer (optional)

This app includes a Supabase Edge Function that can call Claude securely.

1. Deploy the function `supabase/functions/keyword-analyze`.
2. Add a secret in Supabase (Project Settings → Functions → Secrets):
   - `CLAUDE_API_KEY`


## Build

```bash
npm run build
npm run preview
```

Deploy the `dist` folder to Vercel, Netlify, or any static host. Set the same `VITE_*` env vars in your host’s dashboard.
