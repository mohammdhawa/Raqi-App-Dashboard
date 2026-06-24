import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  LayoutTemplate, GripVertical, Pencil, Trash2, Plus, X,
  AlertCircle, Type, Hash, CalendarDays, AlignLeft,
  ChevronDown, LayoutGrid, Eye, Info,
} from 'lucide-react'
import Button from '../components/ui/Button'

// ── Field type registry ───────────────────────────────────────────────────────

const FIELD_TYPES = [
  { key: 'text',     label: 'نص',              icon: Type,         hint: 'سطر نصي قصير' },
  { key: 'number',   label: 'رقم',             icon: Hash,         hint: 'قيمة رقمية' },
  { key: 'date',     label: 'تاريخ',           icon: CalendarDays, hint: 'منتقي التاريخ' },
  { key: 'textarea', label: 'نص متعدد الأسطر', icon: AlignLeft,    hint: 'فقرة نصية' },
  { key: 'select',   label: 'اختيار',          icon: ChevronDown,  hint: 'قائمة خيارات' },
  { key: 'table',    label: 'جدول',            icon: LayoutGrid,   hint: 'جدول متعدد الصفوف' },
]

const FIELD_MAP = Object.fromEntries(FIELD_TYPES.map(t => [t.key, t]))

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(s) {
  return s.trim().toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/_+/g, '_')
}

// ── Primitive components ──────────────────────────────────────────────────────

function FieldWrap({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginRight: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ placeholder, value, onChange, mono, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      background: disabled ? 'var(--c-surface-2)' : 'var(--c-surface)',
      border: '1.5px solid var(--c-border)', borderRadius: 10, padding: '0 12px',
      opacity: disabled ? 0.7 : 1,
    }}>
      <input
        placeholder={placeholder} value={value} onChange={onChange} disabled={disabled}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent',
          fontFamily: mono ? "'Courier New', Courier, monospace" : 'var(--font-sans)',
          fontSize: 13, color: 'var(--c-text)', textAlign: 'right', direction: 'rtl',
        }}
      />
    </div>
  )
}

function TextareaInput({ placeholder, value, onChange, rows = 3 }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
      borderRadius: 10, padding: '10px 12px',
    }}>
      <textarea
        placeholder={placeholder} value={value} onChange={onChange} rows={rows}
        style={{
          width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl',
        }}
      />
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 999, cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--c-approved)' : 'var(--c-surface-2)',
        position: 'relative', transition: 'background .18s',
        border: `1px solid ${checked ? 'var(--c-approved)' : 'var(--c-border)'}`,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        insetInlineEnd: checked ? 2 : 'auto',
        insetInlineStart: checked ? 'auto' : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'all .18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </div>
  )
}

function RowBtn({ children, danger, onClick, title }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${danger && hov ? '#F4C9C6' : 'var(--c-border)'}`,
        background: danger && hov ? 'var(--c-rejected-bg)' : '#fff',
        color: danger && hov ? 'var(--c-rejected)' : 'var(--c-text-2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all .14s',
      }}
    >
      {children}
    </button>
  )
}

// ── Sortable field row ────────────────────────────────────────────────────────

function SortableField({ field, onEdit, onDelete }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: field.key })

  const ft = FIELD_MAP[field.type]
  const FieldIcon = ft?.icon ?? Type

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
        background: isDragging ? 'var(--c-surface)' : '#fff',
        borderBottom: '1px solid var(--c-border)',
        borderRadius: isDragging ? 10 : 0,
        boxShadow: isDragging ? 'var(--sh-card-lg)' : 'none',
        zIndex: isDragging ? 999 : 'auto',
      }}
    >
      <button
        {...attributes} {...listeners}
        style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', border: 'none', background: 'transparent',
          color: 'var(--c-text-3)', borderRadius: 6, flexShrink: 0, padding: 0,
        }}
      >
        <GripVertical size={15} />
      </button>

      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'var(--c-accent-tint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--c-accent)',
      }}>
        <FieldIcon size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 2 }}>
          {field.label}
        </div>
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: 'var(--c-text-3)' }}>
          {field.key}
        </div>
      </div>

      <span style={{
        fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
        background: 'var(--c-surface)', borderRadius: 7, padding: '3px 9px', whiteSpace: 'nowrap',
      }}>
        {ft?.label ?? field.type}
      </span>

      <span style={{
        fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap',
        color: field.required ? 'var(--c-rejected)' : 'var(--c-text-3)',
        background: field.required ? 'var(--c-rejected-bg)' : 'var(--c-surface)',
      }}>
        {field.required ? 'مطلوب' : 'اختياري'}
      </span>

      <div style={{ display: 'flex', gap: 6 }}>
        <RowBtn onClick={() => onEdit(field)} title="تعديل الحقل"><Pencil size={13} /></RowBtn>
        <RowBtn danger onClick={() => onDelete(field.key)} title="حذف الحقل"><Trash2 size={13} /></RowBtn>
      </div>
    </div>
  )
}

// ── Field panel (add / edit) ──────────────────────────────────────────────────

function FieldPanel({ initial, onSave, onCancel }) {
  const isEdit = !!initial
  const [step, setStep]         = useState(isEdit ? 'form' : 'pick')
  const [selectedType, setType] = useState(isEdit ? FIELD_MAP[initial.type] : null)
  const [label, setLabel]       = useState(initial?.label ?? '')
  const [key, setKey]           = useState(initial?.key ?? '')
  const [required, setRequired] = useState(initial?.required ?? false)
  const [options, setOptions]   = useState(initial?.options?.length ? initial.options : ['', ''])
  const [columns, setColumns]   = useState(initial?.columns?.length ? initial.columns : [{ key: '', label: '' }, { key: '', label: '' }])

  const handleLabelChange = e => {
    const v = e.target.value
    setLabel(v)
    if (!isEdit && (!key || key === slugify(label))) setKey(slugify(v))
  }

  const handleSave = () => {
    if (!label.trim() || !key.trim() || !selectedType) return
    const field = { key: key.trim(), label: label.trim(), type: selectedType.key, required }
    if (selectedType.key === 'select') {
      field.options = options.map(o => o.trim()).filter(Boolean)
    }
    if (selectedType.key === 'table') {
      field.columns = columns
        .filter(c => c.label.trim())
        .map(c => ({ key: c.key || slugify(c.label), label: c.label.trim() }))
    }
    onSave(field)
  }

  if (step === 'pick') {
    return (
      <div style={{
        border: '1.5px dashed var(--c-border)', borderRadius: 12,
        background: 'var(--c-surface)', padding: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 12 }}>
          اختر نوع الحقل:
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 8, marginBottom: 10 }}>
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon
            return (
              <button
                key={ft.key}
                onClick={() => { setType(ft); setStep('form') }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '12px 8px', borderRadius: 10,
                  border: '1.5px solid var(--c-border)', background: '#fff',
                  cursor: 'pointer', transition: 'all .14s', fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--c-accent)'
                  e.currentTarget.style.background = 'var(--c-accent-tint)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--c-border)'
                  e.currentTarget.style.background = '#fff'
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--c-accent-tint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-accent)',
                }}>
                  <Icon size={15} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text)' }}>{ft.label}</span>
                <span style={{ fontSize: 10, color: 'var(--c-text-3)', textAlign: 'center', lineHeight: 1.4 }}>
                  {ft.hint}
                </span>
              </button>
            )
          })}
        </div>
        <button
          onClick={onCancel}
          style={{
            width: '100%', padding: '8px', border: 'none', background: 'transparent',
            color: 'var(--c-text-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12,
          }}
        >
          إلغاء
        </button>
      </div>
    )
  }

  const Icon = selectedType?.icon ?? Type
  return (
    <div style={{
      border: '1.5px solid var(--c-accent)', borderRadius: 12,
      background: 'var(--c-accent-tint)', padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'rgba(200,163,107,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--c-accent)',
        }}>
          <Icon size={14} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
          {isEdit ? 'تعديل الحقل' : `حقل ${selectedType?.label}`}
        </span>
        {!isEdit && (
          <button
            onClick={() => setStep('pick')}
            style={{
              marginInlineStart: 'auto', border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--c-text-3)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
        <FieldWrap label="اسم الحقل" required>
          <TextInput
            placeholder="مثال: عنوان العقد"
            value={label}
            onChange={handleLabelChange}
          />
        </FieldWrap>
        <FieldWrap label="المفتاح (key)" required>
          <TextInput
            placeholder="contract_title"
            value={key}
            onChange={e => setKey(e.target.value)}
            mono
            disabled={isEdit}
          />
        </FieldWrap>
      </div>

      {/* Select options */}
      {selectedType?.key === 'select' && (
        <FieldWrap label="خيارات القائمة" required>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', height: 38,
                background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
                borderRadius: 10, padding: '0 10px',
              }}>
                <input
                  placeholder={`خيار ${i + 1}`}
                  value={opt}
                  onChange={e => {
                    const next = [...options]; next[i] = e.target.value; setOptions(next)
                  }}
                  style={{
                    flex: 1, border: 0, outline: 0, background: 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
                    textAlign: 'right', direction: 'rtl',
                  }}
                />
              </div>
              {options.length > 1 && (
                <button
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  style={{
                    width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                    border: '1px solid var(--c-border)', background: '#fff',
                    color: 'var(--c-text-3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setOptions([...options, ''])}
            style={{
              width: '100%', height: 34, borderRadius: 8,
              border: '1.5px dashed var(--c-border)', background: 'transparent',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 12, fontWeight: 700, color: 'var(--c-text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <Plus size={12} /> إضافة خيار
          </button>
        </FieldWrap>
      )}

      {/* Table columns */}
      {selectedType?.key === 'table' && (
        <FieldWrap label="أعمدة الجدول" required>
          {columns.map((col, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', height: 38,
                background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
                borderRadius: 10, padding: '0 10px',
              }}>
                <input
                  placeholder={`اسم العمود ${i + 1}`}
                  value={col.label}
                  onChange={e => {
                    const next = [...columns]
                    next[i] = { key: slugify(e.target.value), label: e.target.value }
                    setColumns(next)
                  }}
                  style={{
                    flex: 1, border: 0, outline: 0, background: 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
                    textAlign: 'right', direction: 'rtl',
                  }}
                />
              </div>
              {columns.length > 1 && (
                <button
                  onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                  style={{
                    width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                    border: '1px solid var(--c-border)', background: '#fff',
                    color: 'var(--c-text-3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setColumns([...columns, { key: '', label: '' }])}
            style={{
              width: '100%', height: 34, borderRadius: 8,
              border: '1.5px dashed var(--c-border)', background: 'transparent',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 12, fontWeight: 700, color: 'var(--c-text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <Plus size={12} /> إضافة عمود
          </button>
        </FieldWrap>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>مطلوب</span>
        <Toggle checked={required} onChange={setRequired} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" style={{ flex: 1, height: 40 }} onClick={handleSave}>
          <Plus size={14} />
          {isEdit ? 'حفظ التعديل' : 'إضافة الحقل'}
        </Button>
        <Button variant="ghost" style={{ height: 40 }} onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  )
}

// ── Edit field modal ──────────────────────────────────────────────────────────

function EditFieldModal({ field, onSave, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(20,32,50,0.42)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: 'min(460px, calc(100vw - 32px))', background: '#fff', borderRadius: 16,
        boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>تعديل الحقل</span>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--c-text-3)', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <FieldPanel
            initial={field}
            onSave={updated => { onSave(updated); onClose() }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}

// ── Live preview ──────────────────────────────────────────────────────────────

function LivePreview({ name, fields }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--c-border)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Eye size={15} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>معاينة مباشرة</span>
      </div>

      <div style={{ padding: 20 }}>
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 10, padding: '18px 16px',
          boxShadow: '0 1px 4px rgba(27,42,65,0.05)',
        }}>
          {/* Doc header */}
          <div style={{ marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--c-text)' }}>
              {name || 'اسم القالب'}
            </h3>
            <div style={{ height: 2.5, width: 52, background: 'var(--c-accent)', borderRadius: 2, marginTop: 6 }} />
          </div>

          {fields.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--c-text-3)', fontSize: 12 }}>
              أضف حقولاً لرؤية المعاينة
            </div>
          )}

          {fields.map(field => {
            const ft = FIELD_MAP[field.type]
            const Icon = ft?.icon ?? Type
            return (
              <div key={field.key} style={{ marginBottom: 13 }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 5,
                }}>
                  <Icon size={11} style={{ color: 'var(--c-text-3)' }} />
                  {field.label}
                  {field.required && <span style={{ color: 'var(--c-rejected)' }}>*</span>}
                </label>

                {field.type === 'textarea' && (
                  <div style={{
                    height: 72, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 8, padding: '8px 10px',
                    fontSize: 11.5, color: 'var(--c-text-3)', direction: 'rtl',
                  }}>
                    فقرة نصية...
                  </div>
                )}

                {field.type === 'table' && (
                  <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
                    {(field.columns?.length > 0) ? (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${field.columns.length}, 1fr)`,
                          background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)',
                        }}>
                          {field.columns.map(col => (
                            <div key={col.key} style={{
                              padding: '6px 10px', fontSize: 10.5, fontWeight: 700,
                              color: 'var(--c-text-2)', textAlign: 'center',
                            }}>
                              {col.label}
                            </div>
                          ))}
                        </div>
                        <div style={{ height: 32, background: '#fff' }} />
                      </>
                    ) : (
                      <div style={{ padding: '10px', fontSize: 11, color: 'var(--c-text-3)', textAlign: 'center' }}>
                        لم تُحدَّد أعمدة بعد
                      </div>
                    )}
                  </div>
                )}

                {field.type === 'select' && (
                  <div style={{
                    height: 36, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 8, padding: '0 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                      {field.options?.length ? field.options[0] : `اختر ${field.label}...`}
                    </span>
                    <ChevronDown size={12} style={{ color: 'var(--c-text-3)' }} />
                  </div>
                )}

                {field.type === 'date' && (
                  <div style={{
                    height: 36, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 8, padding: '0 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>يوم / شهر / سنة</span>
                    <CalendarDays size={12} style={{ color: 'var(--c-text-3)' }} />
                  </div>
                )}

                {(field.type === 'text' || field.type === 'number') && (
                  <div style={{
                    height: 36, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 8, padding: '0 10px', display: 'flex', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                      {field.type === 'number' ? '0.00' : 'سطر نصي قصير'}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function BuilderSkeleton() {
  const p = {
    animation: 'pulse 1.5s ease-in-out infinite',
    background: 'var(--c-surface-2)', borderRadius: 8,
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]" style={{ gap: 24, alignItems: 'start' }}>
      <div>
        <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ ...p, height: 16, width: 140, marginBottom: 20 }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...p, height: 42, marginBottom: 14, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ ...p, height: 16, width: 100 }} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ ...p, width: 24, height: 24, borderRadius: 6 }} />
              <div style={{ ...p, width: 38, height: 38, borderRadius: 10 }} />
              <div style={{ flex: 1 }}>
                <div style={{ ...p, height: 13, width: 120, marginBottom: 6 }} />
                <div style={{ ...p, height: 10, width: 80 }} />
              </div>
              <div style={{ ...p, height: 26, width: 48, borderRadius: 7 }} />
              <div style={{ ...p, height: 26, width: 56, borderRadius: 7 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'sticky', top: 84 }}>
        <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 14, padding: 24 }}>
          <div style={{ ...p, height: 16, width: 120, marginBottom: 20 }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ ...p, height: 36, marginBottom: 12, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplateBuilderPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const toast    = useToast()

  const [template, setTemplate]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showAddPanel, setShowAdd] = useState(false)
  const [editingField, setEditing] = useState(null)

  const [settings, setSettings] = useState({
    name: '', slug: '', type: '', layout_key: '', description: '', is_active: true,
  })
  const setSetting = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const [fields, setFields] = useState([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/document-templates/${id}`)
      const tpl = res.data.template ?? res.data
      setTemplate(tpl)
      setSettings({
        name:        tpl.name        ?? '',
        slug:        tpl.slug        ?? '',
        type:        tpl.type        ?? '',
        layout_key:  tpl.layout_key  ?? '',
        description: tpl.description ?? '',
        is_active:   tpl.is_active   ?? true,
      })
      setFields(tpl.fields_schema ?? [])
      window.dispatchEvent(new CustomEvent('topbar:builder-name', { detail: { name: tpl.name } }))
    } catch {
      navigate('/admin/templates')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => { load() }, [load])

  // Keep topbar breadcrumb in sync with name
  useEffect(() => {
    if (settings.name) {
      window.dispatchEvent(new CustomEvent('topbar:builder-name', { detail: { name: settings.name } }))
    }
  }, [settings.name])

  // ── Save — ref pattern avoids stale closure in event listener ──────────────

  const handleSave = async () => {
    setSaveError('')
    if (fields.length === 0) {
      setSaveError('أضف حقلاً واحداً على الأقل قبل الحفظ.')
      return
    }
    setSaving(true)
    try {
      const payload = { ...settings, fields_schema: fields }
      const res = await api.patch(`/admin/document-templates/${id}`, payload)
      const updated = res.data.template ?? res.data
      setTemplate(updated)
      toast.success('تم حفظ القالب بنجاح')
    } catch (e) {
      const errs = e.response?.data?.errors
      setSaveError(errs
        ? Object.values(errs).flat().join(' — ')
        : e.response?.data?.message ?? 'حدث خطأ أثناء الحفظ.')
    } finally {
      setSaving(false)
    }
  }

  const saveRef = useRef(handleSave)
  useEffect(() => { saveRef.current = handleSave })

  useEffect(() => {
    const h = () => saveRef.current()
    window.addEventListener('topbar:builder-save', h)
    return () => window.removeEventListener('topbar:builder-save', h)
  }, [])

  // ── DnD ────────────────────────────────────────────────────────────────────

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setFields(fs => {
      const oi = fs.findIndex(f => f.key === active.id)
      const ni = fs.findIndex(f => f.key === over.id)
      return arrayMove(fs, oi, ni)
    })
  }

  // ── Field actions ──────────────────────────────────────────────────────────

  const handleAddField = f => { setFields(fs => [...fs, f]); setShowAdd(false) }
  const handleUpdateField = f => { setFields(fs => fs.map(x => x.key === f.key ? f : x)); setEditing(null) }
  const handleDeleteField = key => setFields(fs => fs.filter(f => f.key !== key))

  const nextVersion = (template?.version ?? 1) + 1

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1320, margin: '0 auto' }}>

      {/* Page title area */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.4 }}>
            تعديل قالب: {settings.name || '...'}
          </h1>
          {template?.version && (
            <span style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 12, fontWeight: 700, color: 'var(--c-primary)',
              background: 'var(--c-primary-light)', borderRadius: 8, padding: '3px 10px',
            }}>
              v{template.version}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: settings.is_active ? 'var(--c-approved)' : 'var(--c-text-3)',
            boxShadow: settings.is_active
              ? '0 0 0 3px var(--c-approved-bg)'
              : '0 0 0 3px var(--c-surface-2)',
          }} />
          <span style={{
            fontSize: 12.5, fontWeight: 600,
            color: settings.is_active ? 'var(--c-approved)' : 'var(--c-text-3)',
          }}>
            {settings.is_active ? 'القالب فعّال' : 'القالب معطّل'}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)' }}>
          عرّف حقول القالب وترتيبها — يستخدمها المنشئون عند إنشاء مستند من هذا النوع.
        </p>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div style={{
          display: 'flex', gap: 9, alignItems: 'flex-start',
          padding: '10px 16px', marginBottom: 16,
          background: 'var(--c-rejected-bg)', border: '1px solid #F4C9C6',
          borderRadius: 10, fontSize: 12.5, color: 'var(--c-rejected)', lineHeight: 1.6,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          {saveError}
          <button
            onClick={() => setSaveError('')}
            style={{
              marginInlineStart: 'auto', border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--c-rejected)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Builder grid */}
      {loading ? <BuilderSkeleton /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]" style={{ gap: 24, alignItems: 'start' }}>

          {/* ── Left column ── */}
          <div>

            {/* Settings card */}
            <div style={{
              background: '#fff', border: '1px solid var(--c-border)',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: 'var(--sh-card)', marginBottom: 20,
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <LayoutTemplate size={15} style={{ color: 'var(--c-primary)' }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>إعدادات القالب</span>
              </div>

              <div style={{ padding: 20 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
                  <FieldWrap label="اسم القالب" required>
                    <TextInput
                      placeholder="عقد توريد"
                      value={settings.name}
                      onChange={e => setSetting('name', e.target.value)}
                    />
                  </FieldWrap>
                  <FieldWrap label="المعرّف (slug)" required>
                    <TextInput
                      placeholder="supply-contract"
                      value={settings.slug}
                      onChange={e => setSetting('slug', e.target.value)}
                      mono
                    />
                  </FieldWrap>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
                  <FieldWrap label="النوع" required>
                    <TextInput
                      placeholder="عقد"
                      value={settings.type}
                      onChange={e => setSetting('type', e.target.value)}
                    />
                  </FieldWrap>
                  <FieldWrap label="مفتاح التخطيط (layout_key)" required>
                    <TextInput
                      placeholder="contract_standard"
                      value={settings.layout_key}
                      onChange={e => setSetting('layout_key', e.target.value)}
                      mono
                    />
                  </FieldWrap>
                </div>

                <FieldWrap label="الوصف">
                  <TextareaInput
                    placeholder="وصف اختياري للقالب..."
                    value={settings.description}
                    onChange={e => setSetting('description', e.target.value)}
                    rows={3}
                  />
                </FieldWrap>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0 0', borderTop: '1px solid var(--c-border)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>القالب فعّال</div>
                    <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>
                      يظهر القالب للمنشئين عند إنشاء مستند جديد
                    </div>
                  </div>
                  <Toggle checked={settings.is_active} onChange={v => setSetting('is_active', v)} />
                </div>

                {/* Version increment note */}
                <div style={{
                  display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 16,
                  padding: '10px 12px',
                  background: 'var(--c-accent-tint)',
                  border: '1px solid rgba(200,163,107,0.3)',
                  borderRadius: 10, fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.65,
                }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--c-accent)' }} />
                  أي تعديل على الحقول يرفع رقم النسخة تلقائياً إلى v{nextVersion} مع الحفاظ على المستندات المرتبطة بالنسخ السابقة.
                </div>
              </div>
            </div>

            {/* Fields card */}
            <div style={{
              background: '#fff', border: '1px solid var(--c-border)',
              borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--sh-card)',
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>حقول القالب</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
                  background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
                }}>
                  {fields.length} حقول
                </span>
              </div>

              {/* Sortable list */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map(f => f.key)}
                  strategy={verticalListSortingStrategy}
                >
                  {fields.length === 0 && !showAddPanel && (
                    <div style={{
                      padding: '32px 20px', textAlign: 'center',
                      color: 'var(--c-text-3)', fontSize: 13,
                    }}>
                      لا توجد حقول بعد — أضف حقلاً أدناه
                    </div>
                  )}
                  {fields.map(field => (
                    <SortableField
                      key={field.key}
                      field={field}
                      onEdit={setEditing}
                      onDelete={handleDeleteField}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add field area */}
              <div style={{ padding: 16 }}>
                {showAddPanel ? (
                  <FieldPanel
                    onSave={handleAddField}
                    onCancel={() => setShowAdd(false)}
                  />
                ) : (
                  <button
                    onClick={() => setShowAdd(true)}
                    style={{
                      width: '100%', height: 44, borderRadius: 10,
                      border: '1.5px dashed var(--c-border)', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'all .14s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--c-accent)'
                      e.currentTarget.style.color = 'var(--c-accent)'
                      e.currentTarget.style.background = 'var(--c-accent-tint)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--c-border)'
                      e.currentTarget.style.color = 'var(--c-text-2)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Plus size={15} />
                    إضافة حقل
                  </button>
                )}
              </div>

              {/* Footer save row */}
              <div style={{
                padding: '14px 16px', borderTop: '1px solid var(--c-border)',
                display: 'flex', gap: 10,
              }}>
                <Button variant="primary" style={{ height: 44, flex: 1 }} onClick={handleSave}>
                  {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </Button>
                <Button variant="ghost" style={{ height: 44 }} onClick={() => navigate('/admin/templates')}>
                  العودة للقوالب
                </Button>
              </div>
            </div>
          </div>

          {/* ── Right column — sticky live preview ── */}
          <div style={{ position: 'sticky', top: 84 }}>
            <LivePreview name={settings.name} fields={fields} />
          </div>
        </div>
      )}

      {/* Edit field modal */}
      {editingField && (
        <EditFieldModal
          field={editingField}
          onSave={handleUpdateField}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
