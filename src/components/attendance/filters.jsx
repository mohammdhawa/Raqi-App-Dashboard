// Shared attendance filter controls, reused by the attendance list
// (AttendancePage) and the daily report (AttendanceReportPage). Section options
// are dependent on the chosen department (the backend returns 422 if a
// section_id doesn't belong to the department_id) — see useDeptSections.

import { useState, useEffect } from 'react'
import { Building2, Layers, Search, X } from 'lucide-react'

const controlStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 150,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

export function DepartmentSelect({ departments, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Building2 size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ ...controlStyle, color: value ? 'var(--c-text)' : 'var(--c-text-2)' }}
      >
        <option value="">الإدارة: الكل</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  )
}

// Dependent on a selected department; disabled (and greyed) until one is chosen.
export function SectionSelect({ sections, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Layers size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      <select
        value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        title={disabled ? 'اختر الإدارة أولاً' : undefined}
        style={{
          ...controlStyle,
          color: value ? 'var(--c-text)' : 'var(--c-text-2)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          background: disabled ? 'var(--c-surface)' : '#fff',
        }}
      >
        <option value="">القسم: الكل</option>
        {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )
}

// Name/email search box with built-in debounce, so callers can wire the
// committed value straight into their fetch dependencies. `onChange` is expected
// to be a stable state setter (it's only invoked from the debounce timer/clear).
export function SearchInput({ value, onChange, placeholder = 'بحث بالاسم أو البريد...', delay = 350 }) {
  const [text, setText] = useState(value ?? '')

  // Keep local text in sync when the committed value is cleared externally.
  useEffect(() => { setText(value ?? '') }, [value])

  useEffect(() => {
    const t = setTimeout(() => { onChange(text) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      height: 38, padding: '0 10px', borderRadius: 10, minWidth: 200,
      background: '#fff', border: '1px solid var(--c-border)',
    }}>
      <Search size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      <input
        value={text} onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent',
          fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
        }}
      />
      {text && (
        <button
          type="button" onClick={() => setText('')}
          title="مسح البحث"
          style={{
            display: 'inline-flex', border: 0, background: 'transparent',
            color: 'var(--c-text-3)', cursor: 'pointer', padding: 0, flexShrink: 0,
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
