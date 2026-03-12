'use client'
import { useSearchParams, Suspense } from 'react'

function SetupContent({ authUrl }: { authUrl: string }) {
  const params = useSearchParams()
  const success = params.get('success') === '1'
  const error = params.get('error')

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border p-8">
        <h1 className="text-2xl font-bold mb-1">
          herbe<span className="text-primary">.</span>calendar
        </h1>
        <p className="text-text-muted text-sm mb-6">Herbe ERP connection setup</p>

        {success && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 mb-4 text-green-300 text-sm">
            Connected successfully.{' '}
            <a href="/" className="underline">Go to calendar →</a>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 mb-4 text-red-300 text-sm">
            Error: {error.replace(/_/g, ' ')}
          </div>
        )}

        <p className="text-sm text-white/80 mb-6">
          Log in with your HansaWorld Standard ID to connect Herbe ERP. The app will use your
          session to access Herbe data on behalf of all users.
        </p>

        <a
          href={authUrl}
          className="block w-full bg-primary text-white font-bold py-3 rounded-lg text-center"
        >
          Connect to Herbe ERP
        </a>
      </div>
    </div>
  )
}

export default function SetupClient({ authUrl }: { authUrl: string }) {
  return (
    <Suspense>
      <SetupContent authUrl={authUrl} />
    </Suspense>
  )
}
