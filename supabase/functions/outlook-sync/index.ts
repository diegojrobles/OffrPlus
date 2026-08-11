// Supabase Edge Function: outlook-sync
//
// Owns everything that touches Microsoft OAuth tokens. The browser never sees a
// refresh token: it hands the tokens over once after the OAuth redirect, and
// from then on asks this function to push calendar events.
//
// Required secrets (Project Settings -> Functions -> Secrets):
//   AZURE_CLIENT_ID      – Application (client) ID from the Azure app registration
//   AZURE_CLIENT_SECRET  – client secret Value from that same registration
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// Refresh a little early so a request never races the expiry.
const EXPIRY_SKEW_MS = 120_000;

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

type Action = "store" | "push" | "delete" | "disconnect";

interface Body {
  action: Action;
  // store
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  msEmail?: string;
  scopes?: string;
  // push / delete
  eventId?: string;
  timeZone?: string;
}

interface EventRow {
  id: string;
  user_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string;
  wants_teams: boolean;
  outlook_event_id: string | null;
  contact_id: string | null;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Resolves the caller from the Authorization header the browser already sends. */
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await admin.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Returns a usable Graph access token, refreshing it against Microsoft first if
 * the stored one has expired. Microsoft rotates refresh tokens, so the new one
 * is written back.
 */
async function getAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await admin
    .from("ms_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!conn?.refresh_token) throw new Error("NOT_CONNECTED");

  const stillValid =
    conn.access_token &&
    conn.expires_at &&
    new Date(conn.expires_at).getTime() - EXPIRY_SKEW_MS > Date.now();

  if (stillValid) return conn.access_token as string;

  const body = new URLSearchParams({
    client_id: Deno.env.get("AZURE_CLIENT_ID")!,
    client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token as string,
    scope:
      "offline_access openid email profile User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();

  if (!res.ok) {
    // A revoked or expired refresh token means the user must reconnect; record
    // that so the UI can say so instead of failing silently forever.
    await admin
      .from("ms_connections")
      .update({
        last_error: json.error_description ?? "Reconnect required",
        refresh_token: null,
      })
      .eq("user_id", userId);
    throw new Error("REAUTH_REQUIRED");
  }

  await admin
    .from("ms_connections")
    .update({
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? conn.refresh_token,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      last_error: null,
    })
    .eq("user_id", userId);

  return json.access_token as string;
}

/** Builds the Graph event body from an Offr+ event row. */
function toGraphEvent(ev: EventRow, timeZone: string, attendeeEmail?: string) {
  const allDay = !ev.start_time;

  const graph: Record<string, unknown> = {
    subject: ev.title,
    body: { contentType: "text", content: ev.notes ?? "" },
  };

  if (allDay) {
    // Graph requires an all-day event to start and end at midnight, end exclusive.
    const next = new Date(`${ev.event_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    graph.isAllDay = true;
    graph.start = { dateTime: `${ev.event_date}T00:00:00`, timeZone };
    graph.end = {
      dateTime: `${next.toISOString().slice(0, 10)}T00:00:00`,
      timeZone,
    };
  } else {
    // Default to a one-hour block when no end time was given.
    const end =
      ev.end_time ??
      `${String((Number(ev.start_time!.slice(0, 2)) + 1) % 24).padStart(2, "0")}${ev.start_time!.slice(2)}`;
    graph.start = { dateTime: `${ev.event_date}T${ev.start_time}`, timeZone };
    graph.end = { dateTime: `${ev.event_date}T${end}`, timeZone };
  }

  if (ev.wants_teams) {
    graph.isOnlineMeeting = true;
    graph.onlineMeetingProvider = "teamsForBusiness";
  }

  if (attendeeEmail) {
    graph.attendees = [
      { emailAddress: { address: attendeeEmail }, type: "required" },
    ];
  }

  return graph;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const userId = await getUserId(req);
  if (!userId) return jsonResponse({ error: "Not authenticated" }, 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    // ---------- store tokens after the OAuth redirect ----------
    if (body.action === "store") {
      if (!body.refreshToken) {
        return jsonResponse(
          {
            error:
              "Microsoft did not return a refresh token. The offline_access scope is required.",
          },
          400,
        );
      }

      const { error } = await admin.from("ms_connections").upsert(
        {
          user_id: userId,
          ms_email: body.msEmail ?? "",
          access_token: body.accessToken ?? null,
          refresh_token: body.refreshToken,
          expires_at: new Date(
            Date.now() + (body.expiresIn ?? 3600) * 1000,
          ).toISOString(),
          scopes: body.scopes ?? "",
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // ---------- disconnect ----------
    if (body.action === "disconnect") {
      await admin.from("ms_connections").delete().eq("user_id", userId);
      // Local events stay; they just stop syncing.
      await admin
        .from("events")
        .update({ outlook_event_id: null, teams_join_url: null })
        .eq("user_id", userId);
      return jsonResponse({ ok: true });
    }

    // ---------- delete a single event from Outlook ----------
    if (body.action === "delete") {
      const token = await getAccessToken(userId);
      const { data: ev } = await admin
        .from("events")
        .select("outlook_event_id")
        .eq("id", body.eventId!)
        .eq("user_id", userId)
        .maybeSingle();

      if (ev?.outlook_event_id) {
        await fetch(`${GRAPH}/me/events/${ev.outlook_event_id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
      }
      return jsonResponse({ ok: true });
    }

    // ---------- create or update in Outlook ----------
    if (body.action === "push") {
      const token = await getAccessToken(userId);

      const { data: ev, error: evErr } = await admin
        .from("events")
        .select(
          "id, user_id, title, event_date, start_time, end_time, notes, wants_teams, outlook_event_id, contact_id",
        )
        .eq("id", body.eventId!)
        .eq("user_id", userId)
        .maybeSingle();

      if (evErr || !ev) return jsonResponse({ error: "Event not found" }, 404);

      // Invite the linked contact if we have an email for them.
      let attendee: string | undefined;
      if (ev.contact_id) {
        const { data: c } = await admin
          .from("contacts")
          .select("email")
          .eq("id", ev.contact_id)
          .maybeSingle();
        if (c?.email) attendee = c.email;
      }

      const timeZone = body.timeZone || "UTC";
      const graphBody = toGraphEvent(ev as EventRow, timeZone, attendee);

      const existing = (ev as EventRow).outlook_event_id;
      const res = await fetch(
        existing ? `${GRAPH}/me/events/${existing}` : `${GRAPH}/me/events`,
        {
          method: existing ? "PATCH" : "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(graphBody),
        },
      );
      const json = await res.json();

      if (!res.ok) {
        const message = json?.error?.message ?? "Outlook rejected the event";
        await admin
          .from("events")
          .update({ sync_error: message })
          .eq("id", ev.id);
        return jsonResponse({ error: message }, 502);
      }

      // Personal Microsoft accounts silently ignore isOnlineMeeting, so detect
      // that here and tell the user rather than pretending it worked.
      const teamsRequestedButMissing =
        (ev as EventRow).wants_teams && !json.onlineMeeting?.joinUrl;

      await admin
        .from("events")
        .update({
          outlook_event_id: json.id,
          teams_join_url: json.onlineMeeting?.joinUrl ?? null,
          meeting_link: json.onlineMeeting?.joinUrl ?? undefined,
          meeting_platform: json.onlineMeeting?.joinUrl ? "teams" : undefined,
          synced_at: new Date().toISOString(),
          sync_error: teamsRequestedButMissing
            ? "Event synced, but this Microsoft account can't create Teams meetings (personal accounts aren't supported)."
            : null,
        })
        .eq("id", ev.id);

      return jsonResponse({
        ok: true,
        outlookEventId: json.id,
        joinUrl: json.onlineMeeting?.joinUrl ?? null,
        teamsUnavailable: teamsRequestedButMissing,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    if (message === "NOT_CONNECTED")
      return jsonResponse({ error: "NOT_CONNECTED" }, 409);
    if (message === "REAUTH_REQUIRED")
      return jsonResponse({ error: "REAUTH_REQUIRED" }, 409);
    return jsonResponse({ error: message }, 500);
  }
});
