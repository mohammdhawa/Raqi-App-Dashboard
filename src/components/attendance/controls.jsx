// Shared controls for the attendance/leave listing pages: the Excel export
// button, sortable table headers, page-size picker, multi-select filters and
// boolean filter chips. Follows the same visual language as filters.jsx.
// Query-param helpers live in utils/attendanceQuery (this module only exports
// components — react-refresh).

import { useState, useEffect, useRef } from 'react'
import {
  Loader2, FileSpreadsheet, ArrowUp, ArrowDown, ArrowUpDown,
  ChevronDown, Search, X,
} from 'lucide-react'
import { useToast } from '../ui/Toast'
import { downloadXlsx, readApiError } from '../../utils/attendanceQuery'

const controlStyle = {
  height: 38, padding: '0 10px', borderRadius: 10,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

// "تصدير Excel" — re-issues the current view's exact request with format=xlsx.
// Exports render the complete filtered set (not one page) so they can take a
// few seconds; the button shows a spinner meanwhile. Errors (422 with Arabic
// messages) surface through the standard toast pattern.
export function ExportButton({ url, params, filename, disabled }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (busy || disabled) return
    setBusy(true)
    try {
      await downloadXlsx(url, params, filename)
    } catch (err) {
      toast.error(readApiError(err, 'تعذّر تصدير الملف، حاول مرة أخرى'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={run} disabled={busy || disabled}
      title="تنزيل النتائج الحالية بنفس الفلاتر والترتيب كملف Excel"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 38, padding: '0 14px', borderRadius: 10, whiteSpace: 'nowrap',
        background: '#fff', border: '1px solid var(--c-border)',
        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
        color: 'var(--c-approved)',
        cursor: (busy || disabled) ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
      {busy ? 'جارٍ التصدير...' : 'تصدير Excel'}
    </button>
  )
}

// Table header cell. With a `field`, it is clickable and cycles
// asc → desc → default (null = the endpoint's documented default order);
// without one it renders the plain header used across the dashboard. Only
// pass `field` for values in the endpoint's sort whitelist.
export function SortableTh({ label, field, sort, onSort, align = 'right' }) {
  const active = Boolean(field) && sort?.field === field
  const baseStyle = {
    padding: '11px 16px', textAlign: align, fontSize: 11.5, fontWeight: 700,
    color: active ? 'var(--c-primary)' : 'var(--c-text-2)',
    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
  }
  if (!field) return <th style={baseStyle}>{label}</th>

  const next = !active ? { field, dir: 'asc' } : sort.dir === 'asc' ? { field, dir: 'desc' } : null
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      onClick={() => onSort(next)} title="ترتيب حسب هذا العمود"
      style={{ ...baseStyle, cursor: 'pointer', userSelect: 'none' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {label}
        <Icon size={12} style={{ color: active ? 'var(--c-primary)' : 'var(--c-text-3)', opacity: active ? 1 : 0.55, flexShrink: 0 }} />
      </span>
    </th>
  )
}

// Page-size picker (the API caps per_page at 100).
export function PerPageSelect({ value, onChange }) {
  return (
    <select
      value={value} onChange={e => onChange(Number(e.target.value))}
      title="عدد الصفوف في الصفحة"
      style={{ ...controlStyle, fontSize: 12, color: 'var(--c-text-2)' }}
    >
      {[25, 50, 100].map(n => <option key={n} value={n}>{n} / صفحة</option>)}
    </select>
  )
}

// Boolean filter chip — active sends the filter (1), inactive omits it.
export function ToggleChip({ label, active, onChange, icon: Icon, title }) {
  return (
    <button
      type="button" onClick={() => onChange(!active)} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 38, padding: '0 12px', borderRadius: 10, whiteSpace: 'nowrap',
        border: active ? 'none' : '1px solid var(--c-border)',
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  )
}

// Checkbox-dropdown multi-select for department_ids / section_ids / user_ids.
// `values` is an array of string ids; options are { id, name, email? }.
export function MultiSelect({ icon: Icon, label, options, values, onChange, disabled, disabledTitle }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    // Reset the local search on every close path so the panel reopens clean.
    const close = () => { setOpen(false); setQuery('') }
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) close() }
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = id => {
    const key = String(id)
    onChange(values.includes(key) ? values.filter(v => v !== key) : [...values, key])
  }

  const q = query.trim().toLowerCase()
  const shown = q
    ? options.filter(o => `${o.name ?? ''} ${o.email ?? ''}`.toLowerCase().includes(q))
    : options

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      {Icon && <Icon size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
      <button
        type="button" disabled={disabled}
        onClick={() => { setOpen(o => !o); setQuery('') }}
        title={disabled ? disabledTitle : undefined}
        style={{
          ...controlStyle, minWidth: 150,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          color: values.length ? 'var(--c-text)' : 'var(--c-text-2)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          background: disabled ? 'var(--c-surface)' : '#fff',
        }}
      >
        {values.length ? `${label} (${values.length})` : `${label}: الكل`}
        <ChevronDown size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      </button>

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 40,
          minWidth: 230, maxHeight: 300, overflowY: 'auto',
          background: '#fff', border: '1px solid var(--c-border)', borderRadius: 12,
          boxShadow: 'var(--sh-card-lg)', padding: 6,
        }}>
          {options.length > 8 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 34,
              padding: '0 10px', margin: '2px 2px 6px', borderRadius: 9,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            }}>
              <Search size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <input
                value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث..."
                autoFocus
                style={{
                  flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--c-text)', textAlign: 'right',
                }}
              />
            </div>
          )}

          {values.length > 0 && (
            <button
              type="button" onClick={() => onChange([])}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '7px 10px', borderRadius: 8, border: 'none', background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 700,
                color: 'var(--c-rejected)', cursor: 'pointer',
              }}
            >
              <X size={12} />
              مسح التحديد
            </button>
          )}

          {shown.map(o => (
            <label
              key={o.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                color: 'var(--c-text)',
              }}
              className="hover:bg-[var(--c-surface)]"
            >
              <input
                type="checkbox" checked={values.includes(String(o.id))} onChange={() => toggle(o.id)}
                style={{ accentColor: 'var(--c-primary)', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ minWidth: 0, flex: 1 }}>
                {o.name}
                {o.email && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--c-text-3)', marginTop: 1 }}>{o.email}</span>}
              </span>
            </label>
          ))}

          {shown.length === 0 && (
            <div style={{ padding: '14px 10px', fontSize: 12, color: 'var(--c-text-3)', textAlign: 'center' }}>
              لا توجد نتائج
            </div>
          )}
        </div>
      )}
    </div>
  )
}
