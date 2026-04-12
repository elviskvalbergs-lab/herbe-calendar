import Link from 'next/link'

export default function SharingPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/docs" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Docs
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Calendar Sharing</h1>
      <p className="text-text-muted mb-10">
        Share your calendar view with external parties, control what they see, and subscribe to shared
        calendars from colleagues.
      </p>

      <div className="space-y-10">

        <section>
          <h2 className="text-xl font-semibold mb-3 pb-2 border-b border-border">Share Links</h2>
          <p className="text-text-muted mb-3">
            Share links give external viewers a read-only window into one or more people&apos;s calendars.
            You control exactly how much detail is exposed.
          </p>

          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Creating a Share Link</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Open the Favorites dropdown in the toolbar</li>
            <li>Select a saved favorite group (the people whose calendars will be shared)</li>
            <li>Click &quot;Create share link&quot; from the favorite options</li>
            <li>Configure visibility, protection, and expiry settings</li>
            <li>Copy and distribute the generated URL</li>
          </ul>

          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Visibility Levels</h3>
          <div className="space-y-2 mb-4">
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Busy</span>
              <p className="text-sm text-text-muted mt-0.5">Viewer sees only that time slots are occupied. No event titles or details.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Titles</span>
              <p className="text-sm text-text-muted mt-0.5">Viewer sees event titles but no additional details.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Full</span>
              <p className="text-sm text-text-muted mt-0.5">Viewer sees all event details including description, location, and attendees.</p>
            </div>
          </div>

          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Protection Options</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Password protection — require a password before the share link can be accessed</li>
            <li>Expiration date — the link becomes inactive after a set date</li>
            <li>Day limit — limit the booking calendar to a window of 14–365 days ahead</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 pb-2 border-b border-border">Per-Calendar Sharing</h2>
          <p className="text-text-muted mb-3">
            Individual Google and ICS calendars can each have their own sharing level, independent of the
            share link visibility. This lets you share some calendars in full while keeping others private.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Open Settings &gt; Integrations</li>
            <li>For each connected Google calendar or ICS feed, set a sharing level: Private, Busy, Titles, or Full</li>
            <li>Private calendars are never exposed on share links, regardless of the link&apos;s visibility setting</li>
            <li>The effective visibility is the more restrictive of the calendar&apos;s sharing level and the share link level</li>
          </ul>

          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Viewing Shared Calendars</h3>
          <p className="text-text-muted text-sm">
            When a colleague shares their Google or ICS calendar with you, their events appear in your calendar
            view. Shared calendars show up in the calendar sources dropdown with a sharing badge. You can toggle
            them on or off like any other source.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3 pb-2 border-b border-border">ICS Subscription URL</h2>
          <p className="text-text-muted mb-3">
            Every share link also works as an ICS subscription URL. This lets external users subscribe to
            the shared calendar in Apple Calendar, Google Calendar, Outlook, or any other app that supports
            ICS feeds.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Append <code className="bg-surface px-1 rounded text-text">/feed.ics</code> to any share link URL to get the ICS feed</li>
            <li>The feed respects the same visibility level and password settings as the share link</li>
            <li>Events update automatically as the calendar data changes</li>
            <li>Use this to embed herbe.calendar events into external scheduling apps or widgets</li>
          </ul>
        </section>

      </div>
    </>
  )
}
