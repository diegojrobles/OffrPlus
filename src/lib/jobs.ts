import { supabase } from "./supabase";

export const CAREER_FOCUSES = [
  "Investment Banking",
  "Sales & Trading",
  "Private Equity",
  "Asset Management",
  "Equity Research",
  "Corporate Finance",
  "Financial Planning & Analysis",
  "Venture Capital",
  "Consulting",
  "Fintech",
] as const;

export const WORK_TYPES = [
  { value: "summer_internship", label: "Summer internship" },
  { value: "offcycle_internship", label: "Off-cycle internship" },
  { value: "full_time", label: "Full-time analyst" },
  { value: "part_time", label: "Part-time / term-time" },
] as const;

export interface JobPreferences {
  major: string;
  career_focus: string;
  work_type: string;
  location: string;
  graduation_year: number | null;
  onboarded_at: string | null;
}

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  contract_time: string | null;
  posted_at: string | null;
  saved?: boolean;
}

export const emptyPreferences: JobPreferences = {
  major: "",
  career_focus: "",
  work_type: "summer_internship",
  location: "",
  graduation_year: null,
  onboarded_at: null,
};

export async function getPreferences(
  userId: string,
): Promise<JobPreferences | null> {
  const { data } = await supabase
    .from("job_preferences")
    .select("major, career_focus, work_type, location, graduation_year, onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as JobPreferences) ?? null;
}

export async function savePreferences(
  userId: string,
  prefs: JobPreferences,
  markOnboarded = false,
) {
  const { error } = await supabase.from("job_preferences").upsert(
    {
      user_id: userId,
      ...prefs,
      onboarded_at: markOnboarded
        ? new Date().toISOString()
        : prefs.onboarded_at,
    },
    { onConflict: "user_id" },
  );
  return { error: error?.message ?? null };
}

export interface JobFeedResult {
  postings: JobPosting[];
  note?: string;
  needsPreferences?: boolean;
  error?: string;
}

export async function fetchJobFeed(): Promise<JobFeedResult> {
  const { data, error } = await supabase.functions.invoke("job-search", {
    body: {},
  });

  if (error) {
    // supabase-js reports only "non-2xx status code" and hides the response
    // body. The real explanation is on error.context, so dig it out.
    let detail = String(error.message ?? error);
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.error) detail = body.error;
      } catch {
        /* body wasn't JSON — keep the generic message */
      }
    }
    if (detail.includes("Function not found") || detail.includes("404")) {
      detail =
        "The job-search function hasn't been deployed yet. Run: supabase functions deploy job-search";
    }
    return { postings: [], error: detail };
  }
  if (data?.error === "NO_PREFERENCES")
    return { postings: [], needsPreferences: true };
  if (data?.error) return { postings: [], error: data.error };

  return { postings: data?.postings ?? [], note: data?.note };
}

export async function setJobState(
  userId: string,
  postingId: string,
  state: "saved" | "dismissed" | "applied",
) {
  await supabase
    .from("job_interactions")
    .upsert(
      { user_id: userId, posting_id: postingId, state },
      { onConflict: "user_id,posting_id" },
    );
}

/** "$85k – $110k", or "" when the provider gave no salary data. */
export function formatSalary(
  min: number | null,
  max: number | null,
): string {
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min && max) return min === max ? k(min) : `${k(min)} – ${k(max)}`;
  if (min) return `${k(min)}+`;
  if (max) return `up to ${k(max)}`;
  return "";
}

/** "Today", "Yesterday", "3 days ago" — postings age fast, so keep it relative. */
export function postedLabel(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return `${Math.floor(days / 7)} weeks ago`;
}
