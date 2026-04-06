import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'herbe.calendar — All your calendars, one view',
  description: 'Unified calendar for Standard ERP, Outlook, and Google Workspace. Shared team views, multi-company support, and full event management.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
