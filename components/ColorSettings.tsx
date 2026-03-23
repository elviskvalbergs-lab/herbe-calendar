'use client'
import { useState, useEffect } from 'react'
import { ActivityClassGroup } from '@/types'
import { BRAND_PALETTE, OUTLOOK_COLOR, FALLBACK_COLOR, saveColorOverride } from '@/lib/activityColors'

type Theme = 'dark' | 'light' | 'system'

function applyTheme(t: Theme) {
  try {
    if (t === 'system') {
      localStorage.removeItem('theme')
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
    } else {
      localStorage.setItem('theme', t)
      document.documentElement.setAttribute('data-theme', t)
    }
  } catch {}
}

interface Props {
  classGroups: ActivityClassGroup[]
  colorMap: Map<string, string>          // classGroupCode → current hex
  error?: string | null
  onClose: () => void
  onColorChange: (groupCode: string, color: string) => void
  onReload?: () => void
}

export default function ColorSettings({ classGroups, colorMap, error, onClose, onColorChange, onReload }: Props) {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      setTheme(stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : 'system')
    } catch {}
  }, [])

  function handleTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold">Activity Colors</h2>
          <div className="flex items-center gap-2">
            {onReload && (
              <button onClick={onReload} className="text-text-muted text-sm px-2 py-1 rounded hover:bg-border" title="Reload types & groups from Herbe">
                ↻ Reload
              </button>
            )}
            <button onClick={onClose} className="text-text-muted text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Theme */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Theme</p>
            <div className="flex rounded overflow-hidden border border-border text-sm font-bold">
              {(['dark', 'system', 'light'] as Theme[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleTheme(t)}
                  className={`flex-1 py-2 capitalize ${theme === t ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  {t === 'system' ? '⚙ System' : t === 'dark' ? '☾ Dark' : '☀ Light'}
                </button>
              ))}
            </div>
          </div>

          {/* Fixed sources */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Source colors (fixed)</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: OUTLOOK_COLOR, background: OUTLOOK_COLOR + '33' }} />
                <span className="text-sm">Outlook / Teams</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: FALLBACK_COLOR, background: FALLBACK_COLOR + '33' }} />
                <span className="text-sm text-text-muted">No type assigned</span>
              </div>
            </div>
          </div>

          {/* Class groups */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Herbe activity class groups</p>
            {error && (
              <p className="text-xs text-red-400 font-mono bg-red-900/20 rounded p-2 mb-2 break-all">{error}</p>
            )}
            {!error && classGroups.length === 0 && (
              <p className="text-sm text-text-muted">No class groups loaded yet.</p>
            )}
            <div className="space-y-3">
              {classGroups.map(g => {
                const current = colorMap.get(g.code) ?? FALLBACK_COLOR
                return (
                  <div key={g.code}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ background: current }} />
                      <span className="text-sm font-medium">{g.name || g.code}</span>
                      <span className="text-xs text-text-muted font-mono">{g.code}</span>
                      {g.calColNr != null && (
                        <span className="text-xs text-text-muted ml-auto">CalColNr: {g.calColNr}</span>
                      )}
                    </div>
                    {/* 20-color swatch picker */}
                    <div className="flex flex-wrap gap-1.5">
                      {BRAND_PALETTE.map(hex => (
                        <button
                          key={hex}
                          title={hex}
                          onClick={() => {
                            saveColorOverride(g.code, hex)
                            onColorChange(g.code, hex)
                          }}
                          className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                          style={{
                            background: hex,
                            outline: current === hex ? `2px solid white` : '2px solid transparent',
                            outlineOffset: '1px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="w-full bg-primary text-white font-bold py-3 rounded-xl">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
