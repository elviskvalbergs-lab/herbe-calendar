'use client'

export default function ImpersonationBanner({ targetEmail, originalEmail }: { targetEmail: string; originalEmail: string }) {
  function exitImpersonation() {
    document.cookie = 'impersonateAs=;path=/;max-age=0'
    window.location.reload()
  }

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm font-bold shrink-0">
      <span>
        Viewing as <span className="underline">{targetEmail}</span>
        <span className="font-normal opacity-70 ml-2">(logged in as {originalEmail})</span>
      </span>
      <button
        onClick={exitImpersonation}
        className="px-3 py-1 bg-black/20 rounded text-xs hover:bg-black/30 transition-colors"
      >
        Exit
      </button>
    </div>
  )
}
