'use client'
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Check if dismissed recently
    try {
      const d = localStorage.getItem('installPromptDismissed')
      if (d && Date.now() - Number(d) < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true)
        return
      }
    } catch {}

    // Detect iOS (no beforeinstallprompt on Safari)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    setIsIos(ios)

    // Listen for the install prompt event (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem('installPromptDismissed', String(Date.now())) } catch {}
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    setDeferredPrompt(null)
  }

  if (isInstalled || dismissed) return null
  if (!deferredPrompt && !isIos) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm bg-surface border border-border rounded-xl shadow-2xl p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text">Install Calendar</p>
        {isIos ? (
          <p className="text-xs text-text-muted mt-0.5">
            Tap <span className="inline-block align-middle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </span> then &quot;Add to Home Screen&quot;
          </p>
        ) : (
          <p className="text-xs text-text-muted mt-0.5">Add to your home screen for quick access</p>
        )}
      </div>
      {!isIos && (
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shrink-0"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        className="text-text-muted text-lg leading-none shrink-0 hover:text-text"
      >
        ×
      </button>
    </div>
  )
}
