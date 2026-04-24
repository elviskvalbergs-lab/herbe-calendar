import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Herbe Calendar',
    short_name: 'Calendar',
    description: 'Multi-person calendar with Herbe ERP and Outlook integration',
    start_url: '/cal',
    display: 'standalone',
    background_color: '#134A40',
    theme_color: '#134A40',
    orientation: 'any',
    icons: [
      {
        src: '/icon-source.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
