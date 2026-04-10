# Google Per-User OAuth Design

## Summary

Add OAuth 2.0 consent flow so individual users can connect their own Google accounts (personal Gmail or Workspace) without admin involvement. Coexists with existing domain-wide delegation — per-user tokens take priority. Users can connect multiple Google accounts and select which calendars to sync, with individual colors. Full CRUD support (create, edit, delete, drag-and-drop, RSVP).

## Decisions

- **Target users:** Both personal Gmail and Workspace accounts
- **Google app verification:** Stay in "Testing" mode (up to 100 test users added manually). No verification needed.
- **Coexistence:** Per-user OAuth token takes priority over domain-wide delegation for the same email. Both can coexist.
- **Multiple accounts:** A user can connect multiple Google accounts (e.g. work + personal)
- **Calendar selection:** After connecting, user picks which Google calendars to sync from a list (names from Google API). Each gets a user-assigned color.
- **UI location:** New "Integrations" tab in Settings, replacing the current "Calendars" tab. ICS feeds move there too.
- **CRUD:** Full create/edit/delete/drag/RSVP, same as domain-wide delegation — just uses OAuth token instead of JWT subject.
- **Error handling:** Silent skip + status bar warning when token refresh fails (same pattern as ICS errors).

## OAuth Flow

1. User opens Settings → Integrations tab, clicks "Connect Google Account"
2. Frontend calls `GET /api/google/auth?returnUrl=/cal` which redirects to Google consent screen
3. Google consent screen requests scopes: `calendar.readonly`, `calendar.events`, `calendar`
4. User grants access, Google redirects to `GET /api/google/callback?code=...&state=...`
5. Callback exchanges auth code for access + refresh tokens
6. Stores encrypted tokens in `user_google_tokens`
7. Fetches calendar list from Google Calendar API, stores in `user_google_calendars` (all enabled by default)
8. Redirects back to settings with `?success=google_connected`

**Disconnect:** `DELETE /api/google/auth` — revokes Google token, deletes `user_google_tokens` and `user_google_calendars` rows for that Google account.

**CSRF protection:** State parameter contains a signed nonce (same pattern as Herbe OAuth — nonce stored in httpOnly cookie, validated on callback).

## Database Schema

### Migration: `13_add_user_google_oauth.sql`

```sql
CREATE TABLE user_google_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,        -- herbe.calendar login email
  account_id      UUID NOT NULL,        -- tenant account
  google_email    TEXT NOT NULL,        -- the Google account (could be different from user_email)
  access_token    BYTEA NOT NULL,       -- AES-256-GCM encrypted
  refresh_token   BYTEA NOT NULL,       -- AES-256-GCM encrypted
  token_expires_at BIGINT NOT NULL,     -- unix ms
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, google_email, account_id)
);

CREATE TABLE user_google_calendars (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_google_token_id UUID NOT NULL REFERENCES user_google_tokens(id) ON DELETE CASCADE,
  calendar_id          TEXT NOT NULL,    -- Google calendar ID (e.g. "primary", "user@gmail.com", hex ID)
  name                 TEXT NOT NULL,    -- Display name from Google (e.g. "Work", "Personal")
  color                TEXT,             -- User-assigned hex color (null = use default)
  enabled              BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_google_token_id, calendar_id)
);
```

## Event Fetching Priority

When `/api/google` fetches events for a person code:

1. Resolve person code to email via `emailForCode`
2. **Per-user path:** Look up `user_google_tokens` where `user_email` matches the session user's email (not the person code's email). Fetch from all enabled `user_google_calendars`.
3. **Domain-wide path:** If `account_google_config` exists, use JWT delegation to fetch from the person's primary calendar (existing flow).
4. Per-user calendars and domain-wide calendars are both returned, deduped by event ID.

**Important distinction:** Per-user tokens are tied to the logged-in user, not the person column. If Elvis connects his personal Gmail, those events show in Elvis's view regardless of which person columns are displayed. Domain-wide delegation events are per-person-column (fetched by person code → email mapping).

## Calendar Sources Dropdown

Per-user Google calendars appear in the sources dropdown, grouped by Google account:

```
ERP
Outlook
Google (domain)              ← existing domain-wide delegation
Google (elvis@gmail.com)     ← per-user OAuth
  ├ Work
  ├ Personal
  └ Birthdays
Google (elvis@company.com)   ← another per-user account
  ├ My Calendar
  └ Team Calendar
ICS: Team Standup
ICS: Company Events
```

Each sub-calendar can be toggled individually and has its own color.

## Activity Creation — Google Calendar Picker

When creating an activity with source = Google, the form shows a calendar picker:

- If user has per-user Google accounts: dropdown grouped by account, showing enabled calendars
- If only domain-wide delegation: no picker needed (creates in primary calendar, existing behavior)
- If both: show all options, per-user calendars listed first

The selected calendar determines:
- Which OAuth token (or JWT delegation) to use
- Which `calendarId` to pass to the Google Calendar API

## Auth Client Changes

### `lib/google/client.ts`

Add a new function alongside existing `getCalendarClient`:

```typescript
/** Create a Google Calendar client using per-user OAuth token */
function getOAuthCalendarClient(accessToken: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.calendar({ version: 'v3', auth })
}
```

Add token refresh function:

```typescript
/** Refresh an expired per-user OAuth token, update DB, return new access token */
async function refreshUserToken(tokenRow: UserGoogleToken): Promise<string | null>
```

Uses the app's OAuth client ID + secret to refresh. Same pattern as ERP connection token refresh.

### OAuth Client Configuration

Reuse the existing GCP project. Add an OAuth 2.0 Client ID (Web application type) in the same project that has the service account. Environment variables:

- `GOOGLE_OAUTH_CLIENT_ID` — OAuth client ID
- `GOOGLE_OAUTH_CLIENT_SECRET` — OAuth client secret

Redirect URI: `{NEXTAUTH_URL}/api/google/callback`

## API Endpoints

### `GET /api/google/auth`
Redirects to Google consent screen. Sets CSRF nonce cookie. Query param `returnUrl` for post-auth redirect.

### `GET /api/google/callback`
Exchanges code for tokens. Validates CSRF nonce. Stores tokens + fetches calendar list. Redirects to settings.

### `DELETE /api/google/auth`
Body: `{ googleEmail }`. Revokes token, deletes rows. Requires session auth.

### `GET /api/google/calendars`
Returns the user's connected Google accounts and their calendars. Used by Settings UI.

### `PUT /api/google/calendars`
Body: `{ calendarId, enabled?, color? }`. Toggle or recolor a calendar.

### `POST /api/google/calendars/refresh`
Body: `{ googleEmail }`. Re-fetches calendar list from Google and syncs with DB (adds new, preserves existing colors/enabled state).

## Settings UI — Integrations Tab

Rename "Calendars" → "Integrations". Two sections:

### Google Section
- "Connect Google Account" button (opens OAuth flow)
- For each connected account: "Connected as user@gmail.com" with disconnect button
- Calendar list with toggle switches and color pickers (same UI pattern as ICS color pickers)
- "Refresh calendars" link to re-fetch list from Google

### ICS Feeds Section
- Existing ICS feed management, moved from old Calendars tab unchanged

## Token Storage & Security

- Access tokens and refresh tokens encrypted with AES-256-GCM (same `encrypt`/`decrypt` as ERP connections)
- OAuth client secret stored in environment variable, not DB
- Tokens scoped per-user, not shared
- Refresh token rotation: if Google returns a new refresh token during refresh, update DB
- On disconnect: revoke token with Google before deleting from DB

## Scope

### In scope
- OAuth consent flow (connect/disconnect)
- Per-user token storage with auto-refresh
- Calendar list sync with toggle/color
- Event fetching from enabled calendars
- Full CRUD on per-user calendars
- Calendar picker in activity creation form
- Calendar sources dropdown integration
- Integrations tab (renaming Calendars tab, moving ICS there)

### Out of scope
- Google app verification (staying in Testing mode)
- Push notifications / webhook for real-time sync
- Shared calendar management
- Calendar-level permissions (all connected calendars are read-write)
