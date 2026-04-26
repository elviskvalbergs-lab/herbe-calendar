import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: "herbe.calendar — See your whole team's schedule. Across every app.",
  description:
    'Unify ERP, Outlook, Google Calendar, Zoom, Teams, Meet, and Calendly into one team view. Real-time multi-source sync, smart booking, and calendar sharing.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
