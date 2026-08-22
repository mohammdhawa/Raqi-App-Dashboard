// The one leave-type picker, shared by HR's excuse form, the employee's own
// leave form and the type filters.
//
// It is always fed by form (`for=requests` / `for=excuses`) and never by the
// unfiltered list — a type may be offered on one form and not the other (an
// official mission is recorded by HR, not requested by an employee), and
// naming a type the form doesn't offer only earns a 422.
//
// Every option carries its balance policy inline, because whether the day will
// cost the employee a balance day is the one thing the user most needs to see
// before submitting.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Loader2, Search, Tags, AlertTriangle } from 'lucide-react'
import { useLeaveTypes } from '../../utils/leaveTypes'
import { LEAVE_COPY } from '../../utils/leave'
import DeductsBalanceBadge from '../ui/DeductsBalanceBadge'

const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 42,
  background: '#fff', border: '1px solid var(--c-border)',
  borderRadius: 10, padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

/**
 * Single-select combobox over the types offered on one form.
 *
 * `onChange(id, type)` hands back the whole type so the caller can react to
 * `requires_reason` (mark `reason` required) and `deducts_balance` (hide the
 * over-balance affordance, which is meaningless on a non-deducting type).
 */
export default function LeaveTypeSelect({
  forForm, value, onChange, error, disabled,
  placeholder = 'اختر نوع الإجازة…',
}) {
  const { types, loading, error: loadError } = useLeaveTypes(forForm)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState(null)
  const wrapRef = useRef(null)
  const panelRef = useRef(null)

  // The panel is portalled to <body> and positioned against the trigger's
  // viewport rect. It cannot live next to the trigger: both forms that use this
  // picker are modals whose dialog is `overflow-y: auto`, which clips an
  // absolutely positioned descendant — and an abspos element adds nothing to its
  // scroll container's height, so the clipped tail can't be scrolled to either.
  // Types render in creation order, so the tail is exactly where a newly added
  // type lands: the newest type was the one you couldn't reach.
  const measure = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const GAP = 6, EDGE = 12, MIN_H = 160, MAX_H = 320
    const below = window.innerHeight - rect.bottom - GAP - EDGE
    const above = rect.top - GAP - EDGE
    // Flip upward only when below is genuinely cramped and above is roomier.
    const up = below < MIN_H && above > below
    setAnchor({
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + GAP,
      bottom: up ? window.innerHeight - rect.top + GAP : undefined,
      maxHeight: Math.max(MIN_H, Math.min(MAX_H, up ? above : below)),
    })
  }, [])

  useLayoutEffect(() => { if (open) measure() }, [open, measure])

  useEffect(() => {
    if (!open) return
    const close = () => { setOpen(false); setQuery('') }
    // The panel is no longer a descendant of the wrapper, so an outside click
    // has to clear both.
    const onDown = e => {
      if (wrapRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      close()
    }
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    // Capture, so the modal's own scrolling re-anchors the panel too.
    const onReflow = () => measure()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, measure])

  const selected = types.find(t => String(t.id) === String(value)) ?? null

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return types
    return types.filter(t =>
      `${t.name_ar ?? ''} ${t.name_en ?? ''} ${t.code ?? ''}`.toLowerCase().includes(q)
    )
  }, [types, query])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" disabled={disabled}
        onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{
          ...inputStyle, textAlign: 'start',
          display: 'flex', alignItems: 'center', gap: 8,
          borderColor: error ? 'var(--c-rejected)' : 'var(--c-border)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          background: disabled ? 'var(--c-surface)' : '#fff',
        }}
      >
        <Tags size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? 'var(--c-text)' : 'var(--c-text-3)', fontWeight: selected ? 700 : 400,
        }}>
          {selected ? selected.name_ar : placeholder}
        </span>
        {selected && <DeductsBalanceBadge deducts={selected.deducts_balance} compact />}
        <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      </button>

      {open && !disabled && anchor && createPortal(
        <div ref={panelRef} dir="rtl" style={{
          position: 'fixed', zIndex: 90,
          top: anchor.top, bottom: anchor.bottom, left: anchor.left, width: anchor.width,
          maxHeight: anchor.maxHeight, display: 'flex', flexDirection: 'column',
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 12, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}>
          {types.length > 6 && (
            <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن نوع…"
                style={{
                  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
                }}
              />
            </div>
          )}

          {/* flex + minHeight:0 so the list takes the panel's remaining height
              and scrolls inside it, keeping the last type reachable. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <Loader2 size={15} className="animate-spin" />
              </div>
            )}
            {!loading && loadError && (
              <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--c-rejected)' }}>
                تعذّر تحميل أنواع الإجازات
              </div>
            )}
            {!loading && !loadError && visible.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--c-text-3)' }}>
                لا توجد أنواع متاحة
              </div>
            )}
            {!loading && visible.map(type => {
              const active = String(type.id) === String(value)
              return (
                <button
                  key={type.id} type="button"
                  onClick={() => { onChange(type.id, type); setOpen(false); setQuery('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'start',
                    background: active ? 'var(--c-primary-light)' : 'transparent',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{type.name_ar}</div>
                    {type.requires_reason && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 2 }}>
                        <AlertTriangle size={10} />
                        {LEAVE_COPY.requiresReason}
                      </div>
                    )}
                  </div>
                  <DeductsBalanceBadge deducts={type.deducts_balance} compact />
                  {active && <Check size={14} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const filterSelectStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 160,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

/**
 * The `leave_type` listing filter, fed from the same vocabulary.
 *
 * Sends the type's **code**: the filter accepts a code, an Arabic or English
 * name, or legacy free text, and matches rows filed both before and after types
 * existed — but the code is the stable identifier, so it is what we send.
 *
 * `forForm` is `'requests'`, `'excuses'`, or `'all'` for the union of both. A
 * listing that can hold either kind needs the union: filtering "all sources" by
 * only the request types would hide every excuse-only type (an official
 * mission) from a list that certainly contains them. It is still the union of
 * two *filtered* feeds, never the unfiltered vocabulary.
 *
 * Both feeds are always fetched (they are cached and tiny) rather than switched
 * on, so the hooks stay unconditional.
 */
export function LeaveTypeFilter({ forForm = 'requests', value, onChange, label = 'نوع الإجازة' }) {
  const requests = useLeaveTypes('requests')
  const excuses = useLeaveTypes('excuses')

  const options = useMemo(() => {
    if (forForm === 'requests') return requests.types
    if (forForm === 'excuses') return excuses.types
    const merged = [...requests.types]
    const seen = new Set(merged.map(type => type.id))
    for (const type of excuses.types) {
      if (!seen.has(type.id)) { seen.add(type.id); merged.push(type) }
    }
    return merged
  }, [forForm, requests.types, excuses.types])

  const loading = forForm === 'excuses' ? excuses.loading
    : forForm === 'requests' ? requests.loading
      : requests.loading || excuses.loading

  // Narrowing the source filter can strip the selected type out of the feed —
  // an excuse-only type stays selected when the list flips to employee requests.
  // The `<select>` then shows nothing while still filtering the listing by the
  // now-invisible code, so the selection is dropped once the feed has settled.
  useEffect(() => {
    if (loading || !value) return
    if (options.some(type => type.code === value)) return
    onChange('')
  }, [loading, value, options, onChange])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Tags size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ ...filterSelectStyle, color: value ? 'var(--c-text)' : 'var(--c-text-2)' }}
      >
        <option value="">{label}: الكل</option>
        {options.map(type => (
          <option key={type.id} value={type.code}>
            {type.name_ar}{type.deducts_balance ? '' : ` — ${LEAVE_COPY.notDeducts}`}
          </option>
        ))}
      </select>
    </div>
  )
}
