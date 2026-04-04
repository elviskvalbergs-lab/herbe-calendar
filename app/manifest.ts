import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Herbe Calendar',
    short_name: 'Calendar',
    description: 'Multi-person calendar with Herbe ERP and Outlook integration',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a1a1a',
    theme_color: '#cd4c38',
    orientation: 'any',
    icons: [
      {
        src: '/icon-192.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: '/icon-512.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
    ],
  }
}
