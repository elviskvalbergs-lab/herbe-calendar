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
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(10,18,16,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
        className="modal w-full max-w-sm"
        style={{ padding: 0 }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipeStart.current = { y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (swipeStart.current && e.changedTouches[0].clientY - swipeStart.current.y > 80) {
            onCancel()
          }
          swipeStart.current = null
        }}
      >
        <div className="modal-body">
          <p className="text-sm" style={{ color: 'var(--app-fg)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn btn-outline"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus={!destructive}
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            style={destructive ? { background: 'var(--app-danger)', color: '#fff' } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
