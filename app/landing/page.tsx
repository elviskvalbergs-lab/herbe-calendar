import Link from 'next/link'

function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#1a2332" />
      <text x="12" y="46" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="38" fill="white">.b</text>
      <rect x="10" y="42" width="8" height="8" rx="1.5" fill="#cd4c38" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

const FEATURES = [
  {
    title: 'Standard ERP Integration',
    desc: 'Full read/write access to Standard ERP and Excellent Books activities. Multiple ERP connections per account with separate registers.',
    icon: '🏢',
  },
  {
    title: 'Outlook & Teams',
    desc: 'View and create Outlook calendar events with Teams meetings. RSVP, attendees, and location support built in.',
    icon: '📧',
  },
  {
    title: 'Google Calendar & Meet',
    desc: 'Google Workspace integration with Calendar API and Meet. Service account delegation for full team visibility.',
    icon: '📅',
  },
  {
    title: 'Shared Team Views',
    desc: 'See multiple people side-by-side in day, 3-day, or 5-day views. Save favorites for quick access to common team configurations.',
    icon: '👥',
  },
  {
    title: 'ICS Calendar Feeds',
    desc: 'Attach any ICS feed (Apple Calendar, Airbnb, booking systems) to any person. Works alongside ERP and cloud calendars.',
    icon: '🔗',
  },
  {
    title: 'Share Links',
    desc: 'Generate anonymous, password-protected calendar links with configurable visibility levels. Perfect for clients and external teams.',
    icon: '🔒',
  },
  {
    title: 'Multi-Company Support',
    desc: 'Multiple ERP connections per account with separate activity types, projects, and customers. Each connection fully isolated.',
    icon: '🌐',
  },
  {
    title: 'PWA & Mobile',
    desc: 'Install as a native app on any device. Offline-capable with smart caching. Works on phones, tablets, and desktops.',
    icon: '📱',
  },
  {
    title: 'Admin Panel',
    desc: 'Self-service admin for user management, connection setup, usage analytics, and API tokens for BI tool integration.',
    icon: '⚙',
  },
]

const SOURCES = [
  { name: 'Standard ERP', color: '#22c55e' },
  { name: 'Excellent Books', color: '#22c55e' },
  { name: 'Microsoft Outlook', color: '#6264a7' },
  { name: 'Microsoft Teams', color: '#6264a7' },
  { name: 'Google Calendar', color: '#4285f4' },
  { name: 'Google Meet', color: '#4285f4' },
  { name: 'Apple Calendar (ICS)', color: '#a855f7' },
  { name: 'Any ICS Feed', color: '#a855f7' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-bold text-lg">herbe<span className="text-[#cd4c38]">.</span>calendar</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">Features</a>
            <a href="#sources" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">Integrations</a>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#cd4c38] text-white text-sm font-bold rounded-lg hover:bg-[#b84332] transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-24">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 mb-6">
            <CalendarIcon />
            Unified calendar for ERP and cloud
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight mb-6">
            All your calendars.
            <br />
            <span className="text-[#cd4c38]">One view.</span>
          </h1>
          <p className="text-lg lg:text-xl text-gray-400 leading-relaxed mb-8 max-w-2xl">
            Stop switching between Standard ERP activities, Outlook meetings, and Google Calendar.
            See your entire team&apos;s schedule in a single, shared view with full create and edit capabilities.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/login"
              className="px-6 py-3 bg-[#cd4c38] text-white font-bold rounded-xl hover:bg-[#b84332] transition-colors text-lg"
            >
              Open Calendar
            </Link>
            <a
              href="#features"
              className="px-6 py-3 border border-white/10 text-gray-300 font-bold rounded-xl hover:bg-white/5 transition-colors text-lg"
            >
              See Features
            </a>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
            <div>
              <h2 className="text-sm font-bold text-[#cd4c38] uppercase tracking-wider mb-4">The Problem</h2>
              <h3 className="text-2xl lg:text-3xl font-bold mb-4">Calendars everywhere, visibility nowhere</h3>
              <p className="text-gray-400 leading-relaxed">
                Your team uses Standard ERP for activity tracking, Outlook for meetings, maybe Google Calendar for some departments.
                Each person&apos;s schedule lives in a different system. Checking who&apos;s available means opening three apps and mentally merging the results.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4">The Solution</h2>
              <h3 className="text-2xl lg:text-3xl font-bold mb-4">One calendar, all sources, real-time</h3>
              <p className="text-gray-400 leading-relaxed">
                herbe.calendar pulls activities from Standard ERP, events from Outlook and Google Calendar, and feeds from any ICS source
                into a single multi-person view. Create, edit, and manage events across all systems from one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-4 text-center">Features</h2>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            Everything you need to manage calendars across Standard ERP, Outlook, and Google in one unified interface.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="sources" className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-4 text-center">Integrations</h2>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            Connect all your calendar sources. Each one gets full read/write support with real-time sync.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {SOURCES.map(s => (
              <div key={s.name} className="flex items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-sm font-medium">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-12 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Connect your sources', desc: 'Add your Standard ERP connections, Azure AD, or Google Workspace through the self-service admin panel.' },
              { step: '2', title: 'See everyone together', desc: 'Select team members to view side-by-side. Day, 3-day, or 5-day views with color-coded sources.' },
              { step: '3', title: 'Work from one place', desc: 'Create, edit, and manage activities in any connected system. RSVP to meetings. Share views externally.' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#cd4c38]/20 text-[#cd4c38] font-extrabold text-lg flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits checklist */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-8 text-center">Why teams choose herbe.calendar</h2>
            <div className="space-y-4">
              {[
                'No more switching between ERP and email calendar apps',
                'See your whole team at a glance — across all calendar systems',
                'Create activities in Standard ERP directly from the calendar',
                'Schedule Outlook/Google meetings with Teams or Meet links',
                'Share calendar views with clients via secure, anonymous links',
                'Works on any device — install as a PWA for native-like experience',
                'Self-hosted on your own Vercel account with full data control',
                'Multi-company support for organizations with multiple ERP instances',
              ].map(item => (
                <div key={item} className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-0.5 shrink-0"><CheckIcon /></span>
                  <span className="text-gray-300">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24 text-center">
          <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">Ready to unify your calendars?</h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            Set up in minutes. Connect your Standard ERP and cloud calendars. See your team like never before.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-4 bg-[#cd4c38] text-white font-bold rounded-xl hover:bg-[#b84332] transition-colors text-lg"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="text-sm text-gray-500">herbe<span className="text-[#cd4c38]">.</span>calendar</span>
          </div>
          <p className="text-xs text-gray-600">Built for teams that use Standard ERP, Outlook, and Google Calendar</p>
        </div>
      </footer>
    </div>
  )
}
