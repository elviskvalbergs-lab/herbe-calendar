'use client'

import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { TeamViewScreenshot, BookingScreenshot } from './MockScreenshots'

const BOOKING_URL =
  'https://herbe-calendar.vercel.app/book/a82a99e9d6abc23ab17debb089dab542bc3550c49e9189b42b022921e621dea0'

const SOURCES = {
  hbr: 'https://hbr.org/2022/08/how-much-time-and-energy-do-we-waste-toggling-between-applications',
  ringCentral: 'https://netstorage.ringcentral.com/documents/connected_workplace.pdf',
  asana: 'https://asana.com/resources/context-switching',
}

const FEATURES = [
  {
    icon: '⟷',
    color: '#CD4C38',
    bg: '#CD4C3818',
    title: 'ERP Read/Write',
    desc: 'Full bidirectional sync with Standard ERP and Excellent Books. Create, edit, and reschedule activities directly.',
  },
  {
    icon: '👥',
    color: '#134A40',
    bg: '#134A4018',
    title: 'Team Views',
    desc: 'See multiple people side-by-side in day, 3-day, 5-day, week, or month views. Favorites and quick switching.',
  },
  {
    icon: '🔗',
    color: '#0090C0',
    bg: '#00AEE718',
    title: 'Multi-Source Sync',
    desc: 'ERP, Outlook, Google (personal + team), Zoom, Calendly, and any ICS feed — all loading independently.',
  },
  {
    icon: '📅',
    color: '#6B8E3D',
    bg: '#6B8E3D18',
    title: 'Smart Booking',
    desc: 'Let clients self-book via secure links. Buffer time, day limits, Teams/Meet/Zoom links auto-generated.',
  },
  {
    icon: '🔒',
    color: '#3F56A6',
    bg: '#3F56A618',
    title: 'Calendar Sharing',
    desc: 'Share calendars with colleagues at four visibility levels: Private, Busy-only, Titles, or Full details.',
  },
  {
    icon: '✓',
    color: '#2A8F94',
    bg: '#2A8F9418',
    title: 'Unified Tasks',
    desc: 'Tasks from ERP, Microsoft To Do, and Google Tasks in one panel. Tick done, copy to events, create inline.',
  },
]

type IntegrationDetail = {
  name: string
  type: string
  bg: string
  sync: string
  calendars: boolean
  tasks: 'yes' | 'no' | 'partial'
  tasksNote?: string
  parallel: string
  detail: string
  capabilities: string[]
}

const INTEGRATIONS: IntegrationDetail[] = [
  {
    name: 'Standard ERP',
    type: 'Read/Write',
    bg: '#CD4C38',
    sync: 'Two-way · real-time',
    calendars: true,
    tasks: 'yes',
    parallel: 'Multiple ERP databases side-by-side',
    detail:
      'Full bidirectional sync with Standard ERP. Activities and to-do tasks live alongside every other source.',
    capabilities: [
      'Create, edit, and reschedule activities directly from any calendar view',
      'Connect multiple ERP databases — each gets its own register and color',
      'Tasks (TodoFlag) appear in the unified tasks panel and the calendar tasks row',
      'Customer/contact lookup, project assignment, activity types preserved',
      'Drag-and-drop rescheduling writes back to ERP',
    ],
  },
  {
    name: 'Outlook',
    type: 'Read/Write',
    bg: '#3F56A6',
    sync: 'Two-way · real-time',
    calendars: true,
    tasks: 'yes',
    tasksNote: 'Microsoft To Do',
    parallel: 'Pairs with any other source',
    detail:
      'Microsoft Graph integration covering calendars and Microsoft To Do. One Azure AD app covers your whole tenant.',
    capabilities: [
      'Two-way: read and create events, RSVP, attendees, locations, drag to reschedule',
      'Microsoft To Do tasks read and write — pulled into the unified tasks panel',
      'Tenant-wide Azure AD auth — no per-user setup once admin consents',
      'Teams online meetings can be auto-attached when creating events',
    ],
  },
  {
    name: 'Google',
    type: 'OAuth + Workspace',
    bg: '#6B8E3D',
    sync: 'Two modes',
    calendars: true,
    tasks: 'partial',
    tasksNote: 'Personal OAuth only',
    parallel: 'Both modes can run together',
    detail:
      'Two parallel modes: per-user OAuth for personal calendars and Workspace domain-wide delegation for full team visibility.',
    capabilities: [
      'Personal OAuth: each user connects their account, picks calendars, two-way for Calendar + Google Tasks',
      'Workspace delegation: one service account reads every user\'s calendars across the org (calendar only)',
      'Both modes can coexist — events deduplicated by Google ID',
      'Google Meet links auto-generated when booking through a Google target',
      'Calendar sharing with colleagues at four visibility levels',
    ],
  },
  {
    name: 'Zoom',
    type: 'Meeting Links',
    bg: '#2A8F94',
    sync: 'One-way (write)',
    calendars: false,
    tasks: 'no',
    parallel: 'One Zoom account per herbe account',
    detail:
      'Generate Zoom meetings on-demand for events and bookings. Account-level credentials, not per user.',
    capabilities: [
      'Auto-creates a Zoom meeting and embeds the join URL on event creation',
      'Available as a video target on any calendar source (ERP, Outlook, Google)',
      'OAuth account credentials grant — works for the whole organization',
      'One Zoom account per herbe.calendar account — not multi-instance',
    ],
  },
  {
    name: 'Calendly',
    type: 'Webhooks',
    bg: '#E08A2B',
    sync: 'One-way (read)',
    calendars: true,
    tasks: 'no',
    parallel: 'One Calendly user per herbe account',
    detail:
      'Inbound bookings from Calendly surface alongside your other calendars in real-time via webhooks.',
    capabilities: [
      'Webhook-driven: new and cancelled bookings appear within seconds',
      'HMAC-signed webhooks — verified at the edge',
      'Read-only inside herbe — manage bookings in Calendly, see them in the team view',
      'One Calendly user per herbe account, but pairs with every other source in parallel',
    ],
  },
  {
    name: 'Teams',
    type: 'Video + Calendar',
    bg: '#5B5FC7',
    sync: 'Linked to Outlook',
    calendars: true,
    tasks: 'no',
    parallel: 'Bundled with Outlook',
    detail:
      'Teams meetings are generated through the Outlook connection — no separate setup or auth.',
    capabilities: [
      'Teams meeting links auto-attached on events created through Outlook',
      'Available as a video target in booking templates',
      'Uses the same Azure AD app credentials as Outlook',
    ],
  },
  {
    name: 'Google Meet',
    type: 'Video Links',
    bg: '#00897B',
    sync: 'Bundled with Google',
    calendars: false,
    tasks: 'no',
    parallel: 'Bundled with Google',
    detail:
      'Meet links are generated through the Google Calendar connection — no separate setup.',
    capabilities: [
      'Meet links extracted from Google events, attached as video target on creation',
      'Available as a video option in booking templates',
      'Works in both personal-OAuth and Workspace modes',
    ],
  },
  {
    name: 'ICS Feeds',
    type: 'Any Source',
    bg: '#7A4E9C',
    sync: 'One-way (read)',
    calendars: true,
    tasks: 'no',
    parallel: 'Multiple feeds per person',
    detail:
      'Drop in any iCalendar URL — Airbnb, booking systems, school schedules, anything that publishes ICS.',
    capabilities: [
      'Read-only — events from the feed appear in the calendar',
      'Multiple feeds per person, each with its own color and label',
      'Cached with 5-minute TTL; manual refresh available',
      'No auth needed — works with any public ICS URL',
      'Personal ICS calendars can be shared with colleagues at controlled visibility',
    ],
  },
  {
    name: 'Excellent Books',
    type: 'Read/Write',
    bg: '#A8446E',
    sync: 'Two-way · real-time',
    calendars: true,
    tasks: 'yes',
    parallel: 'Pairs with any other source',
    detail:
      'Same engine as Standard ERP — connect Excellent Books activities and tasks with full read/write access.',
    capabilities: [
      'Same capabilities as Standard ERP — read/write events and tasks, multi-instance, color-coded',
      'Use side-by-side with other ERP databases or any other source',
    ],
  },
  {
    name: 'Holidays',
    type: 'Per-Country',
    bg: '#4A4E53',
    sync: 'One-way (read)',
    calendars: true,
    tasks: 'no',
    parallel: 'Multiple countries per account',
    detail:
      'Public holiday overlays per person, sourced from openholidaysapi.org and cached server-side.',
    capabilities: [
      'Each person can have their own country (e.g. team in LV + remote contractor in DE)',
      'Holidays block booking slots by default — templates can opt to allow them',
      'Read-only overlay; visual banner on holiday dates',
      'Cached server-side per country/year',
    ],
  },
]

const CHAOS_APPS = [
  { name: 'Standard ERP', sub: 'Activities & tasks', bg: '#CD4C38' },
  { name: 'Outlook + Teams', sub: 'Meetings & calls', bg: '#3F56A6' },
  { name: 'Google Calendar', sub: 'Personal & team', bg: '#6B8E3D' },
  { name: 'Zoom', sub: 'Video meetings', bg: '#2A8F94' },
  { name: 'Calendly', sub: 'External bookings', bg: '#E08A2B' },
]

const DEPLOYMENT = [
  {
    title: 'Self-Hosted',
    desc: 'Deploy on your own Vercel account. Full control over data and infrastructure.',
    accent: '#134A40',
  },
  {
    title: 'PWA-Ready',
    desc: 'Works on any device with native-like experience. Install to home screen on mobile.',
    accent: '#00AEE7',
  },
  {
    title: 'Multi-Company',
    desc: 'Connect multiple ERP instances with separate registers and color-coded sources.',
    accent: '#CD4C38',
  },
]

const STATS = [
  { num: '1,200×', label: 'App toggles per day per employee', source: SOURCES.hbr, sourceLabel: 'HBR, 2022' },
  { num: '4h', label: 'Lost per week per person re-orienting', source: SOURCES.hbr, sourceLabel: 'HBR, 2022' },
  {
    num: '32',
    label: 'Work days lost per year navigating apps',
    source: SOURCES.ringCentral,
    sourceLabel: 'RingCentral',
  },
  { num: '9', label: 'Apps switched between daily on average', source: SOURCES.asana, sourceLabel: 'Asana, 2022' },
]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [openInt, setOpenInt] = useState<IntegrationDetail | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!openInt) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenInt(null)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [openInt])

  return (
    <div className="herbe-landing">
      <style jsx global>{`
        .herbe-landing { font-family: var(--font-sans); background: #fff; color: var(--burti-black); overflow-x: hidden; }
        .herbe-landing :where(h1, h2, h3, p, ul, li) { margin: 0; padding: 0; text-transform: none; }
        .herbe-landing ul { list-style: none; }
        html { scroll-behavior: smooth; }

        .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 16px 40px; display: flex; align-items: center; gap: 32px; transition: background 0.3s, box-shadow 0.3s; background: transparent; }
        .nav.scrolled { background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); box-shadow: 0 1px 8px rgba(19,74,64,0.08); }
        .nav-brand { font-size: 20px; font-weight: 700; color: var(--burti-black); letter-spacing: -0.01em; text-decoration: none; }
        .nav-brand .dot { color: var(--burti-rowanberry); }
        .nav-links { display: flex; gap: 28px; margin-left: auto; align-items: center; }
        .nav-links a { font-size: 14px; font-weight: 500; color: var(--burti-black); text-decoration: none; opacity: 0.7; transition: opacity 0.2s; }
        .nav-links a:hover { opacity: 1; }
        .nav-signin { font-size: 13px !important; }
        .nav-cta { background: var(--burti-forest); color: #fff !important; padding: 8px 20px; border-radius: 8px; font-weight: 600; opacity: 1 !important; font-size: 13px !important; }
        .nav-cta:hover { background: var(--burti-forest-dark); }

        .hero { min-height: 100vh; display: flex; align-items: center; padding: 120px 60px 80px; position: relative; overflow: hidden; }
        .hero-bg { position: absolute; inset: 0; background: linear-gradient(135deg, #F7F9F8 0%, #E8F0EE 50%, #D4E1DD 100%); }
        .hero-bg::after { content: ''; position: absolute; right: -10%; top: -20%; width: 70%; height: 140%; background: radial-gradient(ellipse at center, rgba(0,174,231,0.06) 0%, transparent 70%); }
        .hero-content { position: relative; z-index: 2; max-width: 1320px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 1fr 1.1fr; gap: 60px; align-items: center; }
        .hero-text { max-width: 560px; }
        .hero-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--burti-forest); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .hero-eyebrow::before { content: ''; width: 24px; height: 2px; background: var(--burti-rowanberry); }
        .hero h1 { font-weight: 800; font-size: clamp(36px, 4.5vw, 56px); line-height: 1.08; color: var(--burti-black); margin-bottom: 20px; letter-spacing: -0.02em; }
        .hero h1 .accent { color: var(--burti-forest); }
        .hero-sub { font-size: 18px; line-height: 1.6; color: var(--burti-gray); margin-bottom: 32px; max-width: 480px; }
        .hero-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: var(--burti-forest); color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; transition: all 0.2s; border: none; cursor: pointer; }
        .btn-primary:hover { background: var(--burti-forest-dark); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(19,74,64,0.2); }
        .btn-secondary { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: var(--burti-forest); padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; border: 1.5px solid var(--burti-gray-light); transition: all 0.2s; cursor: pointer; }
        .btn-secondary:hover { border-color: var(--burti-forest); background: var(--burti-forest); color: #fff; }
        .hero-sources { display: flex; gap: 10px; margin-top: 32px; align-items: center; flex-wrap: wrap; }
        .hero-sources span.label { font-size: 12px; color: var(--burti-gray); }
        .source-pill { font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 6px; background: #fff; border: 1px solid var(--burti-gray-light); color: var(--burti-gray); }

        .pain { padding: 100px 60px; background: var(--burti-forest); color: #fff; position: relative; overflow: hidden; }
        .pain::before { content: ''; position: absolute; right: -5%; top: -30%; width: 40%; height: 160%; background: radial-gradient(ellipse, rgba(0,174,231,0.08), transparent 70%); }
        .pain-inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 2; }
        .pain-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .pain-eyebrow { font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--burti-high-sky); margin-bottom: 12px; }
        .pain h2 { font-size: clamp(28px, 3vw, 40px); font-weight: 800; line-height: 1.12; margin-bottom: 20px; letter-spacing: -0.01em; }
        .pain-desc { font-size: 16px; line-height: 1.7; color: rgba(255,255,255,0.75); margin-bottom: 28px; }
        .pain-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .pain-stat { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; }
        .pain-stat-num { font-size: 36px; font-weight: 800; color: var(--burti-rowanberry); line-height: 1; }
        .pain-stat-label { font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 6px; }
        .pain-stat-label a { color: rgba(255,255,255,0.4); font-size: 9px; display: block; margin-top: 3px; text-decoration: none; }
        .pain-stat-label a:hover { color: rgba(255,255,255,0.8); text-decoration: underline; }
        .pain-chaos { display: flex; flex-direction: column; gap: 12px; }
        .chaos-app { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 18px; }
        .chaos-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .chaos-label { font-size: 14px; font-weight: 600; }
        .chaos-sub { font-size: 11px; color: rgba(255,255,255,0.5); }
        .chaos-tag { margin-left: auto; font-size: 9px; color: rgba(255,255,255,0.3); font-weight: 500; padding: 3px 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; }
        .chaos-arrow { font-size: 10px; color: rgba(255,255,255,0.25); text-align: center; }

        .solution { padding: 100px 60px; background: #fff; }
        .solution-inner { max-width: 1200px; margin: 0 auto; }
        .section-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--burti-forest); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .section-label::before { content: ''; width: 20px; height: 2px; background: var(--burti-rowanberry); }
        .section-label.center { justify-content: center; }
        .solution h2 { font-size: clamp(28px, 3vw, 40px); font-weight: 800; line-height: 1.12; color: var(--burti-black); margin-bottom: 16px; letter-spacing: -0.01em; }
        .solution-sub { font-size: 17px; color: var(--burti-gray); line-height: 1.6; max-width: 600px; margin-bottom: 48px; }
        .solution-screenshot { margin: 0 auto 60px; max-width: 960px; }
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px; }
        .feature-card { background: var(--burti-offwhite); border-radius: 14px; padding: 32px 28px; transition: all 0.25s; border: 1px solid transparent; }
        .feature-card:hover { border-color: var(--burti-gray-light); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(19,74,64,0.06); }
        .feature-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 20px; }
        .feature-card h3 { font-size: 17px; font-weight: 700; color: var(--burti-black); margin-bottom: 8px; }
        .feature-card p { font-size: 14px; line-height: 1.6; color: var(--burti-gray); }

        .integrations { padding: 80px 60px; background: var(--burti-offwhite); }
        .integrations-inner { max-width: 1200px; margin: 0 auto; text-align: center; }
        .integrations h2 { font-size: clamp(24px, 2.5vw, 36px); font-weight: 800; margin-bottom: 12px; }
        .integrations-sub { font-size: 16px; color: var(--burti-gray); margin-bottom: 48px; }
        .int-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; max-width: 800px; margin: 0 auto; }
        .int-card { background: #fff; border-radius: 12px; padding: 24px 16px; text-align: center; border: 1px solid var(--burti-gray-light); transition: all 0.2s; cursor: pointer; font-family: inherit; width: 100%; }
        .int-card:hover { border-color: var(--burti-forest); box-shadow: 0 4px 16px rgba(19,74,64,0.08); transform: translateY(-2px); }
        .int-card:focus-visible { outline: 2px solid var(--burti-forest); outline-offset: 2px; }
        .int-icon { width: 44px; height: 44px; border-radius: 10px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #fff; }
        .int-name { font-size: 12px; font-weight: 600; color: var(--burti-black); }
        .int-type { font-size: 10px; color: var(--burti-gray); }
        .int-hint { font-size: 9px; color: var(--burti-forest); margin-top: 6px; opacity: 0; transition: opacity 0.2s; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
        .int-card:hover .int-hint, .int-card:focus-visible .int-hint { opacity: 0.7; }

        .modal-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(19,74,64,0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px; animation: fadeIn 0.18s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .modal-card { background: #fff; border-radius: 16px; max-width: 560px; width: 100%; max-height: calc(100vh - 48px); overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.25); animation: slideUp 0.22s ease-out; position: relative; }
        .modal-head { padding: 28px 32px 20px; border-bottom: 1px solid var(--burti-gray-light); display: flex; align-items: flex-start; gap: 16px; }
        .modal-head-icon { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: #fff; flex-shrink: 0; }
        .modal-head-text { flex: 1; min-width: 0; }
        .modal-head-text h3 { font-size: 22px; font-weight: 800; color: var(--burti-black); margin-bottom: 4px; }
        .modal-head-text p { font-size: 13px; color: var(--burti-gray); }
        .modal-close { background: var(--burti-offwhite); border: 1px solid var(--burti-gray-light); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--burti-gray); font-size: 16px; line-height: 1; flex-shrink: 0; transition: all 0.15s; padding: 0; }
        .modal-close:hover { background: var(--burti-forest); border-color: var(--burti-forest); color: #fff; }
        .modal-body { padding: 24px 32px 32px; }
        .modal-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .modal-badge { font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; letter-spacing: 0.02em; }
        .badge-yes { background: #E6EED6; color: #4A6B25; }
        .badge-no { background: var(--burti-offwhite); color: var(--burti-gray); }
        .badge-info { background: #DDE3F3; color: #2B3D74; }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
        .modal-detail { font-size: 14px; line-height: 1.6; color: var(--burti-black); margin-bottom: 18px; }
        .modal-section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--burti-forest); margin-bottom: 10px; }
        .modal-caps { padding: 0; }
        .modal-caps li { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; font-size: 13px; color: var(--burti-black); line-height: 1.5; }
        .modal-caps li::before { content: '■'; color: var(--burti-rowanberry); font-size: 8px; margin-top: 6px; flex-shrink: 0; }

        .how { padding: 100px 60px; background: #fff; }
        .how-inner { max-width: 1200px; margin: 0 auto; }
        .how h2 { font-size: clamp(28px, 3vw, 40px); font-weight: 800; margin-bottom: 48px; text-align: center; }
        .how-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .how-step { text-align: center; padding: 32px 24px; }
        .step-num { width: 48px; height: 48px; border-radius: 50%; background: var(--burti-forest); color: #fff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .how-step h3 { font-size: 18px; font-weight: 700; margin-bottom: 10px; }
        .how-step p { font-size: 14px; color: var(--burti-gray); line-height: 1.6; }

        .booking-section { padding: 100px 60px; background: var(--burti-offwhite); }
        .booking-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
        .booking-text h2 { font-size: clamp(24px, 2.5vw, 36px); font-weight: 800; margin-bottom: 16px; }
        .booking-text p { font-size: 16px; color: var(--burti-gray); line-height: 1.7; margin-bottom: 24px; }
        .booking-features { padding: 0; }
        .booking-features li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; font-size: 14px; color: var(--burti-black); }
        .booking-features li::before { content: '■'; color: var(--burti-rowanberry); font-size: 8px; margin-top: 4px; flex-shrink: 0; }

        .deploy { padding: 80px 60px; background: #fff; }
        .deploy-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .deploy-card { padding: 32px 28px; background: var(--burti-offwhite); border-radius: 14px; }
        .deploy-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 10px; }
        .deploy-card p { font-size: 14px; color: var(--burti-gray); line-height: 1.6; }

        .cta-section { padding: 100px 60px; background: var(--burti-forest); color: #fff; text-align: center; position: relative; overflow: hidden; }
        .cta-section::before { content: ''; position: absolute; left: 50%; top: 50%; width: 600px; height: 600px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(0,174,231,0.1), transparent 70%); }
        .cta-inner { position: relative; z-index: 2; max-width: 640px; margin: 0 auto; }
        .cta-section h2 { font-size: clamp(28px, 3.5vw, 44px); font-weight: 800; margin-bottom: 16px; }
        .cta-section p { font-size: 17px; color: rgba(255,255,255,0.75); margin-bottom: 32px; line-height: 1.6; }
        .btn-white { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: var(--burti-forest); padding: 16px 32px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; transition: all 0.2s; }
        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.2); }
        .cta-fineprint { margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.5); }

        .footer { padding: 40px 60px; background: var(--burti-mud); color: rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: space-between; font-size: 13px; flex-wrap: wrap; gap: 16px; }
        .footer a { color: rgba(255,255,255,0.7); text-decoration: none; }
        .footer a:hover { color: #fff; }
        .footer-links { display: flex; gap: 24px; }

        @media (max-width: 900px) {
          .hero-content, .pain-grid, .booking-inner { grid-template-columns: 1fr; gap: 40px; }
          .features-grid, .deploy-inner { grid-template-columns: 1fr; }
          .how-steps { grid-template-columns: 1fr; }
          .int-grid { grid-template-columns: repeat(3, 1fr); }
          .hero, .pain, .solution, .how, .booking-section, .cta-section, .integrations, .deploy { padding-left: 24px; padding-right: 24px; }
          .nav { padding: 12px 20px; gap: 16px; }
          .nav-links { gap: 14px; }
          .nav-links a:not(.nav-cta):not(.nav-signin) { display: none; }
        }
      `}</style>

      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <Link href="/" className="nav-brand">
          herbe<span className="dot">.</span>calendar
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#integrations">Integrations</a>
          <a href="#how">How It Works</a>
          <a href="#booking">Booking</a>
          <Link href="/cal" className="nav-signin">
            Sign in
          </Link>
          <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="nav-cta">
            Book a Demo
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-bg"></div>
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-eyebrow">herbe.calendar</div>
            <h1>
              See your whole team&apos;s schedule.
              <br />
              <span className="accent">Across every app.</span>
            </h1>
            <p className="hero-sub">
              herbe.calendar unifies ERP, Outlook, Google Calendar, Zoom, Teams, Meet, and Calendly into one view. Stop
              switching between five apps — see everyone&apos;s real availability instantly.
            </p>
            <div className="hero-actions">
              <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
                Book a Demo →
              </a>
              <a href="#features" className="btn-secondary">
                See Features
              </a>
            </div>
            <div className="hero-sources">
              <span className="label">Connects:</span>
              {['ERP', 'Outlook', 'Google', 'Zoom', 'Calendly', 'ICS'].map(s => (
                <span key={s} className="source-pill">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-screenshot">
            <TeamViewScreenshot
              style={{
                transform: 'perspective(1200px) rotateY(-3deg) rotateX(1.5deg)',
                transformOrigin: 'center center',
              }}
            />
          </div>
        </div>
      </section>

      <section className="pain">
        <div className="pain-inner">
          <div className="pain-grid">
            <div>
              <div className="pain-eyebrow">The Problem</div>
              <h2>Your team&apos;s schedule is scattered across 5+ apps</h2>
              <p className="pain-desc">
                ERP tracks activities. Outlook holds meetings. Google Calendar has personal events. Zoom, Teams, Meet
                each manage their own video calls. Calendly handles external bookings. To check if someone is free, you
                open them all and hope you didn&apos;t miss one.
              </p>
              <div className="pain-stats">
                {STATS.map(stat => (
                  <div key={stat.label} className="pain-stat">
                    <div className="pain-stat-num">{stat.num}</div>
                    <div className="pain-stat-label">
                      {stat.label}
                      <a href={stat.source} target="_blank" rel="noopener noreferrer">
                        {stat.sourceLabel}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pain-chaos">
              {CHAOS_APPS.map((app, i) => (
                <Fragment key={app.name}>
                  <div className="chaos-app">
                    <div className="chaos-icon" style={{ background: app.bg }}>
                      {app.name.charAt(0)}
                    </div>
                    <div>
                      <div className="chaos-label">{app.name}</div>
                      <div className="chaos-sub">{app.sub}</div>
                    </div>
                    <div className="chaos-tag">ISOLATED</div>
                  </div>
                  {i < CHAOS_APPS.length - 1 && <div className="chaos-arrow">↕ no sync</div>}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="solution" id="features">
        <div className="solution-inner">
          <div className="section-label">The Solution</div>
          <h2>One calendar that shows everything</h2>
          <p className="solution-sub">
            herbe.calendar pulls every source into a single, real-time multi-person view. See your whole team
            side-by-side with color-coded sources — no more mental merging.
          </p>
          <div className="solution-screenshot">
            <TeamViewScreenshot />
          </div>

          <div className="features-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon" style={{ background: f.bg, color: f.color }}>
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="integrations" id="integrations">
        <div className="integrations-inner">
          <div className="section-label center">Connected Systems</div>
          <h2>Real-time sync with everything your team uses</h2>
          <p className="integrations-sub">
            Each source connects independently — the calendar loads progressively, never waiting for the slowest.
          </p>
          <div className="int-grid">
            {INTEGRATIONS.map(int => (
              <button
                key={int.name}
                type="button"
                className="int-card"
                onClick={() => setOpenInt(int)}
                aria-label={`Open ${int.name} integration details`}
              >
                <div className="int-icon" style={{ background: int.bg }}>
                  {int.name.charAt(0)}
                </div>
                <div className="int-name">{int.name}</div>
                <div className="int-type">{int.type}</div>
                <div className="int-hint">View details</div>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--burti-gray)', marginTop: 24 }}>
            Click any integration to see what it covers and how it pairs with the others.
          </p>
        </div>
      </section>

      <section className="how" id="how">
        <div className="how-inner">
          <div className="section-label center">How It Works</div>
          <h2>Up and running in three steps</h2>
          <div className="how-steps">
            <div className="how-step">
              <div className="step-num">1</div>
              <h3>Connect your sources</h3>
              <p>
                Add ERP, Azure AD, Google accounts, Zoom, Calendly, or ICS feeds through the self-service admin panel.
                Each source loads independently.
              </p>
            </div>
            <div className="how-step">
              <div className="step-num">2</div>
              <h3>See everyone together</h3>
              <p>
                View your team side-by-side across all calendar systems. Day, week, or month — with color-coded sources
                and public holidays per person.
              </p>
            </div>
            <div className="how-step">
              <div className="step-num">3</div>
              <h3>Share &amp; book smarter</h3>
              <p>
                Share calendars with colleagues. Let clients self-book meetings with smart templates — availability
                checked across all sources in real-time.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="booking-section" id="booking">
        <div className="booking-inner">
          <div>
            <div className="section-label">Client Booking</div>
            <div className="booking-text">
              <h2>Booking, fully under your control</h2>
              <p>
                Build multiple booking templates — each with its own people, availability rules, output target, and
                visibility. You decide what&apos;s checked, what&apos;s shared, and where the event lands.
              </p>
              <ul className="booking-features">
                <li>Per-template: who&apos;s bookable and which calendars set availability</li>
                <li>Pick where the event is created — ERP activity, Outlook + Teams, Google + Meet, or Zoom</li>
                <li>Control what clients see — slot count, buffer time, day caps, holiday handling</li>
                <li>Secure shareable links, no client account needed</li>
              </ul>
              <div style={{ marginTop: 24 }}>
                <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Try the booking flow →
                </a>
              </div>
            </div>
          </div>
          <BookingScreenshot style={{ margin: '0 auto', maxWidth: 580 }} />
        </div>
      </section>

      <section className="deploy">
        <div className="deploy-inner">
          {DEPLOYMENT.map(item => (
            <div key={item.title} className="deploy-card" style={{ borderTop: `3px solid ${item.accent}` }}>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section" id="contact">
        <div className="cta-inner">
          <h2>Ready to unify your team&apos;s calendars?</h2>
          <p>Set up in minutes. Connect ERP, Outlook, Google, Teams, Zoom, and Calendly. See your whole team at a glance.</p>
          <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="btn-white">
            Book a Demo →
          </a>
          <div className="cta-fineprint">Custom deployment · Tailored to your stack · Dedicated support</div>
        </div>
      </section>

      <footer className="footer">
        <div>© 2026 burti · herbe.calendar</div>
        <div className="footer-links">
          <Link href="/docs">Documentation</Link>
          <Link href="/cal">Sign in</Link>
          <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
            Book a Demo
          </a>
        </div>
      </footer>

      {openInt && <IntegrationModal int={openInt} onClose={() => setOpenInt(null)} />}
    </div>
  )
}

function IntegrationModal({ int, onClose }: { int: IntegrationDetail; onClose: () => void }) {
  const tasksBadge =
    int.tasks === 'yes' ? (
      <span className="modal-badge badge-yes">
        <span className="badge-dot" style={{ background: '#6B8E3D' }} />
        Tasks {int.tasksNote ? `· ${int.tasksNote}` : ''}
      </span>
    ) : int.tasks === 'partial' ? (
      <span className="modal-badge badge-info">
        <span className="badge-dot" style={{ background: '#3F56A6' }} />
        Tasks · {int.tasksNote}
      </span>
    ) : (
      <span className="modal-badge badge-no">
        <span className="badge-dot" style={{ background: 'var(--burti-gray)' }} />
        No tasks
      </span>
    )

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="int-modal-title"
    >
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-icon" style={{ background: int.bg }}>
            {int.name.charAt(0)}
          </div>
          <div className="modal-head-text">
            <h3 id="int-modal-title">{int.name}</h3>
            <p>
              {int.type} · {int.sync}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-badges">
            {int.calendars ? (
              <span className="modal-badge badge-yes">
                <span className="badge-dot" style={{ background: '#6B8E3D' }} />
                Calendars
              </span>
            ) : (
              <span className="modal-badge badge-no">
                <span className="badge-dot" style={{ background: 'var(--burti-gray)' }} />
                No calendar
              </span>
            )}
            {tasksBadge}
            <span className="modal-badge badge-info">
              <span className="badge-dot" style={{ background: '#3F56A6' }} />
              {int.parallel}
            </span>
          </div>
          <p className="modal-detail">{int.detail}</p>
          <div className="modal-section-label">Capabilities</div>
          <ul className="modal-caps">
            {int.capabilities.map(c => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
