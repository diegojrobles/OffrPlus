# Outlook Calendar + Teams — setup

The code is written. These are the account-level steps only you can do.
Roughly 20 minutes. Do them in order; the app can't connect until all four
sections are done.

---

## 1. Run migration 007

Supabase Dashboard → **SQL Editor** → **New query** → paste
`supabase/migrations/007_outlook_integration.sql` → **Run**.

This creates the `ms_connections` token table (with RLS that prevents the
browser from ever reading a refresh token) and adds the sync columns to
`events`.

---

## 2. Register an app in Azure

Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** →
**App registrations** → **New registration**.

- **Name:** `Offr+`
- **Supported account types:** *Accounts in any organizational directory and
  personal Microsoft accounts*. This lets both university and personal accounts
  sign in. (Personal accounts still can't create Teams meetings — Microsoft's
  limitation, not ours — but they get calendar sync.)
- **Redirect URI:** platform **Web**, value:
  ```
  https://atimqtzilgqkeumkpwhw.supabase.co/auth/v1/callback
  ```
  This is your Supabase project's callback, *not* your app's URL.

Click **Register**. Copy the **Application (client) ID** from the overview page.

### Add a client secret

**Certificates & secrets** → **Client secrets** → **New client secret**.
Copy the **Value** column immediately — it's only shown once. Note the expiry
date in your calendar; the integration breaks silently when it lapses.

### Add API permissions

**API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated
permissions**. Add all of these:

| Permission | Why |
|---|---|
| `offline_access` | Returns the refresh token. **Without this nothing works** — Azure omits it by default. |
| `User.Read` | Basic profile so we know which account connected |
| `Calendars.ReadWrite` | Create and update calendar events |
| `OnlineMeetings.ReadWrite` | Attach a Teams meeting to an event |
| `email`, `openid`, `profile` | Standard sign-in claims |

Click **Grant admin consent** if the button is available. If you're on a
university tenant you probably can't — individual users will just consent for
themselves at first sign-in, which is fine.

---

## 3. Configure Supabase

**Authentication → Sign In / Providers → Azure**:

- Toggle **Enabled**
- **Client ID:** the Application (client) ID from step 2
- **Secret:** the client secret *Value*
- Leave **Azure Tenant URL** blank to allow any Microsoft account

Then **Authentication → URL Configuration → Redirect URLs**, add:

```
http://localhost:5173/**
https://your-production-domain.com/**
```

Azure rejects `127.0.0.1` — use `localhost` for local development.

---

## 4. Deploy the edge function and its secrets

```bash
npm install -g supabase
supabase login
supabase link --project-ref atimqtzilgqkeumkpwhw
supabase functions deploy outlook-sync
```

Then set the secrets it needs:

```bash
supabase secrets set AZURE_CLIENT_ID=<application-client-id>
supabase secrets set AZURE_CLIENT_SECRET=<client-secret-value>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
don't set those yourself.

While you're here, the resume analyzer function has never been deployed either:

```bash
supabase functions deploy keyword-analyze
supabase secrets set CLAUDE_API_KEY=<your-anthropic-key>
```

---

## 5. Try it

1. `npm run dev`, sign in, go to **Settings**
2. Click **Connect Outlook**, approve the Microsoft consent screen
3. Settings should show **Connected** with your Microsoft email
4. Go to **Calendar**, click a day, tick **Create a Teams meeting**, save
5. The event should appear in Outlook within seconds, with a join link

---

## How it works

```
Browser  ──sign in / connect──►  Microsoft consent
   │                                  │
   │  ◄──── tokens on the session ────┘
   │
   ├─ tokens handed straight to ──►  outlook-sync (edge function)
   │                                    │  stores them with the service role
   │                                    │  so the browser never holds them
   └─ "push event #123" ────────────►  refreshes token if stale
                                        └─► Microsoft Graph  POST /me/events
```

Supabase surfaces the Microsoft tokens on the session **once**, right after the
OAuth redirect, and never persists or refreshes them. `AuthContext` catches that
moment and forwards them to the edge function. From then on the function owns
refresh, using the rotating refresh token Microsoft returns.

---

## Troubleshooting

**"Microsoft did not return a refresh token"** — `offline_access` is missing
from the app registration's API permissions. Add it, then disconnect and
reconnect in Settings.

**Event syncs but no Teams link** — the connected account is a personal
outlook.com account. Microsoft silently ignores `isOnlineMeeting` for those;
the app detects this and says so. Only work/school accounts get Teams links.

**"Reconnect required" in Settings** — the refresh token was revoked, or the
Azure client secret expired. Check the secret's expiry date first.

**Nothing happens on Connect** — check the redirect URL in step 3 matches your
current origin exactly, including port.
