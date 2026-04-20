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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#cd4c38" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Apply stored theme / event style / accent color before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme');if(t==='light'){d.setAttribute('data-theme','light')}else if(t==='dark'){d.setAttribute('data-theme','dark')}else if(!t&&window.matchMedia('(prefers-color-scheme: light)').matches){d.setAttribute('data-theme','light')};var s=localStorage.getItem('evStyle');if(s==='tinted'||s==='outlined'){d.setAttribute('data-ev-style',s)};var a=localStorage.getItem('accent');if(a&&/^#[0-9A-Fa-f]{6}$/.test(a)){d.style.setProperty('--app-accent',a);d.style.setProperty('--color-primary',a)}}catch(e){}})()` }} />
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
