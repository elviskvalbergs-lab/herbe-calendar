import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Documentation — herbe.calendar' }

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </div>
    </div>
  )
}
