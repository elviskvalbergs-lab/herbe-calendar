import Link from 'next/link'

export default function AdminPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/docs" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Docs
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Admin Configuration</h1>
      <p className="text-text-muted mb-8">
        Configure data source connections, authentication, notifications, and manage members.
        All admin settings are in <code className="bg-surface px-1 rounded text-text">/admin</code>.
      </p>

      <nav className="mb-8 p-4 bg-surface rounded-lg border border-border">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">On this page</p>
        <ul className="space-y-1">
          <li><a href="#erp-connections" className="text-sm text-primary hover:underline">ERP Connections</a></li>
          <li><a href="#azure-ad" className="text-sm text-primary hover:underline">Azure AD (Outlook &amp; Teams)</a></li>
          <li><a href="#google-workspace" className="text-sm text-primary hover:underline">Google Workspace</a></li>
          <li><a href="#google-oauth" className="text-sm text-primary hover:underline">Google OAuth (Per-User)</a></li>
          <li><a href="#zoom" className="text-sm text-primary hover:underline">Zoom</a></li>
          <li><a href="#holidays" className="text-sm text-primary hover:underline">Holidays</a></li>
          <li><a href="#smtp" className="text-sm text-primary hover:underline">SMTP (Email)</a></li>
          <li><a href="#members" className="text-sm text-primary hover:underline">Members</a></li>
          <li><a href="#analytics" className="text-sm text-primary hover:underline">Analytics</a></li>
        </ul>
      </nav>

      <div className="space-y-10">

        <section>
          <h2 id="erp-connections" className="text-xl font-semibold mb-3 pb-2 border-b border-border">ERP Connections</h2>
          <p className="text-text-muted mb-3">
            Connect one or more Standard ERP or Excellent Books instances. Each connection is independent
            and can target a different company or register.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to Admin &gt; Connections &gt; ERP Connections</li>
            <li>Click &quot;Add connection&quot; and enter a display name, API base URL, company code, client ID, and username</li>
            <li>Multiple connections are supported — useful for organizations running separate ERP instances</li>
            <li>Each connection can be enabled or disabled independently</li>
            <li>Members are assigned to ERP connections through their member profile</li>
          </ul>
        </section>

        <section>
          <h2 id="azure-ad" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Azure AD (Outlook &amp; Teams)</h2>
          <p className="text-text-muted mb-3">
            Required to enable Outlook calendar sync and Teams meeting creation. Uses an Azure AD (Entra ID)
            app registration with application-level permissions.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-3">
            <li>Go to Admin &gt; Connections &gt; Azure AD</li>
            <li>Enter your Azure tenant ID, client ID, and client secret</li>
            <li>Optionally enter a sender email for outbound notifications via Microsoft 365</li>
          </ul>
          <div className="bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-muted">
            <span className="text-text font-semibold block mb-1">Required Azure AD permissions</span>
            Calendars.ReadWrite, OnlineMeetings.ReadWrite, and User.Read.All — all as application permissions
            (not delegated). Grant admin consent in the Azure portal after adding these permissions.
          </div>
        </section>

        <section>
          <h2 id="google-workspace" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Google Workspace</h2>
          <p className="text-text-muted mb-3">
            Enables domain-wide Google Calendar access for all users in a Google Workspace organization.
            Uses a service account with domain-wide delegation.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-3">
            <li>Go to Admin &gt; Connections &gt; Google Workspace</li>
            <li>Upload the service account JSON key file</li>
            <li>Enter the admin email (a Workspace admin account the service account impersonates)</li>
            <li>Enter the domain (e.g. <code className="bg-bg px-1 rounded">company.com</code>)</li>
          </ul>
          <div className="bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text-muted">
            <span className="text-text font-semibold block mb-1">Setup steps</span>
            Create a service account in Google Cloud Console. Enable domain-wide delegation. In Google Workspace
            Admin, authorize the service account with the Calendar API scope
            (<code className="bg-bg px-1 rounded">https://www.googleapis.com/auth/calendar</code>).
          </div>
        </section>

        <section>
          <h2 id="google-oauth" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Google OAuth (Per-User)</h2>
          <p className="text-text-muted mb-3">
            Enables individual users to connect their personal Google accounts via OAuth consent. Required
            for personal Gmail users or Workspace users connecting additional calendars.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to Admin &gt; Connections &gt; Google OAuth</li>
            <li>Enter the OAuth client ID and client secret from Google Cloud Console</li>
            <li>Create an OAuth 2.0 client of type &quot;Web application&quot; in Google Cloud Console</li>
            <li>Add the herbe.calendar callback URL as an authorized redirect URI</li>
            <li>Once configured, users can connect their Google account in Settings &gt; Integrations</li>
          </ul>
        </section>

        <section>
          <h2 id="zoom" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Zoom</h2>
          <p className="text-text-muted mb-3">
            Enables Zoom meeting creation when booking or creating activities. Uses a Server-to-Server
            OAuth app — no individual user authorization required.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Create a &quot;Server-to-Server OAuth&quot; app in the Zoom App Marketplace</li>
            <li>Grant the app the <code className="bg-surface px-1 rounded text-text">meeting:write:admin</code> scope</li>
            <li>Go to Admin &gt; Connections &gt; Zoom</li>
            <li>Enter the Zoom account ID, client ID, and client secret</li>
          </ul>
        </section>

        <section>
          <h2 id="holidays" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Holidays</h2>
          <p className="text-text-muted mb-3">
            Holiday data is used to block booking availability on public holidays and to display holiday
            indicators in the calendar.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to Admin &gt; Connections &gt; Holidays</li>
            <li>Set the default holiday country for the account (ISO country code, e.g. <code className="bg-surface px-1 rounded text-text">LV</code>, <code className="bg-surface px-1 rounded text-text">DE</code>)</li>
            <li>Individual members can have their own holiday country set in Admin &gt; Members</li>
            <li>Holiday data is fetched from the configured holidays API</li>
          </ul>
        </section>

        <section>
          <h2 id="smtp" className="text-xl font-semibold mb-3 pb-2 border-b border-border">SMTP (Email)</h2>
          <p className="text-text-muted mb-3">
            SMTP configuration enables outbound email for booking confirmations and cancellation
            notifications. Without SMTP, bookings still work but no emails are sent.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to Admin &gt; Connections &gt; SMTP</li>
            <li>Enter host, port, username, password, sender email, and sender name</li>
            <li>TLS can be enabled or disabled depending on your mail server</li>
            <li>Works with any SMTP server — Gmail, SendGrid, Mailgun, self-hosted, etc.</li>
          </ul>
        </section>

        <section>
          <h2 id="members" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Members</h2>
          <p className="text-text-muted mb-3">
            Members are the people who appear in the calendar. They can be synced from connected systems
            or added manually.
          </p>

          <h3 id="syncing-members" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Syncing Members</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Go to Admin &gt; Members and click &quot;Sync from ERP&quot; or &quot;Sync from Azure&quot;</li>
            <li>ERP sync imports active employees from connected ERP instances</li>
            <li>Azure sync imports users from your Azure AD directory</li>
            <li>Existing members are updated; new members are added</li>
          </ul>

          <h3 id="member-settings" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Member Settings</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Role — admin (full access) or member (calendar access only)</li>
            <li>Holiday country — overrides the account default for this person</li>
            <li>ERP link — associates the member with their ERP user account</li>
            <li>Members can be deactivated to hide them from the calendar without deleting their data</li>
          </ul>
        </section>

        <section>
          <h2 id="analytics" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Analytics</h2>
          <p className="text-text-muted mb-3">
            The analytics dashboard gives admins an overview of calendar and booking activity across
            the account.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to Admin &gt; Analytics</li>
            <li>View booking volume, share link activity, and active members over time</li>
            <li>Analytics data is collected automatically — no additional configuration required</li>
            <li>Only admins have access to the analytics dashboard</li>
          </ul>
        </section>

      </div>
    </>
  )
}
