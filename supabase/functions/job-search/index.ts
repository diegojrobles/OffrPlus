// Supabase Edge Function: job-search
//
// Turns a user's stated preferences into a job search, serving from a shared
// cache wherever possible.
//
// The caching is the whole point: Adzuna's free tier is ~1,000 calls a month.
// Fetching per user per visit would exhaust that in a day. Instead a search is
// identified by a normalised query key, and every user whose preferences map
// to the same key reads the same cached rows. One call serves everyone
// looking for, say, investment banking internships in New York that day.
//
// Required secrets:
//   ADZUNA_APP_ID, ADZUNA_APP_KEY  – free from developer.adzuna.com

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CACHE_TTL_HOURS = 12;
const RESULTS_PER_PAGE = 30;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface Preferences {
  major: string;
  career_focus: string;
  work_type: string;
  location: string;
}

/** Search terms per focus area — plain keywords, since Adzuna does full text. */
const FOCUS_TERMS: Record<string, string> = {
  "Investment Banking": "investment banking analyst",
  "Sales & Trading": "sales trading analyst",
  "Private Equity": "private equity analyst",
  "Asset Management": "asset management analyst",
  "Equity Research": "equity research analyst",
  "Corporate Finance": "corporate finance analyst",
  "Financial Planning & Analysis": "financial planning analysis",
  Consulting: "business analyst consulting",
  "Venture Capital": "venture capital analyst",
  Fintech: "fintech analyst",
};

const WORK_TYPE_TERMS: Record<string, string> = {
  summer_internship: "summer intern",
  offcycle_internship: "intern",
  full_time: "",
  part_time: "part time",
};

/**
 * Builds the search string and its cache key. Normalising to lowercase and
 * trimming means "New York" and "new york " share one cache entry.
 */
function buildQuery(prefs: Preferences) {
  const focus =
    FOCUS_TERMS[prefs.career_focus] ||
    prefs.career_focus ||
    prefs.major ||
    "finance analyst";
  const typeTerm = WORK_TYPE_TERMS[prefs.work_type] ?? "";
  const what = [focus, typeTerm].filter(Boolean).join(" ").trim();
  const where = prefs.location.trim();

  return {
    what,
    where,
    queryKey: `${what}|${where}`.toLowerCase(),
  };
}

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  created?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    return await handle(req);
  } catch (err) {
    // Return 200 with the reason: a non-2xx makes supabase-js drop the body,
    // leaving the UI with only "non-2xx status code".
    return jsonResponse({
      postings: [],
      error: err instanceof Error ? err.message : "Job search failed",
    });
  }
});

async function handle(req: Request): Promise<Response> {

  // Identify the caller so we can read their preferences and filter out
  // anything they've dismissed.
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonResponse({ postings: [], error: "Not authenticated" }, 401);
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(
    auth.slice(7),
  );
  if (userErr || !userData.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }
  const userId = userData.user.id;

  const { data: prefs } = await admin
    .from("job_preferences")
    .select("major, career_focus, work_type, location")
    .eq("user_id", userId)
    .maybeSingle();

  if (!prefs) {
    return jsonResponse({ error: "NO_PREFERENCES", postings: [] }, 200);
  }

  const { what, where, queryKey } = buildQuery(prefs as Preferences);

  // ---------- serve from cache when it's still fresh ----------
  const cutoff = new Date(
    Date.now() - CACHE_TTL_HOURS * 3600 * 1000,
  ).toISOString();

  const { data: cached } = await admin
    .from("job_postings")
    .select("*")
    .eq("query_key", queryKey)
    .gte("fetched_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(RESULTS_PER_PAGE);

  let postings = cached ?? [];

  // ---------- otherwise hit Adzuna once and refill the cache ----------
  if (postings.length === 0) {
    const appId = Deno.env.get("ADZUNA_APP_ID");
    const appKey = Deno.env.get("ADZUNA_APP_KEY");
    if (!appId || !appKey) {
      return jsonResponse({
        postings: [],
        error:
          "Job search isn't configured yet — the Adzuna API keys are missing on the server.",
      });
    }

    const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
    url.searchParams.set("what", what);
    if (where) url.searchParams.set("where", where);
    url.searchParams.set("max_days_old", "14");
    url.searchParams.set("sort_by", "date");
    url.searchParams.set("content-type", "application/json");

    const res = await fetch(url.toString());
    if (!res.ok) {
      // Quota exhausted or provider down — fall back to whatever we have,
      // even if stale. Slightly old jobs beat an empty screen.
      const { data: stale } = await admin
        .from("job_postings")
        .select("*")
        .eq("query_key", queryKey)
        .order("posted_at", { ascending: false })
        .limit(RESULTS_PER_PAGE);

      return jsonResponse({
        postings: stale ?? [],
        stale: true,
        note: "Showing the most recent results we have; the job feed is temporarily unavailable.",
      });
    }

    const json = await res.json();
    const rows = (json.results ?? []).map((r: AdzunaResult) => ({
      query_key: queryKey,
      source: "adzuna",
      external_id: String(r.id),
      title: r.title ?? "",
      company: r.company?.display_name ?? "",
      location: r.location?.display_name ?? "",
      // Adzuna descriptions are truncated already; cap anyway.
      description: (r.description ?? "").slice(0, 1200),
      url: r.redirect_url,
      salary_min: r.salary_min ?? null,
      salary_max: r.salary_max ?? null,
      contract_time: r.contract_time ?? null,
      posted_at: r.created ?? null,
      fetched_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await admin
        .from("job_postings")
        .upsert(rows, { onConflict: "source,external_id" });
    }

    const { data: refreshed } = await admin
      .from("job_postings")
      .select("*")
      .eq("query_key", queryKey)
      .order("posted_at", { ascending: false })
      .limit(RESULTS_PER_PAGE);

    postings = refreshed ?? [];
  }

  // ---------- hide anything this user dismissed ----------
  const { data: interactions } = await admin
    .from("job_interactions")
    .select("posting_id, state")
    .eq("user_id", userId);

  const dismissed = new Set(
    (interactions ?? [])
      .filter((i: { state: string }) => i.state === "dismissed")
      .map((i: { posting_id: string }) => i.posting_id),
  );
  const saved = new Set(
    (interactions ?? [])
      .filter((i: { state: string }) => i.state === "saved")
      .map((i: { posting_id: string }) => i.posting_id),
  );

  const visible = postings
    .filter((p: { id: string }) => !dismissed.has(p.id))
    .map((p: { id: string }) => ({ ...p, saved: saved.has(p.id) }));

  return jsonResponse({ postings: visible, query: { what, where } });
}
