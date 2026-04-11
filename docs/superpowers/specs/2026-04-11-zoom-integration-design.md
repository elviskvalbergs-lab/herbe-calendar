# Zoom Integration Design

## Summary

Add Zoom meeting link generation as a third video provider alongside Teams and Meet. Zoom operates independently of calendar source — a "Zoom meeting" checkbox appears on any event creation (ERP, Google, Outlook) and in booking templates when Zoom is configured for the account. Uses Zoom Server-to-Server OAuth (admin-level, no per-user auth).

## Decisions

- **Auth type:** Server-to-Server OAuth (account-level, configured in /admin/config)
- **Scope:** Meeting link generation only — no calendar sync from Zoom
- **Video provider behavior:**
  - Outlook source: "Online meeting" toggle = Teams (unchanged)
  - Google source: "Online meeting" toggle = Meet (unchanged)
  - All sources: separate "Zoom meeting" checkbox IF Zoom is configured
- **Booking templates:** New "Zoom meeting" toggle in template targets alongside existing "Online meeting" per-source toggles
- **Meeting creation:** POST to Zoom API creates a meeting, returns join URL. URL injected into event description and stored as joinUrl with videoProvider='zoom'.

## Admin Configuration

New section in `/admin/config` following the Azure/Google Workspace pattern:

**Zoom section:**
- Account ID (from Zoom Marketplace app)
- Client ID (from Zoom Marketplace app)
- Client Secret (encrypted in DB)
- Save & Test buttons

**DB table:** `account_zoom_config`
```sql
CREATE TABLE IF NOT EXISTS account_zoom_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL UNIQUE,
  zoom_account_id TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  client_secret BYTEA NOT NULL,     -- AES-256-GCM encrypted
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

**Test:** GET /users/me from Zoom API to verify credentials work.

## Zoom API Client

New file: `lib/zoom/client.ts`

**Token flow:** Server-to-Server OAuth uses account credentials grant:
- POST to `https://zoom.us/oauth/token` with `grant_type=account_credentials`
- Uses Account ID, Client ID, Client Secret
- Returns access token (1 hour TTL)
- Cache token in memory with expiry check

**Create meeting:** POST to `https://api.zoom.us/v2/users/me/meetings`
- Body: `{ topic, start_time, duration, type: 2 }` (type 2 = scheduled)
- Returns: `{ join_url, id }`

**Config loader:** `getZoomConfig(accountId)` — same cache pattern as Azure/Google (5-min TTL).

## Activity Creation Flow

### Manual creation (ActivityForm)

When Zoom is configured for the account, show a "Zoom meeting" checkbox in the form. This appears regardless of which source (ERP/Google/Outlook) is selected, below the existing "Online meeting" toggle.

When saving:
1. If "Zoom meeting" is checked, call Zoom API to create a meeting
2. Get the join URL from the response
3. Inject the join URL into the event:
   - ERP: append to the Text/description field
   - Outlook: add to event body and location
   - Google: add to event description and location
4. Set `videoProvider: 'zoom'` and `joinUrl` on the created activity

The Zoom meeting is created via a new endpoint: `POST /api/zoom/meetings`
- Body: `{ topic, startTime, duration }`
- Returns: `{ joinUrl, meetingId }`

### Booking flow (book/route.ts)

When template targets have `zoom.enabled: true`:
1. After creating the calendar events, call Zoom API to create a meeting
2. Inject join URL into the ERP activity text and/or calendar event body
3. Store zoom meeting ID in bookings table (new column `created_zoom_meeting_id`)

## Template Targets

Extend `TemplateTargets` in types/index.ts:

```typescript
zoom?: {
  enabled: boolean
}
```

In BookingTemplateEditor, add a Zoom section following the Outlook/Google pattern:
- Checkbox: "Create Zoom meeting"
- Only shown if Zoom is configured for the account

## UI Changes

### ActivityForm
- New "Zoom meeting" checkbox below the existing "Online meeting" toggle
- Only visible when Zoom is configured (passed as a prop or derived from availableSources)
- Independent of the source-specific "Online meeting" toggle (both can be on — you could have a Teams meeting AND a Zoom link, though unusual)

### ActivityBlock (event display)
- Already handles `videoProvider === 'zoom'` via the extensible videoProvider field
- Join button color: `#2D8CFF` (Zoom blue)
- Label: "Join Zoom"

### BookingTemplateEditor
- New Zoom section after the Google section
- Simple checkbox: "Create Zoom meeting"

### Admin ConfigClient
- New collapsible "Zoom" section following Azure/Google Workspace pattern
- Three fields: Account ID, Client ID, Client Secret
- Save & Test buttons

## API Endpoints

### `POST /api/zoom/meetings`
Creates a Zoom meeting. Requires session auth.
- Body: `{ topic: string, startTime: string, duration: number }`
- Returns: `{ joinUrl: string, meetingId: string }`

### `PUT /api/admin/config` (extend existing)
Handle `type: 'zoom'` — save Zoom config to `account_zoom_config`.

### `POST /api/admin/config` (extend existing)
Handle `action: 'test-zoom'` — call Zoom API to verify credentials.

## Scope

### In scope
- Admin Zoom config (save/test in /admin/config)
- Zoom meeting creation via API
- "Zoom meeting" checkbox in ActivityForm
- Zoom in booking template targets
- Zoom meeting creation in booking flow
- Join Zoom button in ActivityBlock
- videoProvider='zoom' with Zoom blue (#2D8CFF) styling

### Out of scope
- Zoom calendar sync (reading meetings from Zoom)
- Per-user Zoom auth
- Zoom Webinar support
- Zoom meeting deletion on event cancel (future enhancement)
