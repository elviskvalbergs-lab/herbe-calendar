# Per-Calendar Sharing & Visibility Design

## Summary

Allow users to share their personally connected calendars (Google per-user OAuth + ICS feeds) with colleagues at configurable visibility levels. Currently these calendars are visible only to the user who connected them. This feature lets users expose them to the team — with control over how much detail is shown.

## Problem

Users connect personal Google accounts or add ICS feeds, but only they can see the events. A user might want to:
- Show busy/free from their personal calendar so colleagues know when they're available
- Share event titles from a shared team calendar added via ICS
- Keep a private calendar completely hidden from others

## Decisions

- **Per-calendar visibility level:** Each connected calendar gets a sharing setting
- **Visibility levels:** Same as share links — Private, Busy, Titles, Full
- **Default:** Private (no change for existing calendars)
- **Applies to:** Google per-user calendars + ICS feeds
- **Domain-wide delegation calendars (Outlook + Workspace Google):** Not affected — those are already visible to all by design
- **Booking availability:** Shared calendars' busy blocks feed into booking availability for the calendar owner

## Visibility Levels

| Level | Colleagues see | In booking availability |
|-------|---------------|----------------------|
| Private | Nothing | Not included |
| Busy | Busy/free blocks (no details) | Included |
| Titles | Event titles + times | Included |
| Full | Full event details | Included |

## Data Model

### Per-user Google calendars

Add column to `user_google_calendars`:

```sql
ALTER TABLE user_google_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
-- Values: 'private', 'busy', 'titles', 'full'
```

### ICS feeds

Add column to `user_calendars`:

```sql
ALTER TABLE user_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
```

## How It Works

### Settings UI — Integrations Tab

Each calendar in the Google and ICS sections gets a sharing dropdown alongside the existing color picker:

```
☑ Work Calendar    🔵    [Private ▾]
☑ Personal         🟢    [Busy ▾]
☑ Team Standup ICS 🟡    [Titles ▾]
```

Options: Private / Busy / Titles / Full

### Calendar View — Seeing Shared Calendars

When user A views user B's column:
1. Fetch B's per-user Google calendars and ICS feeds that have `sharing != 'private'`
2. Filter events based on visibility level:
   - Busy: show colored blocks with no text (just "Busy")
   - Titles: show event title and time
   - Full: show full details (description, attendees, location, join links)
3. These appear in B's column alongside their domain-wide Outlook/Google events

### API Changes

#### `GET /api/google` route
Currently fetches per-user Google events only for the session user. Extend to also fetch shared calendars from other users when viewing their column:
- For each person code being viewed, check if any user in the account has shared Google calendars for that person code
- Actually — shared calendars are per-user, not per-person-code. So when viewing person B, look up B's user email → find their `user_google_tokens` → get calendars with `sharing != 'private'` → fetch events → filter by visibility level

#### `GET /api/outlook` route
ICS feeds work similarly — check if the ICS feed owner has set `sharing != 'private'` on their feeds.

#### New endpoint: `GET /api/shared-calendars`
Returns all shared calendar events for a set of person codes:
- Looks up which users have person codes matching the requested ones
- Fetches their shared Google calendars and ICS feeds
- Filters events by visibility level
- Returns combined events

#### `PUT /api/google/calendars` — extend
Accept `sharing` field alongside existing `enabled` and `color`.

#### `PUT /api/settings/calendars` — extend
Accept `sharing` field for ICS feeds.

### Booking Availability

In `collectBusyBlocks`, after checking domain-wide Google/Outlook, also check shared per-user calendars:
- For each person code, find users who have shared calendars (busy or higher) associated with that person
- Fetch events from those calendars
- Add as busy blocks

This means if Elvis shares his personal Google calendar as "Busy", his personal events block booking slots alongside his Workspace events.

### Calendar Sources Dropdown

Shared calendars from other users appear in the sources dropdown grouped under the person they belong to. Users can toggle them on/off just like ICS feeds.

## Edge Cases

- **User shares calendar, then disconnects Google:** Shared calendar entries become orphaned. The events fetch should handle missing tokens gracefully (skip with no error).
- **Multiple users with same person code:** Unlikely but possible. All shared calendars for that person code would be included.
- **Circular sharing:** User A shares their calendar, User B views it — this is simple, no recursion.
- **Performance:** Additional API calls per shared calendar. Cache shared calendar tokens to avoid repeated DB queries.

## Scope

### In scope
- Sharing dropdown per Google calendar and ICS feed in Settings
- DB columns for sharing level
- Fetching shared calendars when viewing other users' columns
- Filtering events by visibility level
- Including shared calendars in booking availability
- API endpoints for setting sharing level

### Out of scope
- Sharing domain-wide delegation calendars (already shared by nature)
- Sharing ERP activities (different mechanism)
- Fine-grained per-event sharing (all-or-nothing per calendar)
- Sharing across accounts/tenants
- Notifications when someone shares a calendar with you
