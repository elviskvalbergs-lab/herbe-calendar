import type { Metadata, Viewport } from 'next'
import { SessionProvider } from 'next-auth/react'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import InstallPrompt from '@/components/InstallPrompt'
import './globals.css'

export const metadata: Metadata = {
  title: 'Herbe Calendar',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Calendar',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#cd4c38" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Apply stored theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light')}else if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}else if(!t&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}})()` }} />
      </head>
      <body>
        <SessionProvider>
          {children}
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </SessionProvider>
      </body>
    </html>
  )
}
