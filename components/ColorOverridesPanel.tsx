'use client'
import { useState } from 'react'
import { ActivityClassGroup } from '@/types'
import { BRAND_PALETTE, calColNrToColor } from '@/lib/activityColors'
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

  function renderColumn(connectionId: string | null, label: string, isPrimary: boolean) {
    return (
      <div className="flex-1 min-w-[140px]">
        <div className={`font-bold text-[11px] uppercase tracking-wide mb-3 pb-2 border-b-2 ${isPrimary ? 'text-primary border-primary' : 'text-text-muted border-border'}`}>
          {label}
        </div>
        <div className="space-y-2">
          {classGroups.map((g, idx) => {
            const inherited = isInherited(g.code, connectionId)
            const { color } = resolvedColor(g.code, connectionId, idx)
            const savingKey = `${g.code}-${connectionId ?? 'global'}`

            return (
              <div
                key={g.code}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                  inherited ? 'border-dashed border-border/60 opacity-50' : 'border-border'
                }`}
              >
                <label className="relative cursor-pointer shrink-0">
                  <div
                    className="w-5 h-5 rounded"
                    style={{ background: color, border: `2px solid ${color}44` }}
                  />
                  <input
                    type="color"
                    value={color}
                    onChange={e => handleColorPick(g.code, e.target.value, connectionId)}
                    className="sr-only"
                    disabled={saving === savingKey}
                  />
                </label>
                <span className={`text-xs truncate flex-1 ${inherited ? 'italic text-text-muted' : ''}`}>
                  {inherited ? 'inherited' : (g.name || g.code)}
                </span>
                {!inherited && (
                  <button
                    onClick={() => handleReset(g.code, connectionId)}
                    className="text-[9px] text-text-muted hover:text-text shrink-0"
                    disabled={saving === savingKey}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {renderColumn(null, 'All Connections', true)}
      {connections.map(c => renderColumn(c.id, c.name, false))}
    </div>
  )
}
