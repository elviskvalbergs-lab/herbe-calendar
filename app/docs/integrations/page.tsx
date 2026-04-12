import Link from 'next/link'

export default function IntegrationsPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/docs" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Docs
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Calendar Integrations</h1>
      <p className="text-text-muted mb-8">
        herbe.calendar connects to multiple calendar and scheduling systems. Here is what each integration
        supports and how it is configured.
      </p>

      <nav className="mb-8 p-4 bg-surface rounded-lg border border-border">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">On this page</p>
        <ul className="space-y-1">
          <li><a href="#erp" className="text-sm text-primary hover:underline">ERP (Standard ERP / Excellent Books)</a></li>
          <li><a href="#outlook" className="text-sm text-primary hover:underline">Microsoft Outlook &amp; Teams</a></li>
          <li><a href="#google" className="text-sm text-primary hover:underline">Google Calendar</a></li>
          <li><a href="#zoom" className="text-sm text-primary hover:underline">Zoom</a></li>
          <li><a href="#calendly" className="text-sm text-primary hover:underline">Calendly</a></li>
          <li><a href="#ics" className="text-sm text-primary hover:underline">ICS Feeds</a></li>
          <li><a href="#apple" className="text-sm text-primary hover:underline">Apple Calendar</a></li>
        </ul>
      </nav>

      <div className="space-y-10">

        <section>
          <h2 id="erp" className="text-xl font-semibold mb-3 pb-2 border-b border-border">ERP (Standard ERP / Excellent Books)</h2>
          <p className="text-text-muted mb-3">
            The ERP integration connects directly to your Standard ERP or Excellent Books instance to read and
            write activities. Multiple ERP connections can be configured for different companies or registers.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Activities are read from and written to the ERP in real time</li>
            <li>Supports multiple ERP connections with separate companies and registers</li>
            <li>Activity fields: project, task, activity type, register, description, start/end time</li>
            <li>Admin connects ERP instances in Admin &gt; Connections with API credentials</li>
          </ul>
          <p className="text-text-muted text-sm mt-3">
            See <Link href="/docs/admin" className="text-primary hover:underline">Admin Configuration</Link> for setup details.
          </p>
        </section>

        <section>
          <h2 id="outlook" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Microsoft Outlook &amp; Teams</h2>
          <p className="text-text-muted mb-3">
            Outlook integration uses Azure Active Directory (Entra ID) to access calendar events for all members
            in your organization. Events are bidirectional — you can read and create events.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Reads Outlook calendar events for all configured members</li>
            <li>Creates new Outlook events with subject, location, attendees, and body</li>
            <li>Optionally adds a Microsoft Teams meeting link to new events</li>
            <li>Attendee RSVP status is displayed on events</li>
            <li>Requires an Azure AD app registration with Calendar.ReadWrite and OnlineMeetings.ReadWrite permissions</li>
            <li>Admin configures tenant ID, client ID, and client secret in Admin &gt; Connections</li>
          </ul>
        </section>

        <section>
          <h2 id="google" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Google Calendar</h2>
          <p className="text-text-muted mb-3">
            Google Calendar support comes in two modes. Both can be active at the same time.
          </p>

          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-lg px-5 py-4">
              <h3 id="google-workspace" className="font-semibold mb-2">Google Workspace — Domain-Wide Delegation</h3>
              <p className="text-sm text-text-muted mb-2">
                For Google Workspace organizations. A service account with domain-wide delegation accesses
                calendar data for all users in your domain. No individual user consent needed.
              </p>
              <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
                <li>Admin uploads service account JSON and configures admin email and domain</li>
                <li>All Workspace users&apos; primary calendars are accessible</li>
                <li>Events are read and created on behalf of each user</li>
              </ul>
            </div>

            <div className="bg-surface border border-border rounded-lg px-5 py-4">
              <h3 id="google-oauth" className="font-semibold mb-2">Personal OAuth — Per-User Consent</h3>
              <p className="text-sm text-text-muted mb-2">
                For personal Gmail accounts or Workspace users who want to connect additional calendars.
                Each user connects their own Google account via OAuth consent.
              </p>
              <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
                <li>Admin configures Google OAuth client ID and secret in Admin &gt; Connections</li>
                <li>Each user connects their account in Settings &gt; Integrations</li>
                <li>User can select which of their calendars to make visible</li>
                <li>Supports read and write on connected calendars</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 id="zoom" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Zoom</h2>
          <p className="text-text-muted mb-3">
            The Zoom integration uses a Server-to-Server OAuth app, configured by the admin. Once active,
            Zoom meeting links can be added when creating activities or booking slots.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Admin creates a Server-to-Server OAuth app in the Zoom App Marketplace</li>
            <li>Credentials (account ID, client ID, client secret) are entered in Admin &gt; Connections</li>
            <li>When creating an activity or booking slot, users can toggle &quot;Add Zoom meeting&quot;</li>
            <li>A Zoom meeting link is generated and included in the activity or booking confirmation</li>
          </ul>
        </section>

        <section>
          <h2 id="calendly" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Calendly</h2>
          <p className="text-text-muted mb-3">
            Calendly integration shows incoming bookings as read-only activities in your calendar view.
            Each user connects their own Calendly account.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Open Settings &gt; Integrations and enter your Calendly Personal Access Token</li>
            <li>Generate a token at <code className="bg-surface px-1 rounded text-text">calendly.com/integrations/api_webhooks</code></li>
            <li>Incoming Calendly bookings appear as activities in your calendar</li>
            <li>Calendly events are read-only — editing must be done in Calendly directly</li>
          </ul>
        </section>

        <section>
          <h2 id="ics" className="text-xl font-semibold mb-3 pb-2 border-b border-border">ICS Feeds</h2>
          <p className="text-text-muted mb-3">
            Any ICS (iCalendar) URL can be attached to a person in the calendar. This is useful for external
            calendars, booking systems, or public holiday feeds.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Open Settings and navigate to the person you want to attach a feed to</li>
            <li>Paste any valid ICS URL — Airbnb bookings, room booking systems, public calendars, etc.</li>
            <li>Events from the feed appear in that person&apos;s column with the ICS source color</li>
            <li>Feeds are cached for up to 5 minutes; use the manual refresh button to force a refresh</li>
            <li>ICS feeds are read-only</li>
          </ul>
        </section>

        <section>
          <h2 id="apple" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Apple Calendar</h2>
          <p className="text-text-muted mb-3">
            Apple does not provide a third-party Calendar API, so there is no direct OAuth connection. However,
            you can subscribe to any iCloud Calendar as a read-only ICS feed — events will appear in
            herbe.calendar automatically.
          </p>

          <div className="bg-surface border border-border rounded-lg px-5 py-4 mb-4">
            <h3 className="font-semibold mb-3 text-sm">How to get your ICS URL from iCloud Calendar</h3>
            <ol className="space-y-2 text-text-muted text-sm list-decimal list-inside">
              <li>Open iCloud Calendar at <code className="bg-bg px-1 rounded text-text">icloud.com/calendar</code> or the Calendar app on your Mac</li>
              <li>Right-click the calendar you want to share (or tap the broadcast icon next to it)</li>
              <li>Select <strong className="text-text">Public Calendar</strong> to enable public sharing</li>
              <li>Copy the <code className="bg-bg px-1 rounded text-text">webcal://</code> URL that appears — replace <code className="bg-bg px-1 rounded text-text">webcal://</code> with <code className="bg-bg px-1 rounded text-text">https://</code> before pasting</li>
              <li>In herbe.calendar, go to <strong className="text-text">Settings &gt; Integrations &gt; ICS Calendar Feeds</strong> and paste the URL</li>
            </ol>
          </div>

          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>This gives read-only access — events appear in herbe.calendar but cannot be edited here</li>
            <li>To edit or delete events, do so directly in Apple Calendar or iCloud</li>
          </ul>

          <p className="text-text-muted text-sm mt-3">
            See{' '}
            <a
              href="https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Apple&apos;s official guide on sharing iCloud calendars
            </a>{' '}
            for more details.
          </p>
        </section>

      </div>
    </>
  )
}
