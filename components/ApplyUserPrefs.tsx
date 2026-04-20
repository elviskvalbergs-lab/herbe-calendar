'use client'
import { useEffect } from 'react'

/** Re-applies stored theme / event-style / accent preferences AFTER
 *  React hydration completes. The pre-paint script in layout.tsx sets
 *  these attributes before first paint, but React's hydration reconciler
 *  can clear extra attributes on <html> in some configurations. This
 *  component runs once on mount and guarantees the attributes are
 *  restored from localStorage regardless of what hydration did. */
export default function ApplyUserPrefs() {
  useEffect(() => {
    try {
      const d = document.documentElement

      const theme = localStorage.getItem('theme')
      if (theme === 'light') d.setAttribute('data-theme', 'light')
      else if (theme === 'dark') d.setAttribute('data-theme', 'dark')

      const ev = localStorage.getItem('evStyle')
      if (ev === 'tinted' || ev === 'outlined') {
        d.setAttribute('data-ev-style', ev)
      } else {
        d.removeAttribute('data-ev-style')
      }

      const accent = localStorage.getItem('accent')
      const valid = accent === 'amber' || accent === 'moss' || accent === 'teal' || accent === 'indigo'
      if (valid) d.setAttribute('data-accent', accent)
      else d.removeAttribute('data-accent')
    } catch {}
  }, [])
  return null
}
