'use client'
import Link from 'next/link'

const PRIMARY = '#cd4c38'
const BG = '#231f20'
const SURFACE = '#2d2829'
const SURFACE_HIGH = '#3a3435'
const MUTED = '#6b6467'
const CYAN = '#00ABCE'
const TEAL = '#4db89a'
const OUTLOOK = '#6264a7'
const ORANGE = '#e8923a'

const FEATURES = [
  {
    tag: 'MOD_001',
    title: 'ERP Integration',
    desc: 'Full read/write access to Standard ERP and Excellent Books activities. Multiple ERP connections with separate registers.',
    color: TEAL,
    status: 'SYSTEM INTEGRATED',
  },
  {
    tag: 'MOD_002',
    title: 'Outlook & Teams',
    desc: 'View and create Outlook calendar events with Teams meetings. RSVP, attendees, and location support built in.',
    color: OUTLOOK,
    status: 'SYNC ACTIVE',
  },
  {
    tag: 'MOD_003',
    title: 'Google Calendar & Meet',
    desc: 'Google Workspace integration with Calendar API and Meet. Service account delegation for full team visibility across your domain.',
    color: '#4285f4',
    status: 'WORKSPACE LINKED',
  },
  {
    tag: 'MOD_004',
    title: 'Team Views',
    desc: 'See multiple people side-by-side in day, 3-day, or 5-day views. Save favorites for quick access to common team configurations.',
    color: CYAN,
    status: 'MESH CONNECTED',
  },
  {
    tag: 'MOD_005',
    title: 'Share & Book',
    desc: 'Share calendar views via secure links with configurable visibility. Let clients book time slots based on real availability across all your calendar sources — with templates, confirmations, and cancel/reschedule.',
    color: PRIMARY,
    status: 'BOOKING LIVE',
  },
  {
    tag: 'MOD_006',
    title: 'ICS Feeds',
    desc: 'Attach any ICS feed — Airbnb, booking systems, external calendars — to any person. Cached with 5-minute TTL and manual sync.',
    color: ORANGE,
    status: 'FEEDS ONLINE',
  },
]

const GOOGLE = '#4285f4'

const SOURCES = [
  { name: 'Standard ERP', color: TEAL },
  { name: 'Excellent Books', color: TEAL },
  { name: 'Microsoft Outlook', color: OUTLOOK },
  { name: 'Microsoft Teams', color: OUTLOOK },
  { name: 'Google Calendar', color: GOOGLE },
  { name: 'Google Meet', color: GOOGLE },
  { name: 'Any ICS Feed', color: ORANGE },
]

export default function LandingPage() {
  return (
    <div
      className="min-h-screen text-white"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: BG,
        backgroundImage: `radial-gradient(${PRIMARY}0a 1px, transparent 0)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm" style={{ background: `${BG}e6` }}>
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            herbe<span style={{ color: PRIMARY }}>.</span>calendar
          </div>
          <div className="hidden md:flex items-center gap-8">
            {['Features', 'Integrations', 'How It Works'].map(label => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-white/70 uppercase tracking-widest text-[10px] font-semibold transition-colors duration-150 px-2 py-1"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onMouseEnter={e => { e.currentTarget.style.background = PRIMARY; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' }}
              >
                {label}
              </a>
            ))}
          </div>
          <Link
            href="/cal"
            className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 transition-all"
            style={{ fontFamily: "'Space Grotesk', sans-serif", background: PRIMARY }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero */}
        <section className="px-6 py-20 max-w-[1440px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-l-2" style={{ background: SURFACE, borderColor: PRIMARY }}>
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY }}>System Status: Online</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              All Your <br />
              Calendars. <br />
              <span style={{ color: PRIMARY }}>One View.</span>
            </h1>

            <p className="text-lg max-w-md leading-relaxed" style={{ color: MUTED }}>
              Stop switching between Standard ERP activities, Outlook meetings, and Google Calendar.
              See your entire team&apos;s schedule in a single, unified view.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/cal"
                className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 transition-all"
                style={{ fontFamily: "'Space Grotesk', sans-serif", background: PRIMARY }}
              >
                Open Calendar
              </Link>
              <a
                href="#features"
                className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 transition-all"
                style={{ fontFamily: "'Space Grotesk', sans-serif", background: SURFACE_HIGH }}
              >
                Review Systems
              </a>
            </div>
          </div>

          {/* Kinetic Visualization */}
          <div className="relative aspect-square p-4 overflow-hidden" style={{ background: SURFACE }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `repeating-linear-gradient(0deg, ${PRIMARY} 0, ${PRIMARY} 1px, transparent 1px, transparent 40px)` }} />
            <div className="relative h-full w-full border flex items-center justify-center" style={{ borderColor: SURFACE_HIGH }}>
              <div className="w-4/5 h-4/5 rounded-full flex items-center justify-center relative" style={{ borderWidth: 16, borderColor: SURFACE_HIGH }}>
                <div className="absolute inset-0 rounded-full animate-pulse" style={{ borderTopWidth: 16, borderColor: PRIMARY }} />
                <div className="absolute inset-2 rounded-full opacity-60" style={{ borderRightWidth: 16, borderColor: OUTLOOK }} />
                <div className="absolute inset-4 rounded-full opacity-40" style={{ borderLeftWidth: 16, borderColor: CYAN }} />
                <div className="text-center">
                  <span className="block text-5xl font-bold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>14:30</span>
                  <span className="block text-[10px] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY }}>Multi-Source Sync</span>
                </div>
              </div>
              <div className="absolute top-10 right-10 p-3 border-l-2" style={{ background: SURFACE_HIGH, borderColor: OUTLOOK }}>
                <span className="block text-[8px] uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif", color: OUTLOOK }}>Outlook</span>
                <span className="block text-sm font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Strategy Session</span>
              </div>
              <div className="absolute bottom-20 left-4 p-3 border-l-2" style={{ background: SURFACE_HIGH, borderColor: TEAL }}>
                <span className="block text-[8px] uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEAL }}>Herbe ERP</span>
                <span className="block text-sm font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Client Onboarding</span>
              </div>
            </div>
          </div>
        </section>

        {/* Problem / Solution */}
        <section style={{ background: '#1a1718' }} className="py-24">
          <div className="px-6 max-w-[1440px] mx-auto grid md:grid-cols-2 gap-1">
            <div className="p-8 border-t-4" style={{ background: SURFACE, borderColor: ORANGE }}>
              <span className="text-[10px] uppercase tracking-widest block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif", color: ORANGE }}>The Problem</span>
              <h3 className="text-2xl font-bold mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Calendars Everywhere, Visibility Nowhere</h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                Your team uses Standard ERP for activity tracking, Outlook for meetings, maybe Google Calendar for some departments.
                Each person&apos;s schedule lives in a different system. Checking availability means opening three apps and mentally merging the results.
              </p>
            </div>
            <div className="p-8 border-t-4" style={{ background: SURFACE, borderColor: PRIMARY }}>
              <span className="text-[10px] uppercase tracking-widest block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY }}>The Solution</span>
              <h3 className="text-2xl font-bold mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>One Calendar, All Sources, Real-Time</h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                herbe.calendar pulls activities from Standard ERP, events from Outlook and Google Calendar, and feeds from any ICS source
                into a single multi-person view. Create, edit, and manage events across all systems from one place.
              </p>
            </div>
          </div>
        </section>

        {/* Feature Modules */}
        <section id="features" className="py-24">
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="mb-16">
              <h2 className="text-4xl font-bold uppercase tracking-tighter italic" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Data Modules</h2>
              <div className="h-1 w-24 mt-2" style={{ background: PRIMARY }} />
            </div>
            <div className="grid md:grid-cols-3 gap-1">
              {FEATURES.map(f => (
                <div
                  key={f.tag}
                  className="p-8 border-t-4 transition-all cursor-default"
                  style={{ background: SURFACE, borderColor: f.color }}
                  onMouseEnter={e => { e.currentTarget.style.background = SURFACE_HIGH }}
                  onMouseLeave={e => { e.currentTarget.style.background = SURFACE }}
                >
                  <div className="flex justify-between items-start mb-12">
                    <div className="w-10 h-10 flex items-center justify-center" style={{ color: f.color }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <span className="text-[10px] tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", color: f.color, opacity: 0.5 }}>{f.tag}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed mb-8" style={{ color: MUTED }}>{f.desc}</p>
                  <div className="flex items-center gap-2 text-[10px] tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", color: f.color }}>
                    <span className="w-2 h-2" style={{ background: f.color }} />
                    {f.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="py-24" style={{ background: '#1a1718' }}>
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-12">
                <div>
                  <span className="text-[10px] uppercase tracking-widest mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif", color: CYAN }}>Connected Systems</span>
                  <h2 className="text-5xl font-black tracking-tighter uppercase leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Zero Latency <br />
                    <span style={{ color: CYAN }}>Sync Architecture</span>
                  </h2>
                </div>
                <div className="space-y-6">
                  {SOURCES.map(s => (
                    <div key={s.name} className="flex gap-4 items-center">
                      <div className="w-12 h-12 flex items-center justify-center shrink-0" style={{ background: SURFACE }}>
                        <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                      </div>
                      <div>
                        <h4 className="font-bold uppercase text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.name}</h4>
                        <p className="text-xs" style={{ color: MUTED }}>Real-time bidirectional sync</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats panel */}
              <div className="p-10 border-l-4 space-y-8" style={{ background: SURFACE, borderColor: PRIMARY }}>
                <div>
                  <span className="text-[10px] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY }}>Cached Response Time</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>&lt;200ms</span>
                </div>
                <div className="h-px" style={{ background: SURFACE_HIGH }} />
                <div>
                  <span className="text-[10px] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: CYAN }}>ICS Cache TTL</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>5 min</span>
                </div>
                <div className="h-px" style={{ background: SURFACE_HIGH }} />
                <div>
                  <span className="text-[10px] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: ORANGE }}>Calendar Sources</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Unlimited</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24">
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="mb-16">
              <h2 className="text-4xl font-bold uppercase tracking-tighter italic" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Protocol Sequence</h2>
              <div className="h-1 w-24 mt-2" style={{ background: CYAN }} />
            </div>
            <div className="grid md:grid-cols-3 gap-1">
              {[
                { step: '01', title: 'Connect Sources', desc: 'Add your Standard ERP connections, Azure AD credentials, or ICS feed URLs through the self-service admin panel.', color: PRIMARY },
                { step: '02', title: 'See Everyone Together', desc: 'Select team members to view side-by-side. Day, 3-day, or 5-day views with color-coded calendar sources.', color: CYAN },
                { step: '03', title: 'Work From One Place', desc: 'Create, edit, and manage activities in any connected system. RSVP to meetings. Share views externally via secure links.', color: TEAL },
              ].map(item => (
                <div
                  key={item.step}
                  className="p-8 border-t-4 transition-all"
                  style={{ background: SURFACE, borderColor: item.color }}
                  onMouseEnter={e => { e.currentTarget.style.background = SURFACE_HIGH }}
                  onMouseLeave={e => { e.currentTarget.style.background = SURFACE }}
                >
                  <span className="text-5xl font-black tracking-tighter block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif", color: item.color }}>{item.step}</span>
                  <h3 className="text-xl font-bold uppercase mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-24" style={{ background: '#1a1718' }}>
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <div>
                <span className="text-[10px] uppercase tracking-widest mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY }}>System Capabilities</span>
                <h2 className="text-5xl font-black tracking-tighter uppercase leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Why Teams <br />
                  <span style={{ color: PRIMARY }}>Choose This</span>
                </h2>
              </div>
              <div className="space-y-4">
                {[
                  'No more switching between ERP and email calendar apps',
                  'See your whole team at a glance across all calendar systems',
                  'Create activities in Standard ERP directly from the calendar',
                  'Schedule Outlook/Google meetings with Teams or Meet links',
                  'Let clients self-book meetings based on real-time availability',
                  'Works on any device with native-like PWA experience',
                  'Self-hosted on your Vercel account with full data control',
                  'Multi-company support for multiple ERP instances',
                ].map(item => (
                  <div key={item} className="flex items-start gap-4 group">
                    <div className="w-6 h-6 flex items-center justify-center shrink-0 mt-0.5" style={{ background: PRIMARY }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="group-hover:text-white transition-colors" style={{ color: MUTED }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 text-center px-6">
          <div className="max-w-4xl mx-auto space-y-12">
            <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Ready to <br />
              <span className="italic" style={{ color: PRIMARY }}>Unify?</span>
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: MUTED }}>
              Set up in minutes. Connect your Standard ERP and cloud calendars. See your team like never before.
            </p>
            <Link
              href="/cal"
              className="inline-block px-12 py-6 text-sm font-bold uppercase tracking-widest text-white hover:brightness-110 transition-all"
              style={{ fontFamily: "'Space Grotesk', sans-serif", background: PRIMARY }}
            >
              Establish Connection
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4" style={{ background: '#1a1718' }}>
        <div className="font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          herbe<span style={{ color: PRIMARY }}>.</span>calendar
        </div>
        <div className="text-white/30 uppercase tracking-widest text-[10px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Unified Calendar Systems
        </div>
      </footer>
    </div>
  )
}
