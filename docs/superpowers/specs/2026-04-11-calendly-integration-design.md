# Calendly Integration Design

## Summary

Receive Calendly bookings via webhook and auto-create matching events in ERP/Outlook/Google using existing booking templates. Per-user setup: each user connects their Calendly account, selects a mandatory default template, and optionally maps specific event types to different templates. Invitee info is mapped to custom fields where possible and always included in event descriptions.

## Decisions

- **Direction:** One-way: Calendly → herbe.calendar (no push to Calendly)
- **Auth:** Personal Access Token (PAT) per user — simpler than OAuth, no expiry
- **Template mapping:** Mandatory default template + optional per-event-type overrides
- **Invitee data:** Best-effort custom field matching + full dump in event description as fallback
- **Webhook:** Shared endpoint, routed by Calendly user URI to the right user's config
- **UI location:** Settings > Integrations tab (alongside Google accounts and ICS feeds)
- **Scope:** Per-user (not admin-level) since templates are per-user

## Data Model

### DB Schema

```sql
-- Per-user Calendly connection
CREATE TABLE IF NOT EXISTS user_calendly_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,
  account_id      UUID NOT NULL,
  access_token    BYTEA NOT NULL,       -- AES-256-GCM encrypted PAT
  calendly_user_uri TEXT NOT NULL,       -- e.g. "https://api.calendly.com/users/XXXX"
  calendly_user_name TEXT,
  webhook_uri     TEXT,                  -- Created webhook subscription URI (for cleanup)
  default_template_id UUID NOT NULL,     -- Mandatory default booking template
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, account_id)
);

-- Per-event-type template override
CREATE TABLE IF NOT EXISTS user_calendly_event_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendly_token_id UUID NOT NULL REFERENCES user_calendly_tokens(id) ON DELETE CASCADE,
  event_type_uri  TEXT NOT NULL,         -- Calendly event type URI
  event_type_name TEXT NOT NULL,         -- Display name
  event_type_duration INT,               -- Duration in minutes
  template_id     UUID,                  -- NULL = use default template
  UNIQUE(calendly_token_id, event_type_uri)
);

-- Log of processed Calendly webhooks (for dedup and audit)
CREATE TABLE IF NOT EXISTS calendly_webhook_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uri       TEXT NOT NULL UNIQUE,  -- Calendly event URI (dedup key)
  calendly_token_id UUID NOT NULL,
  template_id     UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'processed', -- processed, failed
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

## Calendly API Client

New file: `lib/calendly/client.ts`

### Token verification + user info
```
GET https://api.calendly.com/users/me
Authorization: Bearer {PAT}
```
Returns: `{ resource: { uri, name, email, scheduling_url } }`

### Fetch event types
```
GET https://api.calendly.com/event_types?user={user_uri}&active=true
Authorization: Bearer {PAT}
```
Returns: `{ collection: [{ uri, name, duration, scheduling_url }] }`

### Create webhook subscription
```
POST https://api.calendly.com/webhook_subscriptions
Authorization: Bearer {PAT}
Body: {
  url: "{NEXTAUTH_URL}/api/calendly/webhook",
  events: ["invitee.created"],
  organization: "{org_uri}",
  user: "{user_uri}",
  scope: "user",
  signing_key: "{generated_key}"
}
```

### Delete webhook subscription
```
DELETE https://api.calendly.com/webhook_subscriptions/{webhook_uuid}
Authorization: Bearer {PAT}
```

## Setup Flow (User Perspective)

1. User opens Settings > Integrations
2. Scrolls to Calendly section
3. Pastes their Personal Access Token
4. Selects a default booking template (required — dropdown of their templates)
5. Clicks "Connect"
6. System:
   - Verifies PAT via `/users/me`
   - Fetches event types
   - Creates webhook subscription
   - Stores everything in DB
7. User sees their event types listed
8. Optionally selects different templates for specific event types
9. Done — webhooks will now auto-create events

## Disconnect Flow

1. User clicks "Disconnect Calendly"
2. System:
   - Deletes webhook subscription via Calendly API
   - Deletes `user_calendly_tokens` row (cascades to event mappings)

## Webhook Processing

### Endpoint: `POST /api/calendly/webhook`

1. **Verify signature:** Calendly signs webhooks with the signing key. Verify HMAC-SHA256 signature from `Calendly-Webhook-Signature` header.

2. **Parse payload:** Extract event type, invitee info, scheduled time.

3. **Route to user:** Look up `user_calendly_tokens` by the event's `event_memberships[].user` URI.

4. **Dedup:** Check `calendly_webhook_log` for the event URI. Skip if already processed.

5. **Find template:** Check `user_calendly_event_mappings` for an event-type-specific template. Fall back to `default_template_id`.

6. **Map invitee data:**
   - `bookerEmail` = invitee email
   - `bookerName` = invitee name
   - Custom field matching: compare Calendly question slugs/names to template custom field names
   - Full invitee info (name, email, all answers) dumped into event description

7. **Execute booking flow:** Reuse the existing booking logic from `app/api/share/[token]/book/route.ts`:
   - Create ERP activity (if template targets ERP)
   - Create Outlook event (if template targets Outlook)
   - Create Google event (if template targets Google)
   - Create Zoom meeting (if template targets Zoom)
   - Send notification email

8. **Log result:** Insert into `calendly_webhook_log` with status and any errors.

9. **Return 200** to Calendly (even on partial failure — we handle retries internally).

### Webhook payload structure (invitee.created)
```json
{
  "event": "invitee.created",
  "payload": {
    "event": "https://api.calendly.com/scheduled_events/XXXX",
    "invitee": {
      "email": "booker@example.com",
      "name": "John Doe",
      "questions_and_answers": [
        { "question": "Company", "answer": "Acme Inc" }
      ]
    },
    "event_type": "https://api.calendly.com/event_types/XXXX",
    "scheduled_event": {
      "start_time": "2026-04-15T10:00:00.000Z",
      "end_time": "2026-04-15T10:30:00.000Z",
      "name": "30 Minute Meeting",
      "event_memberships": [{ "user": "https://api.calendly.com/users/XXXX" }]
    }
  }
}
```

## Booking Logic Reuse

The core booking logic (create ERP activity, Outlook event, Google event, Zoom meeting, send email) already exists in `app/api/share/[token]/book/route.ts`. Extract it into a shared function:

`lib/bookingExecutor.ts`

```typescript
export async function executeBooking(params: {
  template: BookingTemplate,
  date: string,
  time: string,
  durationMinutes: number,
  bookerEmail: string,
  bookerName: string,
  fieldValues: Record<string, string>,
  personCodes: string[],
  ownerEmail: string,
  accountId: string,
  cancelUrl?: string,
}): Promise<BookingResult>
```

Both the existing `/api/share/[token]/book` route and the Calendly webhook handler call this shared function.

## Settings UI — Integrations Tab

Add a Calendly section in SettingsModal (after Google accounts, before ICS feeds):

### Not connected state:
```
Calendly
├ Personal Access Token: [____________]
├ Default Template: [dropdown of user's templates]  (required)
└ [Connect Calendly]
```

### Connected state:
```
Calendly — Connected as "Elvis Kvalbergs"
├ Default template: [Meeting Template ▾]
├ Event Types:
│  ├ 30 Minute Meeting (30min) → [Use default ▾]
│  ├ Discovery Call (45min) → [Discovery Template ▾]
│  └ Quick Chat (15min) → [Use default ▾]
├ [Refresh event types]
└ [Disconnect]
```

## API Endpoints

### `POST /api/calendly/connect`
Body: `{ pat, defaultTemplateId }`
Verifies PAT, fetches user info + event types, creates webhook, stores everything. Requires session auth.

### `DELETE /api/calendly/connect`
Disconnects: deletes webhook, removes DB rows. Requires session auth.

### `PUT /api/calendly/mappings`
Body: `{ eventTypeUri, templateId }`
Updates template mapping for an event type. Requires session auth.

### `POST /api/calendly/webhook`
Receives Calendly webhook. No session auth — verified via HMAC signature.

### `POST /api/calendly/refresh`
Re-fetches event types from Calendly API and syncs with DB. Requires session auth.

## Security

- PAT encrypted with AES-256-GCM in DB (same as other credentials)
- Webhook verified via HMAC-SHA256 signature
- Webhook signing key generated per user, stored encrypted
- Dedup via `calendly_webhook_log` prevents double-processing
- Webhook endpoint is public but signature-verified

## Scope

### In scope
- Per-user Calendly PAT connection in Settings > Integrations
- Event type fetching and display
- Mandatory default template + per-event-type template mapping
- Webhook subscription management (create/delete)
- Webhook processing with signature verification
- Booking execution through existing template system
- Invitee data mapping (custom fields + description fallback)
- Webhook dedup log
- Disconnect/cleanup

### Out of scope
- Push bookings TO Calendly
- Calendly OAuth (using PAT instead)
- Calendly availability sync (herbe.calendar availability is managed separately)
- Cancellation handling (invitee.canceled webhook — future enhancement)
- Rescheduling handling (future enhancement)
