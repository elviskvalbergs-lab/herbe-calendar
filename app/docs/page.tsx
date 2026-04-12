import Link from 'next/link'

const SECTIONS = [
  {
    href: '/docs/getting-started',
    title: 'Getting Started',
    description: 'What herbe.calendar is, how to sign in, first-time setup, and navigating the calendar.',
  },
  {
    href: '/docs/integrations',
    title: 'Calendar Integrations',
    description: 'ERP, Outlook, Google Calendar, Zoom, Calendly, and ICS feeds — how each integration works and what it supports.',
  },
  {
    href: '/docs/sharing',
    title: 'Calendar Sharing',
    description: 'Share links with configurable visibility, per-calendar sharing levels, and ICS subscription URLs.',
  },
  {
    href: '/docs/booking',
    title: 'Booking & Scheduling',
    description: 'Booking templates, availability windows, enabling booking on share links, and the booker flow.',
  },
  {
    href: '/docs/admin',
    title: 'Admin Configuration',
    description: 'ERP connections, Azure AD, Google Workspace, Zoom, SMTP, members, holidays, and analytics.',
  },
]

export default function DocsIndexPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/cal" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Calendar
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">
          herbe<span className="text-primary">.</span>calendar Documentation
        </h1>
        <p className="text-text-muted">
          Guides for using and configuring herbe.calendar — a unified multi-source calendar for teams.
        </p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block bg-surface border border-border rounded-lg px-6 py-5 hover:border-primary transition-colors"
          >
            <div className="font-semibold mb-1">{section.title}</div>
            <div className="text-sm text-text-muted">{section.description}</div>
          </Link>
        ))}
      </div>
    </>
  )
}
