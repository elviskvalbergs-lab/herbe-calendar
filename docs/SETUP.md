# Herbe Calendar — Setup Guide

## New Installation

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon recommended for Vercel deployment)
- A Vercel account (for hosting)

### Step 1: Environment Variables

Set these environment variables in your Vercel project (or `.env.local` for local dev):

| Variable | Required | Description | How to get it |
|----------|----------|-------------|---------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | From Neon dashboard → Connection Details → Connection string |
| `NEXTAUTH_SECRET` | Yes | Random string for session signing | Generate with: `openssl rand -base64 32` |
| `SUPER_ADMIN_EMAILS` | Yes | Comma-separated list of super admin email addresses | Your email(s), e.g. `admin@company.com,backup@company.com` |
| `CONFIG_ENCRYPTION_KEY` | Yes | 64-character hex string for encrypting secrets in DB | Generate with: `openssl rand -hex 32` |

**That's it for env vars.** All other configuration (Azure AD, ERP connections) is done through the admin UI after first login.

### Step 2: Deploy to Vercel

```bash
# Clone the repository
git clone <repo-url>
cd herbe-calendar

# Install dependencies
npm install

# Deploy to Vercel
npx vercel

# Set environment variables
npx vercel env add DATABASE_URL production
npx vercel env add NEXTAUTH_SECRET production
npx vercel env add SUPER_ADMIN_EMAILS production
npx vercel env add CONFIG_ENCRYPTION_KEY production
```

### Step 3: Run Database Migrations

```bash
# Pull the DATABASE_URL locally
npx vercel env pull .env.local

# Run all migrations in order
source .env.local
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Migrations create these tables:
- `user_calendars` — ICS calendar subscriptions
- `user_favorites` — Saved calendar views
- `favorite_share_links` — Public calendar sharing
- `person_codes` — Unified user codes (ERP + Azure)
- `tenant_accounts` — Multi-tenant accounts
- `account_members` — Account memberships and roles
- `account_azure_config` — Azure AD connection config (encrypted)
- `account_erp_connections` — Standard ERP connections (encrypted)
- `account_settings` — General account settings
- `config_audit_log` — Configuration change tracking
- `analytics_events` — Usage analytics
- `api_tokens` — Bearer tokens for BI export

### Step 4: First Login

1. Open your deployed URL
2. Enter your super admin email (the one in `SUPER_ADMIN_EMAILS`)
3. You'll receive a magic link email — **but only if Azure AD is configured for sending emails**

**Bootstrap problem:** On a brand new install, there's no Azure connection yet, so the app can't send login emails. Solutions:

**Option A (recommended):** Temporarily set Azure env vars for the initial login:
```bash
npx vercel env add AZURE_TENANT_ID production
npx vercel env add AZURE_CLIENT_ID production
npx vercel env add AZURE_CLIENT_SECRET production
npx vercel env add AZURE_SENDER_EMAIL production
```
After first login, configure Azure through the admin UI, then remove these env vars.

**Option B:** Manually insert a session into the database (advanced).

### Step 5: Configure Azure AD

1. Go to `/admin/config`
2. Under "Azure AD / Microsoft 365", enter:
   - **Tenant ID**: From Azure Portal → Azure Active Directory → Overview → Tenant ID
   - **Client ID**: From Azure Portal → App Registrations → your app → Application (client) ID
   - **Client Secret**: From Azure Portal → App Registrations → your app → Certificates & secrets → New client secret
   - **Sender Email**: An email account in your tenant that will send login/notification emails (must have a mailbox)
3. Click "Save Azure Config"
4. Click "Test Connection" to verify

#### Azure App Registration Setup

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations → New registration
2. Name: "Herbe Calendar" (or your preference)
3. Supported account types: "Accounts in this organizational directory only"
4. Redirect URI: leave blank for now
5. After creation, note the **Application (client) ID** and **Directory (tenant) ID**
6. Go to Certificates & secrets → New client secret → copy the **Value** (not the Secret ID)
7. Go to API permissions → Add a permission:
   - Microsoft Graph → Application permissions:
     - `Calendars.Read` — Read all users' calendars
     - `Calendars.ReadWrite` — Create/edit calendar events
     - `Mail.Send` — Send login emails
     - `User.Read.All` — List users for the people selector
   - Click "Grant admin consent" for your organization

### Step 5b: Configure SMTP (alternative to Azure for emails)

If you don't have Azure AD, you can use SMTP to send magic link emails:

1. Go to `/admin/config`
2. Under "SMTP Email", enter:
   - **Host**: Your SMTP server (e.g. `smtp.gmail.com`)
   - **Port**: Usually `587` (TLS) or `465` (SSL)
   - **Username**: SMTP login (usually your email address)
   - **Password**: SMTP password or app-specific password
   - **Sender Email**: The "from" address for login emails
   - **Sender Name**: Display name (default: "Herbe Calendar")
3. Click "Save SMTP"
4. Click "Test SMTP" — you should receive a test email

#### Gmail SMTP Setup

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification (required for app passwords)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Create a new app password for "Herbe Calendar"
5. Use these settings:
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: your Gmail address
   - Password: the generated app password

### Step 5c: Configure Google Workspace (alternative to Azure for calendars)

If your organization uses Google Workspace instead of Microsoft 365:

1. Go to `/admin/config`
2. Under "Google Workspace", enter:
   - **Service Account Email**: From Google Cloud Console
   - **Service Account Private Key**: The `private_key` value from the JSON key file
   - **Admin Email**: A Workspace admin email (used for domain-wide delegation)
   - **Domain**: Your Workspace domain (e.g. `company.com`)
3. Click "Save Google Config"
4. Click "Test Connection" to verify user listing works

#### Google Cloud Service Account Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable these APIs:
   - Google Calendar API
   - Admin SDK API (for Directory / user listing)
4. Create a service account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: "Herbe Calendar"
   - Grant no roles (domain-wide delegation handles access)
5. Create a key:
   - Click the service account → Keys → Add Key → Create new key → JSON
   - Save the JSON file — you'll need the `private_key` and `client_email` fields
6. Enable domain-wide delegation:
   - Click the service account → Details → Show advanced settings → Enable "Google Workspace Domain-wide Delegation"
   - Note the **Client ID** (numeric)
7. Grant API scopes in Google Workspace Admin:
   - Go to [admin.google.com](https://admin.google.com) → Security → Access and data control → API controls → Manage Domain-wide Delegation
   - Add new API client:
     - Client ID: the numeric ID from step 6
     - OAuth scopes (comma-separated):
       ```
       https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/admin.directory.user.readonly
       ```
8. In the admin config, enter the service account email and private key

### Step 6: Add Standard ERP Connections

1. Go to `/admin/config`
2. Under "Standard ERP Connections", click "+ Add Connection"
3. Fill in:
   - **Connection Name**: A friendly name (e.g. "Burti Production", "Herbe LT")
   - **Company Code**: The company number in Standard ERP (e.g. "3")
   - **API Base URL**: The REST API endpoint (e.g. `https://your-erp-server.com/api`)
   - **Server UUID**: (Optional) From Standard ERP → Server → Preferences → Server UUID. Enables `hansa://` deep links to open records in the desktop client.
4. Authentication — choose one:
   - **OAuth**: Enter Client ID and Client Secret from Standard ID, then click "Connect OAuth" to authorize
   - **Basic Auth**: Enter username and password directly

#### Standard ERP OAuth Setup

1. Go to [Standard ID](https://standard-id.hansaworld.com) and create an OAuth application
2. Set the redirect URI to: `https://your-domain.com/api/herbe/callback`
3. Note the **Client ID** and **Client Secret**
4. In the admin config, enter these and click "Connect OAuth"
5. You'll be redirected to Standard ID to authorize — after approval, tokens are stored encrypted in the database

### Step 7: Manage Users

Users are automatically synced from your configured sources:
- **Standard ERP users**: All active users from each ERP connection's UserVc register
- **Azure AD users**: All enabled users from your Azure AD tenant

The sync happens when any user loads the calendar. Users appear in `/admin/members` where you can:
- Toggle roles (admin/member)
- Activate/deactivate users

### Step 8: Create Additional Accounts (Multi-tenant)

If you need to serve multiple organizations:

1. Go to `/admin/accounts` (super admin only)
2. Click "+ New Account"
3. Enter a display name and URL slug
4. The new account starts empty — configure its connections:
   - Azure AD OR Google Workspace (for calendar + user listing)
   - SMTP (for login emails, if not using Azure)
   - Standard ERP connections (for activities)

---

## API Tokens for BI Export

To export data to external BI tools:

1. Create an API token (currently via DB — admin UI coming soon):
   ```sql
   INSERT INTO api_tokens (account_id, token_hash, name, scope, created_by)
   VALUES ('<account-id>', '<sha256-of-token>', 'BI Export', 'account', 'admin@company.com');
   ```
2. Use the token with Bearer auth:
   ```bash
   # Incremental analytics export
   curl -H "Authorization: Bearer hcal_<token>" \
     "https://your-domain.com/api/export/analytics?since=2026-04-01"

   # User list
   curl -H "Authorization: Bearer hcal_<token>" \
     "https://your-domain.com/api/export/users"
   ```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Failed to save" on Azure config | `CONFIG_ENCRYPTION_KEY` not set or invalid | Set a 64-char hex string: `openssl rand -hex 32` |
| Empty user list | person_codes sync failed | Check ERP/Azure connection config in admin |
| "Forbidden" on editing activity | Activity from different ERP connection | Ensure the activity's connection is correctly configured |
| Login email not received | No email transport configured | Set up Azure AD (with Mail.Send) or SMTP in admin config |
| SMTP test fails | Wrong credentials or blocked port | Check host/port/username/password. Gmail needs app password. |
| Google "delegation denied" | Service account not authorized | Check domain-wide delegation in Workspace Admin Console |
| Google "insufficient permissions" | Missing API scopes | Re-add scopes in Workspace Admin → API controls |
| PWA shows empty on restart | Normal on first load — stubs restore from localStorage | Wait for API to load, or pull to refresh |
