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
  const [style, setStyle] = useState<EvStyle>('solid')

  useEffect(() => {
    setStyle(read())
    const obs = new MutationObserver(() => setStyle(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ev-style'] })
    return () => obs.disconnect()
  }, [])

  return style
}
