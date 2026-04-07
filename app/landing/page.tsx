import Link from 'next/link'

const FEATURES = [
  {
    tag: 'MOD_001',
    title: 'ERP Integration',
    desc: 'Full read/write access to Standard ERP and Excellent Books activities. Multiple ERP connections with separate registers.',
    color: '#9cff93',
    status: 'SYSTEM INTEGRATED',
  },
  {
    tag: 'MOD_002',
    title: 'Outlook & Teams',
    desc: 'View and create Outlook calendar events with Teams meetings. RSVP, attendees, and location support built in.',
    color: '#6264a7',
    status: 'SYNC ACTIVE',
  },
  {
    tag: 'MOD_003',
    title: 'ICS Feeds',
    desc: 'Attach any ICS feed — Apple Calendar, Airbnb, booking systems — to any person. Cached and auto-refreshed.',
    color: '#ff8342',
    status: 'FEEDS ONLINE',
  },
  {
    tag: 'MOD_004',
    title: 'Team Views',
    desc: 'See multiple people side-by-side in day, 3-day, or 5-day views. Save favorites for quick access to common team configurations.',
    color: '#fc77f8',
    status: 'MESH CONNECTED',
  },
  {
    tag: 'MOD_005',
    title: 'Share Links',
    desc: 'Generate anonymous, password-protected calendar links with configurable visibility levels. Perfect for clients and external teams.',
    color: '#00ABCE',
    status: 'ENCRYPTION ACTIVE',
  },
  {
    tag: 'MOD_006',
    title: 'PWA & Mobile',
    desc: 'Install as a native app on any device. Offline-capable with smart caching. Works on phones, tablets, and desktops.',
    color: '#f59e0b',
    status: 'CROSS-PLATFORM',
  },
]

const SOURCES = [
  { name: 'Standard ERP', color: '#9cff93' },
  { name: 'Excellent Books', color: '#9cff93' },
  { name: 'Microsoft Outlook', color: '#6264a7' },
  { name: 'Microsoft Teams', color: '#6264a7' },
  { name: 'Apple Calendar', color: '#a855f7' },
  { name: 'Any ICS Feed', color: '#ff8342' },
]

export default function LandingPage() {
  return (
    <div
      className="min-h-screen text-white"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: '#0e0e0e',
        backgroundImage: 'radial-gradient(rgba(156, 255, 147, 0.04) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0e0e0e]/90 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tighter text-[#9cff93] uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            herbe.calendar
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-white/70 uppercase tracking-widest text-[10px] font-semibold hover:bg-[#9cff93] hover:text-[#0e0e0e] transition-colors duration-150 px-2 py-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Features</a>
            <a href="#integrations" className="text-white/70 uppercase tracking-widest text-[10px] font-semibold hover:bg-[#9cff93] hover:text-[#0e0e0e] transition-colors duration-150 px-2 py-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Integrations</a>
            <a href="#how" className="text-white/70 uppercase tracking-widest text-[10px] font-semibold hover:bg-[#9cff93] hover:text-[#0e0e0e] transition-colors duration-150 px-2 py-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>How It Works</a>
          </div>
          <Link
            href="/login"
            className="bg-[#9cff93] text-[#0e0e0e] px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero */}
        <section className="px-6 py-20 max-w-[1440px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-[#201f1f] px-3 py-1 border-l-2 border-[#9cff93]">
              <span className="text-[#9cff93] text-[10px] uppercase tracking-[0.2em]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>System Status: Online</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              All Your <br />
              Calendars. <br />
              <span className="text-[#9cff93]">One View.</span>
            </h1>

            <p className="text-[#adaaaa] text-lg max-w-md leading-relaxed">
              Stop switching between Standard ERP activities, Outlook meetings, and ICS feeds.
              See your entire team&apos;s schedule in a single, unified view.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="bg-[#9cff93] text-[#0e0e0e] px-8 py-4 text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Open Calendar
              </Link>
              <a
                href="#features"
                className="bg-[#262626] text-white px-8 py-4 text-xs font-bold uppercase tracking-widest hover:bg-[#2c2c2c] transition-all"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Review Systems
              </a>
            </div>
          </div>

          {/* Kinetic Visualization */}
          <div className="relative aspect-square bg-[#131313] p-4 overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #9cff93 0, #9cff93 1px, transparent 1px, transparent 40px)' }} />
            <div className="relative h-full w-full border border-white/10 flex items-center justify-center">
              <div className="w-4/5 h-4/5 border-[16px] border-[#262626] rounded-full flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full border-t-[16px] border-[#9cff93] animate-pulse" />
                <div className="absolute inset-2 rounded-full border-r-[16px] border-[#6264a7] opacity-60" />
                <div className="absolute inset-4 rounded-full border-l-[16px] border-[#ff8342] opacity-40" />
                <div className="text-center">
                  <span className="block text-5xl font-bold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>14:30</span>
                  <span className="block text-[10px] uppercase tracking-widest text-[#9cff93]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Multi-Source Sync</span>
                </div>
              </div>
              <div className="absolute top-10 right-10 bg-[#262626] p-3 border-l-2 border-[#6264a7]">
                <span className="block text-[8px] uppercase text-[#6264a7]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Outlook</span>
                <span className="block text-sm font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Strategy Session</span>
              </div>
              <div className="absolute bottom-20 left-4 bg-[#262626] p-3 border-l-2 border-[#9cff93]">
                <span className="block text-[8px] uppercase text-[#9cff93]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Herbe ERP</span>
                <span className="block text-sm font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Client Onboarding</span>
              </div>
            </div>
          </div>
        </section>

        {/* Problem / Solution */}
        <section className="bg-black py-24">
          <div className="px-6 max-w-[1440px] mx-auto grid md:grid-cols-2 gap-1">
            <div className="bg-[#131313] p-8 border-t-4 border-[#ff8342]">
              <span className="text-[10px] text-[#ff8342] uppercase tracking-widest block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>The Problem</span>
              <h3 className="text-2xl font-bold mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Calendars Everywhere, Visibility Nowhere</h3>
              <p className="text-[#adaaaa] text-sm leading-relaxed">
                Your team uses Standard ERP for activity tracking, Outlook for meetings, ICS feeds for external bookings.
                Each person&apos;s schedule lives in a different system. Checking availability means opening three apps and mentally merging the results.
              </p>
            </div>
            <div className="bg-[#131313] p-8 border-t-4 border-[#9cff93]">
              <span className="text-[10px] text-[#9cff93] uppercase tracking-widest block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>The Solution</span>
              <h3 className="text-2xl font-bold mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>One Calendar, All Sources, Real-Time</h3>
              <p className="text-[#adaaaa] text-sm leading-relaxed">
                herbe.calendar pulls activities from Standard ERP, events from Outlook, and feeds from any ICS source
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
              <div className="h-1 w-24 bg-[#9cff93] mt-2" />
            </div>
            <div className="grid md:grid-cols-3 gap-1">
              {FEATURES.map(f => (
                <div
                  key={f.tag}
                  className="bg-[#131313] p-8 border-t-4 hover:bg-[#201f1f] transition-all"
                  style={{ borderColor: f.color }}
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
                  <p className="text-[#adaaaa] text-sm leading-relaxed mb-8">{f.desc}</p>
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
        <section id="integrations" className="bg-black py-24">
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-12">
                <div>
                  <span className="text-[#6264a7] text-[10px] uppercase tracking-widest mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Connected Systems</span>
                  <h2 className="text-5xl font-black tracking-tighter uppercase leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Zero Latency <br />
                    <span className="text-[#6264a7]">Sync Architecture</span>
                  </h2>
                </div>
                <div className="space-y-6">
                  {SOURCES.map(s => (
                    <div key={s.name} className="flex gap-4 items-center">
                      <div className="w-12 h-12 bg-[#201f1f] flex items-center justify-center shrink-0">
                        <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                      </div>
                      <div>
                        <h4 className="font-bold uppercase text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.name}</h4>
                        <p className="text-[#adaaaa] text-xs">Real-time bidirectional sync</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats panel */}
              <div className="bg-[#131313] p-10 border-l-4 border-[#9cff93] space-y-8">
                <div>
                  <span className="text-[10px] text-[#9cff93] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Cached Response Time</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>&lt;200ms</span>
                </div>
                <div className="h-px bg-white/10" />
                <div>
                  <span className="text-[10px] text-[#6264a7] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>ICS Cache TTL</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>5 min</span>
                </div>
                <div className="h-px bg-white/10" />
                <div>
                  <span className="text-[10px] text-[#ff8342] uppercase tracking-widest block mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Calendar Sources</span>
                  <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Unlimited</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how" className="py-24">
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="mb-16">
              <h2 className="text-4xl font-bold uppercase tracking-tighter italic" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Protocol Sequence</h2>
              <div className="h-1 w-24 bg-[#fc77f8] mt-2" />
            </div>
            <div className="grid md:grid-cols-3 gap-1">
              {[
                { step: '01', title: 'Connect Sources', desc: 'Add your Standard ERP connections, Azure AD credentials, or ICS feed URLs through the self-service admin panel.', color: '#9cff93' },
                { step: '02', title: 'See Everyone Together', desc: 'Select team members to view side-by-side. Day, 3-day, or 5-day views with color-coded calendar sources.', color: '#fc77f8' },
                { step: '03', title: 'Work From One Place', desc: 'Create, edit, and manage activities in any connected system. RSVP to meetings. Share views externally via secure links.', color: '#ff8342' },
              ].map(item => (
                <div key={item.step} className="bg-[#131313] p-8 border-t-4 hover:bg-[#201f1f] transition-all" style={{ borderColor: item.color }}>
                  <span className="text-5xl font-black tracking-tighter block mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif", color: item.color }}>{item.step}</span>
                  <h3 className="text-xl font-bold uppercase mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{item.title}</h3>
                  <p className="text-[#adaaaa] text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="bg-black py-24">
          <div className="px-6 max-w-[1440px] mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <div>
                <span className="text-[#9cff93] text-[10px] uppercase tracking-widest mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>System Capabilities</span>
                <h2 className="text-5xl font-black tracking-tighter uppercase leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Why Teams <br />
                  <span className="text-[#9cff93]">Choose This</span>
                </h2>
              </div>
              <div className="space-y-4">
                {[
                  'No more switching between ERP and email calendar apps',
                  'See your whole team at a glance across all calendar systems',
                  'Create activities in Standard ERP directly from the calendar',
                  'Schedule Outlook meetings with Teams join links',
                  'Share calendar views with clients via secure anonymous links',
                  'Works on any device with native-like PWA experience',
                  'Self-hosted on your Vercel account with full data control',
                  'Multi-company support for multiple ERP instances',
                ].map(item => (
                  <div key={item} className="flex items-start gap-4 group">
                    <div className="w-6 h-6 bg-[#9cff93] flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0e0e0e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-[#adaaaa] group-hover:text-white transition-colors">{item}</span>
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
              <span className="text-[#9cff93] italic">Unify?</span>
            </h2>
            <p className="text-[#adaaaa] text-xl max-w-2xl mx-auto">
              Set up in minutes. Connect your Standard ERP and cloud calendars. See your team like never before.
            </p>
            <Link
              href="/login"
              className="inline-block bg-[#9cff93] text-[#0e0e0e] px-12 py-6 text-sm font-bold uppercase tracking-widest hover:brightness-110 transition-all"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Establish Connection
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black w-full px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-[#9cff93] font-black uppercase tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          herbe.calendar
        </div>
        <div className="text-white/30 uppercase tracking-widest text-[10px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Unified Calendar Systems
        </div>
      </footer>
    </div>
  )
}
