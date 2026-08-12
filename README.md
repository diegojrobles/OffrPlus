# Offr+

A networking pipeline for finance students.

Recruiting for finance is a hundred small follow-ups pretending to be one big
decision. You email an analyst, they say "let's grab coffee in two weeks," and
two weeks later you've forgotten which of the eleven people you messaged said
that. Offr+ is where all of it lives: the people, the applications, the resume
versions, and the follow-up you were supposed to send on Tuesday.

Built with React, TypeScript, and Supabase. Still in progress.

## What it does

**Networking pipeline.** A drag-and-drop board where contacts move through
stages you define, from Not Started to Email Sent to Met. Stage names and
colors are yours to change. Set a follow-up date on someone and it appears on
your calendar automatically.

**Application tracker.** Company, role, status, salary, location, link, and
expected reply date, plus any custom fields you want to add yourself. Change a
status straight from the table without opening anything. Applications past
their expected reply date get flagged, but only while they're still live, so
rejections stop nagging you.

**Resumes.** Upload a PDF or Word doc and the text gets pulled out
automatically. Files live in private storage, one folder per user. Tag each
version to the firm you tailored it for.

**Calendar with Outlook sync.** Connect a Microsoft account and events push to
your real Outlook calendar. Tick a box and it creates a Teams meeting with a
join link, inviting the contact if you have their email.

**Job feed.** Answer three short questions when you sign up (what you study,
what you're targeting, where) and the dashboard surfaces recent postings that
match. Save the interesting ones, dismiss the rest.

**Dashboard.** Ordered by what needs doing rather than by what's easy to
count: overdue follow-ups and upcoming meetings first, then new postings, then
a view of how your pipeline is actually distributed, with the totals last.

## Stack

React 19, TypeScript, Vite, and Supabase for auth, Postgres, storage, and edge
functions. Light and dark themes are built from the brand palette. Three edge
functions handle anything involving a secret, so API keys and OAuth refresh
tokens never reach the browser.

Thirteen Postgres tables, thirty-nine row-level security policies. It's
multi-tenant, and one person's contact list should never be reachable from
someone else's session.

## Running it locally

You'll need a free Supabase project.

```bash
git clone https://github.com/diegojrobles/OffrPlus
cd OffrPlus/offrplus
npm install
cp .env.example .env
```

Put your Supabase project URL and publishable key in `.env`. The URL looks
like `https://your-project-ref.supabase.co`, not the dashboard address you're
looking at.

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Then run every file in `supabase/migrations/` in order, through the Supabase
SQL editor. Start with `001` and work up. They create the tables, the security
policies, and the private storage bucket for resumes.

```bash
npm run dev
```

Open http://localhost:5173.

Vite only reads `.env` at startup, so restart the dev server if you change it.

## Optional integrations

Everything above works without these. Each is self-contained, and the app
tells you when one isn't configured rather than failing silently.

**Outlook and Teams.** Requires an Azure app registration and two secrets.
Full walkthrough in [OUTLOOK_SETUP.md](./OUTLOOK_SETUP.md). Worth knowing up
front: Teams meeting creation only works for work or school Microsoft
accounts. Personal outlook.com accounts get calendar sync but no Teams links,
because Microsoft silently ignores the request rather than returning an error.

**Job feed.** Needs a free Adzuna API key. Steps in
[JOBS_SETUP.md](./JOBS_SETUP.md). The free tier allows about 1,000 calls a
month, so postings are cached by search rather than by user. Everyone looking
for investment banking internships in New York reads the same cached rows, and
one call serves all of them.

**Resume keyword analyzer.** Deploy `supabase/functions/keyword-analyze` and
set an `CLAUDE_API_KEY` secret. This one was in the original codebase and has
never been live.

## What's coming

Roughly in the order I plan to build it.

**Deployment.** It runs locally today. Getting it on a real URL is the next
thing, and it's a prerequisite for anyone but me using it.

**A self-hosted resume analyzer.** I built a small Flask AI server as a
separate project, and I want to bring it in here: a local model plus a
retrieval layer over finance-specific writing guidance, so the analyzer runs
without an API bill. Mostly I want to learn how RAG works by building one
rather than reading about one.

**LinkedIn import.** LinkedIn's API is closed to the public, but every user
can export their own connections as a CSV. Uploading that and turning it into
contacts gets most of the value with none of the terms-of-service risk.

**A custom 404 page.** Right now an unknown URL silently redirects to the
homepage, which quietly hides broken links instead of showing them.

**More job sources.** Adzuna is a general board and misses postings that only
live on a firm's own careers page. Many firms use Greenhouse or Lever, whose
per-company endpoints are free and unlimited.

## Notes

The `.env` file is gitignored and has never been committed. The Supabase
publishable key is safe in the browser by design, since it ships in the
JavaScript bundle either way. Row-level security is what actually protects the
data. The service role key is the one that would matter, and it lives only in
edge function secrets.

## Credits

Started with friends. Sara Dankenbrink designed the logo and artwork, which
the entire color palette is built from. I've been the one in the code.
