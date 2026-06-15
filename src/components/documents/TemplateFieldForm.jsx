import { Plus, Trash2, ChevronDown } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeColumns(columns) {
  return (columns ?? []).map((col, i) => (
    typeof col === 'string'
      ? { key: `col_${i}`, label: col }
      : { key: col.key ?? `col_${i}`, label: col.label ?? col.key ?? `عمود ${i + 1}` }
  ))
}

/** Builds an empty `field_values` object matching a template's `fields_schema`. */
export function getInitialFieldValues(schema) {
  const values = {}
  for (const field of schema ?? []) {
    values[field.key] = field.type === 'table' ? [] : ''
  }
  return values
}

/** Client-side mirror of the server validation rules for `field_values`. */
export function validateFieldValues(schema, values) {
  const errors = {}
  for (const field of schema ?? []) {
    const v = values?.[field.key]

    if (field.type === 'table') {
      const rows = Array.isArray(v) ? v : []
      const colCount = normalizeColumns(field.columns).length
      if (field.required && rows.length === 0) {
        errors[field.key] = 'هذا الحقل مطلوب'
        continue
      }
      if (rows.some(row => !Array.isArray(row) || row.length !== colCount)) {
        errors[field.key] = 'تأكد من تعبئة جميع أعمدة الجدول'
      }
      continue
    }

    const isEmpty = v === undefined || v === null || v === ''
    if (field.required && isEmpty) {
      errors[field.key] = 'هذا الحقل مطلوب'
      continue
    }
    if (isEmpty) continue

    if (field.type === 'number' && Number.isNaN(Number(v))) {
      errors[field.key] = 'يجب أن تكون القيمة رقمًا'
    }
    if (field.type === 'date' && Number.isNaN(new Date(v).getTime())) {
      errors[field.key] = 'تاريخ غير صالح'
    }
    if (field.type === 'select' && field.options?.length && !field.options.includes(v)) {
      errors[field.key] = 'يرجى اختيار قيمة من القائمة'
    }
  }
  return errors
}

// ── Field primitives ──────────────────────────────────────────────────────────

function FieldWrap({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
    </div>
  )
}

function TextField({ value, onChange, type = 'text', error, placeholder }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '0 12px',
    }}>
      <input
        type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent', width: '100%',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: type === 'number' || type === 'date' ? 'left' : 'right',
          direction: type === 'number' || type === 'date' ? 'ltr' : 'rtl',
        }}
      />
    </div>
  )
}

function TextareaField({ value, onChange, error, rows = 3 }) {
  return (
    <div style={{
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '10px 12px',
    }}>
      <textarea
        value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
        style={{
          width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'vertical',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl',
        }}
      />
    </div>
  )
}

function SelectField({ value, onChange, options, error }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', height: 42, borderRadius: 10, boxSizing: 'border-box',
          border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
          background: 'var(--c-surface)', padding: '0 36px 0 12px',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          direction: 'rtl', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
        }}
      >
        <option value="">اختر...</option>
        {(options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <ChevronDown size={14} style={{
        position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--c-text-3)', pointerEvents: 'none',
      }} />
    </div>
  )
}

function TableField({ columns, value, onChange, error }) {
  const cols = normalizeColumns(columns)
  const rows = Array.isArray(value) ? value : []

  function updateCell(ri, ci, v) {
    const next = rows.map(r => [...r])
    next[ri][ci] = v
    onChange(next)
  }
  function addRow() {
    onChange([...rows, new Array(cols.length).fill('')])
  }
  function removeRow(ri) {
    onChange(rows.filter((_, i) => i !== ri))
  }

  const gridCols = `repeat(${cols.length}, 1fr) 36px`

  return (
    <div>
      <div style={{
        border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
        borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
        }}>
          {cols.map(c => (
            <div key={c.key} style={{
              padding: '8px 10px', fontSize: 11.5, fontWeight: 700,
              color: 'var(--c-text-2)', textAlign: 'center',
            }}>
              {c.label}
            </div>
          ))}
          <div />
        </div>

        {rows.length === 0 && (
          <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)' }}>
            لا توجد صفوف بعد
          </div>
        )}

        {rows.map((row, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid', gridTemplateColumns: gridCols,
              borderBottom: ri < rows.length - 1 ? '1px solid var(--c-border)' : 'none',
            }}
          >
            {cols.map((c, ci) => (
              <div key={c.key} style={{ borderInlineStart: ci > 0 ? '1px solid var(--c-border)' : 'none' }}>
                <input
                  value={row[ci] ?? ''}
                  onChange={e => updateCell(ri, ci, e.target.value)}
                  style={{
                    width: '100%', height: 38, border: 0, outline: 0, background: 'transparent',
                    boxSizing: 'border-box', padding: '0 8px', textAlign: 'center',
                    fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)',
                  }}
                />
              </div>
            ))}
            <button
              type="button" onClick={() => removeRow(ri)}
              style={{
                border: 0, background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button" onClick={addRow}
        style={{
          marginTop: 8, width: '100%', height: 36, borderRadius: 8,
          border: '1.5px dashed var(--c-border)', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
          fontSize: 12, fontWeight: 700, color: 'var(--c-text-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}
      >
        <Plus size={12} /> إضافة صف
      </button>
    </div>
  )
}

// ── Form ──────────────────────────────────────────────────────────────────────

/** Renders an editable form for a template's `fields_schema`, bound to `field_values`. */
export default function TemplateFieldForm({ schema, value, onChange, errors = {} }) {
  const set = (key, v) => onChange({ ...value, [key]: v })

  return (
    <div>
      {(schema ?? []).map(field => {
        const err = errors[field.key]
        const v = value?.[field.key]

        switch (field.type) {
          case 'textarea':
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <TextareaField value={v} onChange={x => set(field.key, x)} error={err} />
              </FieldWrap>
            )
          case 'select':
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <SelectField value={v} onChange={x => set(field.key, x)} options={field.options} error={err} />
              </FieldWrap>
            )
          case 'date':
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <TextField type="date" value={v} onChange={x => set(field.key, x)} error={err} />
              </FieldWrap>
            )
          case 'number':
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <TextField type="number" value={v} onChange={x => set(field.key, x)} error={err} />
              </FieldWrap>
            )
          case 'table':
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <TableField columns={field.columns} value={v} onChange={x => set(field.key, x)} error={err} />
              </FieldWrap>
            )
          default:
            return (
              <FieldWrap key={field.key} label={field.label} required={field.required} error={err}>
                <TextField value={v} onChange={x => set(field.key, x)} error={err} />
              </FieldWrap>
            )
        }
      })}
    </div>
  )
}
