import type { Metadata, Viewport } from 'next'
import { SessionProvider } from 'next-auth/react'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import InstallPrompt from '@/components/InstallPrompt'
import ApplyUserPrefs from '@/components/ApplyUserPrefs'
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
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme');if(t==='light'){d.setAttribute('data-theme','light')}else if(t==='dark'){d.setAttribute('data-theme','dark')}else if(!t&&window.matchMedia('(prefers-color-scheme: light)').matches){d.setAttribute('data-theme','light')};var s=localStorage.getItem('evStyle');if(s==='tinted'||s==='outlined'){d.setAttribute('data-ev-style',s)};var a=localStorage.getItem('accent');var hexMap={'#E08A2B':'amber','#6B8E3D':'moss','#2A8F94':'teal','#3F56A6':'indigo','#CD4C38':'rowanberry'};if(a&&hexMap[a]){a=hexMap[a];localStorage.setItem('accent',a)}if(a==='amber'||a==='moss'||a==='teal'||a==='indigo'){d.setAttribute('data-accent',a)}}catch(e){}})()` }} />
      </head>
      <body>
        <SessionProvider>
          <ApplyUserPrefs />
          {children}
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </SessionProvider>
      </body>
    </html>
  )
}
