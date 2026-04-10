'use client'
import { useState, useRef, useEffect } from 'react'
import { ActivityClassGroup } from '@/types'
import { BRAND_PALETTE, calColNrToColor, OUTLOOK_COLOR, GOOGLE_COLOR, FALLBACK_COLOR, SOURCE_COLOR_CODES } from '@/lib/activityColors'
import type { ColorOverrideRow } from '@/lib/activityColors'

interface Connection { id: string; name: string }

interface Props {
  classGroups: ActivityClassGroup[]
  connections: Connection[]
  overrides: ColorOverrideRow[]
  /** 'user' shows user overrides over admin defaults; 'admin' shows only admin overrides */
  mode: 'user' | 'admin'
  onSave: (classGroupCode: string, color: string, connectionId: string | null) => Promise<void>
  onDelete: (classGroupCode: string, connectionId: string | null) => Promise<void>
}

export default function ColorOverridesPanel({ classGroups, connections, overrides, mode, onSave, onDelete }: Props) {
  const [saving, setSaving] = useState<string | null>(null)

  function getOverride(groupCode: string, connectionId: string | null, isUser: boolean): ColorOverrideRow | undefined {
    return overrides.find(o =>
      o.class_group_code === groupCode &&
      (isUser ? o.user_email !== null : o.user_email === null) &&
      (connectionId ? o.connection_id === connectionId : o.connection_id === null)
    )
  }

  function resolvedColor(groupCode: string, connectionId: string | null, groupIndex: number): { color: string; source: string } {
    if (mode === 'user') {
      if (connectionId) {
        const uc = getOverride(groupCode, connectionId, true)
        if (uc) return { color: uc.color, source: 'user-conn' }
      }
      const ug = getOverride(groupCode, null, true)
      if (ug) return { color: ug.color, source: 'user-global' }
    }
    if (connectionId) {
      const ac = getOverride(groupCode, connectionId, false)
      if (ac) return { color: ac.color, source: 'admin-conn' }
    }
    const ag = getOverride(groupCode, null, false)
    if (ag) return { color: ag.color, source: 'admin-global' }

    const group = classGroups.find(g => g.code === groupCode)
    const erpColor = group ? calColNrToColor(group.calColNr) : undefined
    if (erpColor) return { color: erpColor, source: 'erp' }
    return { color: BRAND_PALETTE[groupIndex % BRAND_PALETTE.length], source: 'palette' }
  }

  function isInherited(groupCode: string, connectionId: string | null): boolean {
    if (mode === 'user') {
      const own = getOverride(groupCode, connectionId, true)
      return !own
    }
    const own = getOverride(groupCode, connectionId, false)
    return !own
  }

  async function handleColorPick(groupCode: string, color: string, connectionId: string | null) {
    const key = `${groupCode}-${connectionId ?? 'global'}`
    setSaving(key)
    await onSave(groupCode, color, connectionId)
    setSaving(null)
  }

  async function handleReset(groupCode: string, connectionId: string | null) {
    const key = `${groupCode}-${connectionId ?? 'global'}`
    setSaving(key)
    await onDelete(groupCode, connectionId)
    setSaving(null)
  }

  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [stagedColor, setStagedColor] = useState<string | null>(null)
  // Track what the staged color is for so Apply knows where to save
  const stagedTarget = useRef<{ groupCode: string; connectionId: string | null } | null>(null)
  const [pickerAbove, setPickerAbove] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpenPicker(null)
        setStagedColor(null)
      }
    }
    if (openPicker) {
      document.addEventListener('mousedown', handleClick)
      // Check if picker overflows viewport and flip if needed, then scroll into view
      requestAnimationFrame(() => {
        if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect()
          const spaceBelow = window.innerHeight - rect.bottom
          setPickerAbove(spaceBelow < 220)
        }
        // Scroll the picker into view after it renders
        requestAnimationFrame(() => {
          if (pickerRef.current) {
            pickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        })
      })
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openPicker])

  function renderColorSwatch(groupCode: string, connectionId: string | null, groupIndex: number) {
    const inherited = isInherited(groupCode, connectionId)
    const { color } = resolvedColor(groupCode, connectionId, groupIndex)
    const savingKey = `${groupCode}-${connectionId ?? 'global'}`
    const pickerKey = `${groupCode}-${connectionId ?? 'global'}`
    const connLabel = connectionId
      ? connections.find(c => c.id === connectionId)?.name ?? connectionId
      : 'All Connections'

    return (
      <div
        key={connectionId ?? 'global'}
        ref={openPicker === pickerKey ? triggerRef : undefined}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors cursor-pointer hover:bg-bg ${
          inherited ? 'border-dashed border-border/60' : 'border-border'
        }`}
        onClick={() => {
          if (saving !== savingKey) {
            if (openPicker === pickerKey) {
              setOpenPicker(null); setStagedColor(null); stagedTarget.current = null
            } else {
              setOpenPicker(pickerKey); setStagedColor(null); stagedTarget.current = { groupCode, connectionId }
            }
          }
        }}
      >
        <div className="relative shrink-0">
          <div
            className="w-5 h-5 rounded"
            style={{ background: (openPicker === pickerKey && stagedColor) ? stagedColor : color, border: `2px solid ${((openPicker === pickerKey && stagedColor) ? stagedColor : color)}44` }}
          />
          {openPicker === pickerKey && (
            <div ref={pickerRef} className={`absolute left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-2 w-[180px] ${pickerAbove ? 'bottom-7' : 'top-7'}`} onClick={e => e.stopPropagation()}>
              {stagedColor && (
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border">
                  <div className="w-5 h-5 rounded" style={{ background: stagedColor }} />
                  <span className="text-[10px] font-mono text-text-muted">{stagedColor}</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {BRAND_PALETTE.map((preset) => {
                  const active = (stagedColor ?? color).toLowerCase() === preset.toLowerCase()
                  return (
                    <button
                      key={preset}
                      className="w-6 h-6 rounded-md transition-transform hover:scale-110"
                      style={{
                        background: preset,
                        outline: active ? '2px solid var(--color-text)' : 'none',
                        outlineOffset: '1px',
                      }}
                      onClick={() => setStagedColor(preset)}
                    />
                  )
                })}
              </div>
              <label className="flex items-center gap-1.5 pt-1.5 border-t border-border cursor-pointer">
                <div className="w-5 h-5 rounded" style={{ background: stagedColor ?? color, border: `2px solid ${(stagedColor ?? color)}44` }} />
                <span className="text-[10px] text-text-muted">Custom...</span>
                <input
                  type="color"
                  value={stagedColor ?? color}
                  onChange={e => setStagedColor(e.target.value)}
                  className="sr-only"
                />
              </label>
              <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-border">
                <button
                  className={`flex-1 text-[10px] font-bold py-1 rounded ${stagedColor ? 'bg-primary text-white hover:opacity-90' : 'bg-border/50 text-text-muted cursor-not-allowed'}`}
                  disabled={!stagedColor}
                  onClick={() => {
                    if (stagedColor) {
                      handleColorPick(groupCode, stagedColor, connectionId)
                      setOpenPicker(null); setStagedColor(null); stagedTarget.current = null
                    }
                  }}
                >Apply</button>
                <button
                  className="flex-1 text-[10px] font-bold py-1 rounded border border-border text-text-muted hover:bg-border/30"
                  onClick={() => { setOpenPicker(null); setStagedColor(null); stagedTarget.current = null }}
                >Cancel</button>
              </div>
            </div>
          )}
        </div>
        <span className={`text-xs flex-1 ${inherited ? 'italic text-text-muted' : ''}`}>
          {connLabel}{inherited ? ' (inherited)' : ''}
        </span>
        {!inherited && (
          <button
            onClick={e => { e.stopPropagation(); handleReset(groupCode, connectionId) }}
            className="text-[9px] text-text-muted hover:text-text shrink-0"
            disabled={saving === savingKey}
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  const sourceEntries: { code: string; label: string; defaultColor: string }[] = [
    { code: SOURCE_COLOR_CODES.outlook, label: 'Outlook / Teams', defaultColor: OUTLOOK_COLOR },
    { code: SOURCE_COLOR_CODES.google, label: 'Google Calendar', defaultColor: GOOGLE_COLOR },
    { code: SOURCE_COLOR_CODES.erp, label: 'Direct ERP entry', defaultColor: FALLBACK_COLOR },
  ]

  function getSourceColor(code: string, defaultColor: string): string {
    const override = overrides.find(o =>
      o.class_group_code === code &&
      (mode === 'user' ? o.user_email !== null : o.user_email === null) &&
      o.connection_id === null
    )
    return override?.color ?? defaultColor
  }

  function isSourceInherited(code: string): boolean {
    return !overrides.find(o =>
      o.class_group_code === code &&
      (mode === 'user' ? o.user_email !== null : o.user_email === null) &&
      o.connection_id === null
    )
  }

  return (
    <div className="space-y-4">
      {classGroups.map((g, idx) => (
        <div key={g.code} className="space-y-1.5">
          <div className="text-xs font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: resolvedColor(g.code, null, idx).color }} />
            {g.name || g.code}
            {g.name && g.code !== g.name && <span className="text-[10px] text-text-muted font-mono font-normal">{g.code}</span>}
          </div>
          <div className="space-y-1 pl-4">
            {renderColorSwatch(g.code, null, idx)}
            {connections.map(c => renderColorSwatch(g.code, c.id, idx))}
          </div>
        </div>
      ))}

      <div className="pt-2 border-t border-border">
        <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide mb-3">Source Colors</p>
        <div className="space-y-3">
          {sourceEntries.map(({ code, label, defaultColor }) => {
            const color = getSourceColor(code, defaultColor)
            const inherited = isSourceInherited(code)
            const savingKey = `${code}-global`
            const pickerKey = `${code}-global`

            return (
              <div key={code} className="space-y-1.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {label}
                </div>
                <div className="pl-4">
                  <div
                    ref={openPicker === pickerKey ? triggerRef : undefined}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors cursor-pointer hover:bg-bg ${
                      inherited ? 'border-dashed border-border/60' : 'border-border'
                    }`}
                    onClick={() => {
                      if (saving !== savingKey) {
                        if (openPicker === pickerKey) {
                          setOpenPicker(null); setStagedColor(null); stagedTarget.current = null
                        } else {
                          setOpenPicker(pickerKey); setStagedColor(null); stagedTarget.current = { groupCode: code, connectionId: null }
                        }
                      }
                    }}
                  >
                    <div className="relative shrink-0">
                      <div
                        className="w-5 h-5 rounded"
                        style={{ background: (openPicker === pickerKey && stagedColor) ? stagedColor : color, border: `2px solid ${((openPicker === pickerKey && stagedColor) ? stagedColor : color)}44` }}
                      />
                      {openPicker === pickerKey && (
                        <div ref={pickerRef} className={`absolute left-0 z-50 bg-surface border border-border rounded-lg shadow-lg p-2 w-[180px] ${pickerAbove ? 'bottom-7' : 'top-7'}`} onClick={e => e.stopPropagation()}>
                          {stagedColor && (
                            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border">
                              <div className="w-5 h-5 rounded" style={{ background: stagedColor }} />
                              <span className="text-[10px] font-mono text-text-muted">{stagedColor}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-5 gap-1.5 mb-2">
                            {BRAND_PALETTE.map((preset) => {
                              const active = (stagedColor ?? color).toLowerCase() === preset.toLowerCase()
                              return (
                                <button
                                  key={preset}
                                  className="w-6 h-6 rounded-md transition-transform hover:scale-110"
                                  style={{
                                    background: preset,
                                    outline: active ? '2px solid var(--color-text)' : 'none',
                                    outlineOffset: '1px',
                                  }}
                                  onClick={() => setStagedColor(preset)}
                                />
                              )
                            })}
                          </div>
                          <label className="flex items-center gap-1.5 pt-1.5 border-t border-border cursor-pointer">
                            <div className="w-5 h-5 rounded" style={{ background: stagedColor ?? color, border: `2px solid ${(stagedColor ?? color)}44` }} />
                            <span className="text-[10px] text-text-muted">Custom...</span>
                            <input
                              type="color"
                              value={stagedColor ?? color}
                              onChange={e => setStagedColor(e.target.value)}
                              className="sr-only"
                            />
                          </label>
                          <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-border">
                            <button
                              className={`flex-1 text-[10px] font-bold py-1 rounded ${stagedColor ? 'bg-primary text-white hover:opacity-90' : 'bg-border/50 text-text-muted cursor-not-allowed'}`}
                              disabled={!stagedColor}
                              onClick={() => {
                                if (stagedColor) {
                                  handleColorPick(code, stagedColor, null)
                                  setOpenPicker(null); setStagedColor(null); stagedTarget.current = null
                                }
                              }}
                            >Apply</button>
                            <button
                              className="flex-1 text-[10px] font-bold py-1 rounded border border-border text-text-muted hover:bg-border/30"
                              onClick={() => { setOpenPicker(null); setStagedColor(null); stagedTarget.current = null }}
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={`text-xs flex-1 ${inherited ? 'italic text-text-muted' : ''}`}>
                      {inherited ? `Default (${defaultColor})` : 'Custom'}
                    </span>
                    {!inherited && (
                      <button
                        onClick={e => { e.stopPropagation(); handleReset(code, null) }}
                        className="text-[9px] text-text-muted hover:text-text shrink-0"
                        disabled={saving === savingKey}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
