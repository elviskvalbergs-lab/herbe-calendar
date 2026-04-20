'use client'
import { useEffect, useState } from 'react'

export type EvStyle = 'solid' | 'tinted' | 'outlined'

function read(): EvStyle {
  if (typeof document === 'undefined') return 'solid'
  const v = document.documentElement.getAttribute('data-ev-style')
  return v === 'tinted' || v === 'outlined' ? v : 'solid'
}

/** Tracks the current document-level `data-ev-style` so components can
 *  render their own variant without needing the base `.event` CSS class. */
export function useEvStyle(): EvStyle {
  // Lazy initial — on the client the pre-paint script has already set
  // the attribute, so first render already reflects the saved choice
  // (no "solid first, then variant" flash).
  const [style, setStyle] = useState<EvStyle>(() => read())

  useEffect(() => {
    // Re-read after mount in case hydration reset anything, then observe
    // for further changes made by Settings.
    setStyle(read())
    const obs = new MutationObserver(() => setStyle(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ev-style'] })
    return () => obs.disconnect()
  }, [])

  return style
}
