'use client'
import { useState, useCallback } from 'react'

interface ConfirmState {
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((message: string, onConfirm: () => void, opts?: { confirmLabel?: string; destructive?: boolean }) => {
    setState({ message, onConfirm, confirmLabel: opts?.confirmLabel, destructive: opts?.destructive })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.onConfirm()
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    setState(null)
  }, [])

  return { confirmState: state, confirm, handleConfirm, handleCancel }
}
