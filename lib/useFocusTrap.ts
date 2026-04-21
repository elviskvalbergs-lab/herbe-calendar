import { useEffect, useRef } from 'react'

/**
 * Trap focus within a container element when active.
 * Returns a ref to attach to the container.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active || !ref.current) return

    const container = ref.current
    const getFocusable = () => container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )

    // Focus the first focusable element. preventScroll avoids iOS Safari
    // scrolling the fixed bottom-sheet modal's top behind the URL bar.
    const focusable = getFocusable()
    focusable[0]?.focus({ preventScroll: true })

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [active])

  return ref
}
