import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'herbe.calendar — All your calendars, one view',
  description: 'Unified calendar for Standard ERP, Outlook, and ICS feeds. Shared team views, multi-company support, and full event management.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  )
}
