'use client'
import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface Props {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const swipeStart = useRef<{ y: number } | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(true)

  useEffect(() => {
    if (destructive) cancelRef.current?.focus()
  }, [destructive])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
        className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipeStart.current = { y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (swipeStart.current && e.changedTouches[0].clientY - swipeStart.current.y > 80) {
            onCancel()
          }
          swipeStart.current = null
        }}
      >
        <p className="text-sm text-text mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-border text-text-muted hover:bg-border/30 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus={!destructive}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              destructive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
