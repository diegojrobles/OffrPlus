# Job feed setup

Two steps: run the migration, then get a free Adzuna key and deploy the
function. About 10 minutes.

---

## 1. Run migration 010

SQL Editor → New query → paste `supabase/migrations/010_jobs.sql` → Run.

Creates three tables:

| Table | Purpose |
|---|---|
| `job_preferences` | The questionnaire answers, one row per user |
| `job_postings` | **Shared** cache of fetched postings |
| `job_interactions` | Which postings each user saved or dismissed |

The cache being shared is the important design decision — see below.

---

## 2. Get an Adzuna API key (free)

1. Go to [developer.adzuna.com](https://developer.adzuna.com)
2. Sign up — free, no card
3. Copy your **Application ID** and **Application Key**

The free tier is around 1,000 calls per month.

---

## 3. Deploy the function and set secrets

```bash
supabase functions deploy job-search
supabase secrets set ADZUNA_APP_ID=your-app-id
supabase secrets set ADZUNA_APP_KEY='your-app-key'
```

---

## Why the cache is shared

Adzuna's free tier is ~1,000 calls/month. If every user triggered a fetch on
every dashboard visit, ten users checking twice a day would exhaust the whole
month's quota in under a week.

So postings are stored against a **normalised query key** — for example
`investment banking analyst summer intern|new york` — rather than against a
user. Anyone whose preferences map to that same key reads the same cached
rows. One API call serves every user looking for the same thing.

Cache lifetime is 12 hours (`CACHE_TTL_HOURS` in the function). Job postings
don't change minute to minute, so twice a day is plenty, and it caps total
usage at roughly `2 × number of distinct searches` calls per day.

If Adzuna is down or the quota is spent, the function falls back to serving
stale cached rows with a note, rather than showing an empty screen.

---

## Adjusting what gets searched

`FOCUS_TERMS` in `supabase/functions/job-search/index.ts` maps each career
focus to search keywords. If results for a focus look off, that map is the
first thing to tune — e.g. adding "M&A" to Investment Banking. Redeploy the
function after editing.

---

## Testing

1. Sign in with a **new** account — you should be sent to `/onboarding`
2. Complete the three steps
3. The dashboard's "New for you" section should populate within a second or two
4. Dismiss a posting; it should vanish and not return on refresh

To re-run onboarding on an existing account:

```sql
update public.job_preferences set onboarded_at = null where user_id = '<your-uuid>';
```

---

## Notes and limitations

**Adzuna is a general job board.** Coverage of finance internships is decent
but not exhaustive — it won't have every bulge-bracket summer analyst posting,
since many of those live only on the firm's own site. A future addition worth
considering is querying specific firms' Greenhouse/Lever boards, which are
free and unlimited but must be queried one company at a time.

**Nothing is sent to employers.** The feed is a read-only search; preferences
stay in your database.

**Onboarding fails open.** If the preferences lookup errors — migration not
run, network down — the user reaches the app anyway rather than being stuck on
a setup screen. Better a missing job feed than a locked-out user.
