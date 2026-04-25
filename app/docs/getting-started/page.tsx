import Link from 'next/link'

export default function GettingStartedPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/docs" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Docs
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Getting Started</h1>
      <p className="text-text-muted mb-8">
        An introduction to herbe.calendar and how to get up and running.
      </p>

      <nav className="mb-8 p-4 bg-surface rounded-lg border border-border">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">On this page</p>
        <ul className="space-y-1">
          <li><a href="#what-is" className="text-sm text-primary hover:underline">What is herbe.calendar?</a></li>
          <li><a href="#signing-in" className="text-sm text-primary hover:underline">Signing In</a></li>
          <li><a href="#first-time-setup" className="text-sm text-primary hover:underline">First-Time Setup</a></li>
          <li><a href="#views" className="text-sm text-primary hover:underline">Navigating the Calendar</a></li>
          <li><a href="#selecting-people" className="text-sm text-primary hover:underline">Selecting People to View</a></li>
          <li><a href="#creating-activities" className="text-sm text-primary hover:underline">Creating Activities</a></li>
          <li><a href="#tasks-view" className="text-sm text-primary hover:underline">Tasks Panel & View</a></li>
        </ul>
      </nav>

      <div className="space-y-10">

        <section>
          <h2 id="what-is" className="text-xl font-semibold mb-3 pb-2 border-b border-border">What is herbe.calendar?</h2>
          <p className="text-text-muted mb-3">
            herbe.calendar is a unified, multi-source calendar for teams. It pulls activities and events from
            Standard ERP, Excellent Books, Microsoft Outlook, Google Calendar, and ICS feeds into a single view —
            so you can see your entire team&apos;s schedule without switching between apps.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>View multiple people side-by-side in day, 3-day, 5-day, 7-day, or month views</li>
            <li>Create and edit events across connected calendar systems</li>
            <li>Share calendar views with external parties via secure links</li>
            <li>Let clients book time slots based on your real availability</li>
          </ul>
        </section>

        <section>
          <h2 id="signing-in" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Signing In</h2>
          <p className="text-text-muted mb-3">
            herbe.calendar supports sign-in via Microsoft (Azure AD / Entra ID) and Google (Workspace or personal).
            Your administrator controls which methods are enabled.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Go to <code className="bg-surface px-1 rounded text-text">/login</code> and choose your sign-in method</li>
            <li>Microsoft SSO — logs in with your work Microsoft account</li>
            <li>Google SSO — logs in with your Google Workspace or personal account</li>
            <li>Email magic link — enter your company email and click the link sent to your inbox</li>
          </ul>
          <p className="text-text-muted text-sm mt-3">
            Your account must exist in the system before you can sign in. Contact your administrator if you cannot log in.
          </p>
        </section>

        <section>
          <h2 id="first-time-setup" className="text-xl font-semibold mb-3 pb-2 border-b border-border">First-Time Setup</h2>
          <p className="text-text-muted mb-3">
            Before the calendar is useful, an administrator needs to complete initial configuration.
          </p>
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-lg px-5 py-4">
              <h3 className="font-semibold mb-1">1. Connect data sources</h3>
              <p className="text-sm text-text-muted">
                In Admin &gt; Connections, add ERP connections, Azure AD credentials for Outlook, and/or Google Workspace
                service account details. See the <Link href="/docs/integrations" className="text-primary hover:underline">Integrations</Link> and <Link href="/docs/admin" className="text-primary hover:underline">Admin Configuration</Link> guides.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-5 py-4">
              <h3 className="font-semibold mb-1">2. Add members</h3>
              <p className="text-sm text-text-muted">
                In Admin &gt; Members, sync users from your ERP or Azure AD, or add them manually. Assign roles
                (admin or member) and optionally set a holiday country per person.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-5 py-4">
              <h3 className="font-semibold mb-1">3. Open the calendar</h3>
              <p className="text-sm text-text-muted">
                Navigate to <code className="bg-bg px-1 rounded">/cal</code>. Select people to view and start working.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 id="views" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Navigating the Calendar</h2>

          <h3 id="views-list" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Views</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Day view — one column per selected person for the current day</li>
            <li>3-day view — three days across for each person</li>
            <li>5-day view — a work-week view</li>
            <li>7-day view — full week including weekends</li>
            <li>Month view — full month grid with event pills and multi-day spanning. On desktop, a split view shows the selected day&apos;s agenda alongside the month. On mobile portrait, tap a day to drill into day view</li>
            <li>Tasks view — full-screen unified tasks panel across ERP, Microsoft To Do, and Google Tasks. Available from the rightmost button in the view selector</li>
          </ul>

          <h3 id="month-navigator" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Month Navigator</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>A small month calendar appears in the sidebar for quick date jumping</li>
            <li>Click any date to jump directly to that day in the main view</li>
            <li>Use the arrow buttons to step forward and back by day or week</li>
          </ul>

          <h3 id="calendar-sources-dropdown" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Calendar Sources Dropdown</h3>
          <p className="text-text-muted text-sm">
            The sources dropdown lets you toggle which calendar sources are visible — ERP, Outlook, Google,
            ICS feeds, and shared calendars. Each source has a color indicator. Shared calendars from colleagues
            appear with a sharing badge.
          </p>
        </section>

        <section>
          <h2 id="selecting-people" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Selecting People to View</h2>

          <h3 id="person-selector" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Person Selector</h3>
          <p className="text-text-muted text-sm mb-3">
            Click the people icon in the toolbar to open the person selector. Search by name and add people to the
            current view. Each person gets a color-coded column.
          </p>

          <h3 id="favorites" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Favorites</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Save frequently used person combinations as a favorite group</li>
            <li>Open the Favorites dropdown in the toolbar to switch between saved groups</li>
            <li>Favorites are also used as the basis for creating share links</li>
          </ul>
        </section>

        <section>
          <h2 id="creating-activities" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Creating Activities</h2>
          <p className="text-text-muted mb-3">
            Click any empty time slot in the calendar to open the activity creation form. The form adapts based on
            which calendar source you are creating into.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li><span className="text-text">ERP</span> — creates an activity in Standard ERP or Excellent Books with project, task, and register fields</li>
            <li><span className="text-text">Outlook</span> — creates an Outlook calendar event; optionally adds a Teams meeting link and invites attendees</li>
            <li><span className="text-text">Google</span> — creates a Google Calendar event; optionally adds a Google Meet link</li>
          </ul>
          <p className="text-text-muted text-sm mt-3">
            Click an existing event to view details, edit, or delete it. Drag events to reschedule them.
          </p>
          <p className="text-text-muted text-sm mt-3">
            The destination dropdown at the top of the form lists every connected source (ERP, Outlook, Google) with a colored dot
            next to each option, so you can see at a glance which calendar or list each entry will land in.
          </p>
        </section>

        <section>
          <h2 id="tasks-view" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Tasks Panel &amp; View</h2>
          <p className="text-text-muted mb-3">
            herbe.calendar pulls tasks from ERP, Microsoft To Do (Outlook), and Google Tasks into a single panel
            grouped by source and list. You can use it inline alongside the month grid or open it as a dedicated full-screen view.
          </p>

          <h3 id="tasks-inline" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Inline panel</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>In month view, the right-side panel has a Day / Agenda / Tasks segmented control — pick Tasks to swap the agenda for the tasks panel</li>
            <li>Tabs across the top filter by source (All, ERP, Outlook, Google)</li>
            <li>Tick the checkbox to mark a task done; click to edit; use the action menu to copy a task to an event or to another list</li>
            <li>Click <span className="text-text">+ New task</span> in any source header to create a new task in that source&apos;s default list</li>
          </ul>

          <h3 id="tasks-fullscreen" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Full-screen Tasks view</h3>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Click the <span className="text-text">Tasks</span> button on the far right of the top-bar view selector to open the dedicated Tasks view — calendar grid hidden, tasks panel covers the whole window</li>
            <li>The maximize toggle in the panel header expands the tasks panel from any view, and switches to <span className="text-text">Exit fullscreen</span> while expanded</li>
            <li>Switching to any other view (Day / Month / etc.) automatically returns to the normal split layout</li>
          </ul>
        </section>

      </div>
    </>
  )
}
