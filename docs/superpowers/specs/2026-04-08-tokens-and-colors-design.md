# API Token Management & Activity Type Color Settings

**Date:** 2026-04-08
**Status:** Approved

## Overview

Two features for the herbe.calendar admin and user experience:

1. **API Token Management UI** — admin page to create, list, and revoke Bearer tokens for REST API access by BI tools (Power BI, Grafana, etc.)
2. **Activity Type Color Settings** — DB-backed color overrides for activity class groups, per-user and per-ERP-connection, replacing the current localStorage-only approach

Additionally: **admin table row hover highlighting** across Members, Accounts, and Tokens tables.

---

## Feature 1: API Token Management

### Context

The backend is already implemented:
- `api_tokens` table (migration 08) with SHA-256 hashed tokens, name, scope, revocation
- `generateToken()` / `validateToken()` in `lib/apiTokens.ts`
- Export endpoints: `/api/export/analytics`, `/api/export/users`, `/api/export/accounts`

Missing: admin UI to create/list/revoke tokens, and token expiry support.

### Database Changes

Add `expires_at` column to `api_tokens`:

```sql
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
```

### Token Validation Update

`validateToken()` in `lib/apiTokens.ts` must check `expires_at`:
- If `expires_at` is set and in the past, treat the token as invalid (same as revoked)

### Admin Page: `/admin/tokens`

New page in admin navigation, accessible per-account.

**Layout:** Table (consistent with Members page) with columns:
| Name | Scope | Created | Last Used | Expires | Status | Action |
|------|-------|---------|-----------|---------|--------|--------|

- **Scope** badges: `account` (blue) or `super` (amber, super-admin only)
- **Status** badges: `active` (green), `expired` (red), `revoked` (gray)
- Expired and revoked rows rendered at reduced opacity
- **Action:** "Revoke" button for active tokens, hidden for expired/revoked
- Row hover highlighting (shared with Members and Accounts tables)

### Create Token Flow

1. User clicks "+ Create Token" button
2. Modal form: name (required text input), scope (dropdown: account/super), expiry date (optional date picker, empty = no expiry)
3. Super-admin only sees the scope dropdown; account admins always create `account` scope
4. On submit → POST `/api/admin/tokens` → returns raw token
5. Token reveal screen: displays `hcal_...` with copy button and warning "This token won't be shown again. Copy it now."
6. User dismisses → token appears in table (only the hash is stored)

### API Routes: `/api/admin/tokens`

- **GET** — List tokens for current account. Returns: `id, name, scope, created_by, created_at, last_used, expires_at, revoked_at`. Sorted by created_at desc.
- **POST** — Create token. Body: `{ name, scope?, expiresAt? }`. Returns: `{ id, token }` (raw token, only time it's returned). Scope defaults to `account`. Only super-admins can create `super` scope.
- **PATCH** — Revoke token. Body: `{ id }`. Sets `revoked_at = now()`.

Auth: `requireAdminSession()` — same as other admin routes.

---

## Feature 2: Activity Type Color Settings

### Context

Current system:
- ERP sends activity types with class groups, each having a `CalColNr` (color hint)
- `activityColors.ts` resolves CalColNr → hex via brand palette + named color map
- User overrides stored in localStorage key `activityClassGroupColors`
- Not synced across devices, not scoped per connection

### Database Changes

New table `color_overrides`:

```sql
CREATE TABLE IF NOT EXISTS color_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email      TEXT,
  connection_id   UUID REFERENCES account_erp_connections(id) ON DELETE CASCADE,
  class_group_code TEXT NOT NULL,
  color           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_color_overrides_unique
  ON color_overrides (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code);

CREATE INDEX idx_color_overrides_account ON color_overrides (account_id);
CREATE INDEX idx_color_overrides_user ON color_overrides (account_id, user_email) WHERE user_email IS NOT NULL;
```

### Override Hierarchy (highest to lowest priority)

1. **User per-connection** — `user_email` set, `connection_id` set
2. **User global** — `user_email` set, `connection_id` NULL
3. **Admin per-connection** — `user_email` NULL, `connection_id` set
4. **Admin global** — `user_email` NULL, `connection_id` NULL
5. **ERP CalColNr** — from class group data fetched from ERP
6. **Palette fallback** — brand palette by index

### API Routes

**User level: `/api/settings/colors`**
- **GET** — Returns all color overrides for current user + admin defaults for the account. Client uses these to build the full resolved color map.
- **PUT** — Upsert a color override. Body: `{ classGroupCode, color, connectionId? }`. Scoped to current user's email and accountId.
- **DELETE** — Remove a user override. Body: `{ classGroupCode, connectionId? }`.

**Admin level: `/api/admin/colors`**
- **GET** — Returns admin-level overrides for the account.
- **PUT** — Upsert admin color override. Body: `{ classGroupCode, color, connectionId? }`. Sets `user_email = NULL` (admin default).
- **DELETE** — Remove admin override. Body: `{ classGroupCode, connectionId? }`.

### User UI: Settings Modal "Colors" Tab

Side-by-side column layout:
- **Left column: "All Connections"** — global user overrides, always shown
- **Right columns: one per active ERP connection** — per-connection overrides
- Each row: color swatch (clickable to open picker) + class group name
- **Inherited** entries shown as dashed border, faded opacity, italic "inherited" label
- **Overridden** entries shown as solid border with the custom swatch
- Click any swatch (including inherited) to set an override at that level
- "Reset" action per swatch removes the override, falls back to next level

### Admin UI: Config Page Color Section

Same side-by-side layout but for admin defaults. Placed as a new collapsible section in the Config page, below the ERP connections section.

### Migration from localStorage

On first load of the Colors tab (or on CalendarShell mount):
1. Check localStorage for `activityClassGroupColors`
2. If found and user has no DB overrides yet, POST each entry as a user global override
3. Clear the localStorage key
4. This is a one-time, best-effort migration

### Changes to `activityColors.ts`

- `buildClassGroupColorMap()` accepts an additional `dbOverrides` parameter (the resolved overrides from the API)
- Resolution logic walks the 6-level hierarchy per class group code
- `loadColorOverrides()` / `saveColorOverride()` localStorage functions become deprecated (kept briefly for migration, then removed)
- `getActivityColor()` needs the activity's `connectionId` to resolve per-connection overrides — this field must be added to the Activity interface and populated in the API routes

### Activity Interface Change

Add `connectionId?: string` to the `Activity` type in `types/index.ts`. Populated by `/api/activities` from the ERP connection used to fetch it.

---

## Feature 3: Admin Table Row Hover

Add CSS hover highlighting to all admin table rows:
- Members table (`MembersClient.tsx`)
- Accounts table (`AccountsClient.tsx`)
- Tokens table (new `TokensClient.tsx`)

Subtle background highlight on hover, consistent across all three.

---

## File Impact Summary

### New Files
| File | Purpose |
|------|---------|
| `db/migrations/10_add_token_expiry.sql` | Add `expires_at` to `api_tokens` |
| `db/migrations/11_create_color_overrides.sql` | New `color_overrides` table |
| `app/admin/tokens/page.tsx` | Admin tokens page (server component) |
| `app/admin/tokens/TokensClient.tsx` | Tokens table + create modal |
| `app/api/admin/tokens/route.ts` | Token CRUD API |
| `app/api/settings/colors/route.ts` | User color overrides API |
| `app/api/admin/colors/route.ts` | Admin color overrides API |

### Modified Files
| File | Change |
|------|--------|
| `lib/apiTokens.ts` | Check `expires_at` in `validateToken()` |
| `lib/activityColors.ts` | Accept DB overrides, 6-level hierarchy resolution |
| `types/index.ts` | Add `connectionId` to Activity |
| `app/api/activities/route.ts` | Populate `connectionId` on activities |
| `app/api/outlook/route.ts` | Populate `connectionId` on activities |
| `components/CalendarShell.tsx` | Fetch color overrides from API, pass to color resolver, localStorage migration |
| `components/SettingsModal.tsx` | Add "Colors" tab with side-by-side layout |
| `app/admin/config/ConfigClient.tsx` | Add admin color settings section |
| `app/admin/members/MembersClient.tsx` | Add row hover CSS |
| `app/admin/accounts/AccountsClient.tsx` | Add row hover CSS |
| `components/AdminShell.tsx` | Add "Tokens" to admin nav |
