// Single-select combobox over GET /attendance/leave-managers (managers AND
// chiefs, company-wide).
//
// The leave *request* form picks an ordered chain and uses
// LeaveApproverChainPicker; this is for the places that name exactly one
// person — today the admin reassignment of a single pending step.

import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, Check, Loader2, UserCheck } from 'lucide-react'
import RoleTag from './RoleTag'
import { useLeaveManagers } from '../../utils/useLeaveManagers'
import { leaveRoleLabel } from '../../utils/leave'

const triggerStyle = {
  width: '100%', boxSizing: 'border-box', height: 42,
  background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
  borderRadius: 10, padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

/**
 * `excludeIds` are dropped from the roster — the requester, and anyone already
 * holding a step on the same request, both of whom the API refuses.
 */
export default function LeaveManagerSelect({
  value, onChange, error, excludeIds = [],
  placeholder = 'اختر المسؤول…',
}) {
  const [open, setOpen] = useState(false)
  const [selectedManager, setSelectedManager] = useState(null)
  const wrapRef = useRef(null)
  const { managers, visible, loading, query, setQuery } = useLeaveManagers(excludeIds)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = managers.find(m => String(m.id) === String(value))
    ?? (String(selectedManager?.id) === String(value) ? selectedManager : null)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          ...triggerStyle, cursor: 'pointer', textAlign: 'start',
          borderColor: error ? 'var(--c-rejected)' : 'var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <UserCheck size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? 'var(--c-text)' : 'var(--c-text-3)', fontWeight: selected ? 700 : 400,
        }}>
          {selected ? selected.name : placeholder}
        </span>
        {selected && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', flexShrink: 0 }}>
            {leaveRoleLabel(selected.role)}
          </span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 20,
          width: '100%', background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 12, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو البريد…"
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <Loader2 size={15} className="animate-spin" />
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--c-text-3)' }}>
                لا يوجد مسؤولون مطابقون
              </div>
            )}
            {!loading && visible.map(m => {
              const active = String(m.id) === String(value)
              return (
                <button
                  key={m.id} type="button"
                  onClick={() => { setSelectedManager(m); onChange(m.id); setOpen(false); setQuery('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'start',
                    background: active ? 'var(--c-primary-light)' : 'transparent',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>
                      {m.email}
                      {m.department?.name && ` · ${m.department.name}`}
                    </div>
                  </div>
                  <RoleTag role={m.role} />
                  {active && <Check size={14} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
