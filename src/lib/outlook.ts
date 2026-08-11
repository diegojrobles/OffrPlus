import { supabase } from "./supabase";

/**
 * Microsoft / Outlook integration helpers.
 *
 * Supabase hands back `provider_token` and `provider_refresh_token` on the
 * session immediately after an OAuth redirect and then forgets them — they are
 * not persisted and not refreshed for you. So the moment we see them we ship
 * them to the edge function, which stores them server-side. After that the
 * browser never handles a Microsoft token again.
 */

/** Everything the calendar sync needs; offline_access is what yields a refresh token. */
export const MS_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
].join(" ");

export interface OutlookStatus {
  isConnected: boolean;
  msEmail: string;
  lastError: string | null;
}

/** Starts the Microsoft consent flow for a user who is already signed in. */
export async function connectOutlook(redirectTo = window.location.href) {
  // linkIdentity attaches Microsoft to the existing account rather than
  // creating a second one.
  const { error } = await supabase.auth.linkIdentity({
    provider: "azure",
    options: { scopes: MS_SCOPES, redirectTo },
  });
  return { error: error?.message ?? null };
}

/** Sign in (or sign up) with Microsoft, granting calendar access at the same time. */
export async function signInWithMicrosoft(redirectTo?: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: MS_SCOPES,
      redirectTo: redirectTo ?? `${window.location.origin}/dashboard`,
    },
  });
  return { error: error?.message ?? null };
}

/**
 * Hands freshly-issued provider tokens to the edge function for storage.
 * Safe to call with a session that has no provider token — it no-ops.
 */
export async function persistProviderTokens(session: {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
  user?: { email?: string | null } | null;
}): Promise<boolean> {
  if (!session.provider_refresh_token) return false;

  const { error } = await supabase.functions.invoke("outlook-sync", {
    body: {
      action: "store",
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token,
      msEmail: session.user?.email ?? "",
      scopes: MS_SCOPES,
    },
  });

  return !error;
}

export async function getOutlookStatus(
  userId: string,
): Promise<OutlookStatus> {
  const { data } = await supabase
    .from("ms_connection_status")
    .select("is_connected, ms_email, last_error")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    isConnected: Boolean(data?.is_connected),
    msEmail: data?.ms_email ?? "",
    lastError: data?.last_error ?? null,
  };
}

export async function disconnectOutlook() {
  const { error } = await supabase.functions.invoke("outlook-sync", {
    body: { action: "disconnect" },
  });
  return { error: error?.message ?? null };
}

export interface PushResult {
  ok: boolean;
  joinUrl?: string | null;
  teamsUnavailable?: boolean;
  error?: string;
  needsReconnect?: boolean;
}

/** Pushes one Offr+ event to Outlook. Silent no-op if the user isn't connected. */
export async function pushEventToOutlook(eventId: string): Promise<PushResult> {
  const { data, error } = await supabase.functions.invoke("outlook-sync", {
    body: {
      action: "push",
      eventId,
      // Graph needs a zone name for wall-clock times; use the user's own.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  if (error) {
    const msg = String(error.message ?? error);
    const needsReconnect =
      msg.includes("REAUTH_REQUIRED") || msg.includes("NOT_CONNECTED");
    return { ok: false, error: msg, needsReconnect };
  }

  if (data?.error) {
    return {
      ok: false,
      error: data.error,
      needsReconnect:
        data.error === "REAUTH_REQUIRED" || data.error === "NOT_CONNECTED",
    };
  }

  return {
    ok: true,
    joinUrl: data?.joinUrl ?? null,
    teamsUnavailable: Boolean(data?.teamsUnavailable),
  };
}

export async function deleteEventFromOutlook(eventId: string) {
  await supabase.functions.invoke("outlook-sync", {
    body: { action: "delete", eventId },
  });
}
