'use client'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg text-text p-8">
      <div className="max-w-md text-center" role="alert">
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-text-muted text-sm mb-4">An unexpected error occurred.</p>
        <button
          onClick={reset}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
