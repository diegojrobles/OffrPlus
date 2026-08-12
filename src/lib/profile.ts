import { supabase } from "./supabase";

export interface Profile {
  first_name: string;
  last_name: string;
}

export const emptyProfile: Profile = { first_name: "", last_name: "" };

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as Profile) ?? null;
}

export async function saveProfile(userId: string, profile: Profile) {
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      first_name: profile.first_name.trim(),
      last_name: profile.last_name.trim(),
    },
    { onConflict: "user_id" },
  );
  return { error: error?.message ?? null };
}

/**
 * What to call someone in the UI.
 *
 * Falls back to the email's local part only as a last resort — better a rough
 * handle than an empty greeting, but a real name is always preferred.
 */
export function displayName(
  profile: Profile | null,
  email?: string | null,
): string {
  const first = profile?.first_name?.trim();
  if (first) return first;
  return email?.split("@")[0] ?? "";
}
