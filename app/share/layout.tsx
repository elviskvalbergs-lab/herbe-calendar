import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Shared Calendar' }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children
}
