# Booking Page Specification

## Overview
An optional extension to shared favorite links that allows external visitors to book meetings with the calendar owner(s). The booking view shows simplified available time slots — not a full calendar.

## Core Flow
1. Visitor opens a shared link that has booking enabled
2. Selects a meeting template (e.g. "30min Sales Intro", "1h Sales Demo")
3. Sees available time slots based on template availability rules, with busy times blocked out from the favorite's calendars (checked in background)
4. Picks a slot
5. Fills in custom fields (booker email always required + template-defined fields)
6. Submit creates activities in all configured endpoints simultaneously
7. Notification emails sent to all participants
8. Booker receives confirmation with cancel/reschedule token

## Meeting Templates (Admin-defined)

Templates are reusable definitions created by the user (not per-link). Each template defines:

### Basic Info
- Name (e.g. "30min Sales Intro")
- Duration (minutes)
- Availability windows: day-of-week + time range (e.g. Tue-Thu 14:00-18:00, Mon/Fri 09:00-12:00)
- Buffer time before/after (optional, e.g. 15min gap between bookings)

### Activity Creation Targets
A template can create activities in multiple endpoints simultaneously:
- **ERP endpoints**: which ERP connection(s) to create in
  - Pre-filled fields: ActType, Project, Customer, Item, MainPersons, CCPersons
  - CalTimeFlag (planned/actual)
- **Outlook/Teams**: create a Teams meeting
  - Attendees (internal persons from the favorite)
  - Online meeting (Teams link auto-generated)
  - Location
- **Google Calendar**: create a Google Calendar event
  - Attendees, location, Google Meet link

### Template Management
- **Settings > Templates tab** in user Settings modal
- Create, edit, duplicate, delete templates
- Each template shows which favorites/share links use it
- Favorites dropdown: toggle "Enable booking" on a share link and pick templates

### Custom Fields
Template defines additional input fields for the booker:
- Each field has: label, type (text | email), required (boolean)
- Booker email is always required (not part of custom fields — built-in)
- Field values are stored as structured text in:
  - ERP: `Text` field (line-by-line: "Label: Value")
  - Outlook: `body` / description
  - Google: `description`
- Empty optional fields are included with no value

## Link Configuration
When enabling booking on a shared link:
- Select one or more templates to offer
- The favorite's person_codes + hidden_calendars define whose calendars are checked for availability
- All persons in the favorite are included as attendees

## Availability Logic
1. Template defines available windows (weekday + hour ranges)
2. App fetches activities from ALL sources in the favorite (ERP, Outlook, Google, ICS) — same data as the share view but not displayed
3. Busy times are subtracted from available windows
4. Remaining free slots (matching template duration) are shown to the booker
5. Timezone selector allows booker to see slots in their local time (stored in Europe/Riga internally)
6. Re-check availability on submit to prevent double-booking

## Notifications
- Same email sent to everyone (booker + all participants) using existing SMTP/Azure mail
- Contains: meeting details, date/time, custom field values, cancel/reschedule link (token-based)
- Sent on: booking confirmed, cancelled, rescheduled

## Cancellation/Rescheduling
- **Booker**: gets a unique token link in confirmation email
- **Participants** (calendar owners): can cancel/reschedule from within herbe.calendar when viewing the booked activity (booking ID stored on the activity)
- Cancel: deletes/cancels the activities in all endpoints, sends cancellation email to all parties
- Reschedule: cancel + new booking flow, sends update email to all parties

## DB Schema Additions

### booking_templates
- id (UUID PK)
- account_id (FK → tenant_accounts)
- user_email (creator)
- name (text)
- duration_minutes (int)
- availability_windows (JSONB) — `[{days: [1,2,3], startTime: "14:00", endTime: "18:00"}]`
- buffer_minutes (int, default 0)
- targets (JSONB) — `{erp: [{connectionId, fields: {...}}], outlook: {enabled, onlineMeeting, ...}, google: {enabled, ...}}`
- custom_fields (JSONB) — `[{label, type, required}]`
- active (boolean)
- created_at, updated_at

### share_link_templates (junction)
- id (UUID PK)
- share_link_id (FK → favorite_share_links)
- template_id (FK → booking_templates)

### bookings
- id (UUID PK)
- account_id (FK)
- template_id (FK)
- share_link_id (FK)
- booker_email (text)
- booked_date (date)
- booked_time (time)
- field_values (JSONB) — `{fieldLabel: value}`
- cancel_token (text, unique)
- status (enum: confirmed, cancelled, rescheduled)
- created_erp_ids (JSONB) — `[{connectionId, activityId}]`
- created_outlook_id (text, nullable)
- created_google_id (text, nullable)
- notification_sent (boolean)
- created_at

## Not in V1
- Recurring availability exceptions (holidays, specific dates blocked)
- Payment integration
- Approval workflow (auto-confirmed for V1)
- Multiple duration options per template (pick separate templates instead)
