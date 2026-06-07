import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  Layers, Users, Search, Pencil, Trash2, Upload,
  X, AlertCircle, Building2, Eye, ImageOff, ChevronDown, AlertTriangle,
} from 'lucide-react'
import Button from '../components/ui/Button'

// ── Primitive components ──────────────────────────────────────────────────────

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

function DrawerSection({ icon: Icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 22 }}>
      {Icon && <Icon size={15} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />}
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
    </div>
  )
}

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

function TextInput({ placeholder, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
      borderRadius: 10, padding: '0 12px',
    }}>
      <input
        placeholder={placeholder} value={value} onChange={onChange}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl',
        }}
      />
    </div>
  )
}

function SelectInput({ placeholder, value, onChange, options, disabled }) {
  return (
    <select
      value={value} onChange={onChange} disabled={disabled}
      style={{
        width: '100%', height: 42, border: '1.5px solid var(--c-border)',
        borderRadius: 10, padding: '0 12px', background: 'var(--c-surface)',
        fontFamily: 'var(--font-sans)', fontSize: 13,
        color: value ? 'var(--c-text)' : 'var(--c-text-3)',
        outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        direction: 'rtl', opacity: disabled ? 0.6 : 1,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── Stamp preview modal ───────────────────────────────────────────────────────

function StampPreviewModal({ section, onClose }) {
  const hasStamp = Boolean(section.stamp)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(20,32,50,0.48)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380, background: '#fff', borderRadius: 18,
          boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Layers size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <span style={{
              fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              ختم {section.name}
            </span>
          </div>
          <button
            onClick={onClose} title="إغلاق"
            style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--c-surface)', minHeight: 220,
        }}>
          {hasStamp ? (
            <div style={{
              width: 160, height: 160, borderRadius: '50%',
              border: '1.5px dashed var(--c-accent)',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.85)',
            }}>
              <img
                src={section.stamp} alt={section.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <ImageOff size={26} style={{ color: 'var(--c-text-3)', marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
                لم يتم رفع ختم لهذا القسم بعد
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stamp upload zone ─────────────────────────────────────────────────────────

function StampUpload({ file, existingUrl, onChange }) {
  const inputRef = useRef()
  const [dragOver, setDragOver] = useState(false)
  const preview = file ? URL.createObjectURL(file) : existingUrl ?? null

  const handleDrop = e => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) onChange(f)
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          height: 110, borderRadius: 12, cursor: 'pointer',
          border: `2px dashed ${dragOver ? 'var(--c-accent)' : 'var(--c-border)'}`,
          background: dragOver ? 'rgba(200,163,107,0.05)' : 'var(--c-surface)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, transition: 'border-color .15s, background .15s',
        }}
      >
        {preview ? (
          <img
            src={preview} alt=""
            style={{ maxHeight: 76, maxWidth: '80%', objectFit: 'contain', borderRadius: 8 }}
          />
        ) : (
          <>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'var(--c-surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--c-text-3)',
            }}>
              <Upload size={16} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
                اسحب وأفلت أو انقر للرفع
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 3 }}>
                PNG, JPG, GIF — بحد أقصى 2MB
              </div>
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg,image/gif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f) }}
      />
      {preview && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange(null) }}
          style={{
            marginTop: 6, border: 0, background: 'transparent',
            fontSize: 11.5, color: 'var(--c-text-3)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          × إزالة الصورة
        </button>
      )}
    </div>
  )
}

// ── Section Drawer (create + edit) ────────────────────────────────────────────

function SectionDrawer({ mode, section, departments, onClose, onSave }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState({
    department_id: section?.department?.id ?? '',
    name:          section?.name ?? '',
    stamp:         null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setError('')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('department_id', form.department_id)
      fd.append('name', form.name)
      if (form.stamp instanceof File) fd.append('stamp', form.stamp)

      if (isEdit) {
        // Laravel doesn't parse multipart bodies on PATCH/PUT requests, so the
        // stamp file would be silently dropped — spoof the method via POST instead.
        fd.append('_method', 'PATCH')
        await api.post(`/admin/sections/${section.id}`, fd)
      } else {
        await api.post('/admin/sections', fd)
      }
      onSave()
    } catch (e) {
      const errs = e.response?.data?.errors
      setError(errs
        ? Object.values(errs).flat().join(' — ')
        : e.response?.data?.message ?? 'حدث خطأ. يرجى المحاولة مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  const deptOptions = departments.map(d => ({ value: d.id, label: d.name }))

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 39,
          background: 'rgba(20,32,50,0.42)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, bottom: 0, insetInlineStart: 0,
        width: 520, background: '#fff', zIndex: 40,
        boxShadow: '-14px 0 40px rgba(20,32,50,0.22)',
        display: 'flex', flexDirection: 'column',
        borderInlineEnd: '1px solid var(--c-border)',
      }}>
        {/* Head */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, position: 'relative' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, color: 'var(--c-accent)', textTransform: 'uppercase', marginBottom: 6 }}>
            {isEdit ? 'تعديل قسم' : 'إضافة قسم'}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.4 }}>
            {isEdit ? 'تعديل القسم' : 'إضافة قسم'}
          </h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {isEdit
              ? 'عدّل بيانات القسم أو استبدل ختمه الرسمي.'
              : 'حدّد الإدارة واسم القسم وارفع ختمه الرسمي.'}
          </p>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', insetInlineStart: 18, top: 18,
              width: 34, height: 34, borderRadius: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              color: 'var(--c-text-2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <DrawerSection icon={Building2} label="بيانات القسم" />

          <FieldWrap label="الإدارة" required>
            <SelectInput
              placeholder="اختر الإدارة"
              value={form.department_id}
              onChange={e => set('department_id', e.target.value)}
              options={deptOptions}
            />
          </FieldWrap>

          <FieldWrap label="اسم القسم" required>
            <TextInput
              placeholder="مثال: الاستشارات القانونية"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </FieldWrap>

          <DrawerSection icon={Upload} label="ختم القسم" />

          <StampUpload
            file={form.stamp instanceof File ? form.stamp : null}
            existingUrl={isEdit ? (section?.stamp ?? null) : null}
            onChange={f => set('stamp', f)}
          />
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--c-border)', background: '#fff' }}>
          {error && (
            <div style={{
              display: 'flex', gap: 9, alignItems: 'flex-start',
              padding: '10px 24px', background: 'var(--c-rejected-bg)',
              borderBottom: '1px solid #F4C9C6',
              fontSize: 12.5, color: 'var(--c-rejected)', lineHeight: 1.6,
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              {error}
            </div>
          )}
          <div style={{ padding: '16px 24px', display: 'flex', gap: 10 }}>
            <Button variant="primary" style={{ flex: 1, height: 46 }} onClick={handleSubmit}>
              {saving ? '...' : isEdit ? 'حفظ التعديلات' : '+ إنشاء القسم'}
            </Button>
            <Button variant="ghost" style={{ flex: 1, height: 46 }} onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Delete Section Modal ──────────────────────────────────────────────────────

function DeleteSectionModal({ section, onClose, onDeleted }) {
  const [phase, setPhase]     = useState('confirm')
  const [deleting, setDel]    = useState(false)
  const [blockedUsers, setBlockedUsers] = useState(0)

  const handleDelete = async () => {
    setDel(true)
    try {
      await api.delete(`/admin/sections/${section.id}`)
      onDeleted()
    } catch (e) {
      if (e.response?.status === 422) {
        setBlockedUsers(section.users_count ?? 0)
        setPhase('blocked')
      }
    } finally {
      setDel(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(20,32,50,0.48)',
      backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: 440, background: '#fff', borderRadius: 18,
        boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
      }}>
        {phase === 'blocked' ? (
          <>
            <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
              }}>
                <AlertTriangle size={26} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
                لا يمكن حذف القسم
              </h3>
              <p style={{ margin: '0 auto 16px', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
                يجب أولاً نقل الموظفين المرتبطين بهذا القسم أو إزالتهم قبل أن تتمكن من حذفه.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
                padding: '5px 12px', borderRadius: 999, background: 'var(--c-surface)',
                border: '1px solid var(--c-border)', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
              }}>
                <Layers size={12} />
                {section.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999, background: 'var(--c-surface)',
                  border: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)',
                }}>
                  <Users size={11} />
                  {blockedUsers} موظفاً مرتبطاً
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 10, padding: '14px 20px',
              borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
            }}>
              <Button variant="ghost" style={{ flex: 1, height: 44 }} onClick={onClose}>
                إغلاق
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
              }}>
                <Trash2 size={26} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
                حذف القسم؟
              </h3>
              <p style={{ margin: '0 auto 16px', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
                سيتم حذف هذا القسم نهائياً وإزالة ختمه. لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999, background: 'var(--c-surface)',
                border: '1px solid var(--c-border)', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
              }}>
                <Layers size={12} />
                {section.name}
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 10, padding: '14px 20px',
              borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
            }}>
              <Button variant="danger" style={{ flex: 1, height: 44 }} onClick={handleDelete}>
                {deleting ? '...' : <><Trash2 size={14} style={{ marginLeft: 6 }} /> حذف نهائي</>}
              </Button>
              <Button variant="ghost" style={{ flex: 1, height: 44 }} onClick={onClose}>
                إلغاء
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)', borderRadius: 7 }
  return (
    <tr>
      {[130, 110, 60, 70, 80].map((w, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: 14, width: w, animationDelay: `${i * 0.1}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Section Row (separated to avoid hook-in-loop) ─────────────────────────────

function SectionRow({ section, last, onEdit, onDelete, onPreview }) {
  const [hov, setHov] = useState(false)
  const hasStamp = Boolean(section.stamp)

  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      {/* Section name + code */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{section.name}</div>
        {section.code && (
          <div style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 11, color: 'var(--c-text-3)', marginTop: 2,
          }}>
            {section.code}
          </div>
        )}
      </td>

      {/* Department pill */}
      <td style={{ padding: '12px 16px' }}>
        {section.department ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 8,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)',
            whiteSpace: 'nowrap',
          }}>
            <Building2 size={11} style={{ color: 'var(--c-text-3)' }} />
            {section.department.name}
          </div>
        ) : <span style={{ color: 'var(--c-text-3)', fontSize: 13 }}>—</span>}
      </td>

      {/* Employees count */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--c-text-2)' }}>
          <Users size={13} style={{ color: 'var(--c-text-3)' }} />
          {section.users_count ?? 0}
        </div>
      </td>

      {/* Stamp status */}
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700,
          color: hasStamp ? 'var(--c-approved)' : 'var(--c-text-3)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: hasStamp ? 'var(--c-approved)' : 'var(--c-text-3)',
            boxShadow: hasStamp ? '0 0 0 3px var(--c-approved-bg)' : '0 0 0 3px var(--c-surface-2)',
          }} />
          {hasStamp ? 'مرفوع' : 'بدون ختم'}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <RowBtn onClick={onPreview} title={hasStamp ? 'معاينة الختم' : 'لا يوجد ختم لمعاينته'}>
            <Eye size={14} />
          </RowBtn>
          <RowBtn onClick={onEdit} title="تعديل القسم">
            <Pencil size={14} />
          </RowBtn>
          <RowBtn danger onClick={onDelete} title="حذف القسم">
            <Trash2 size={14} />
          </RowBtn>
        </div>
      </td>
    </tr>
  )
}

// ── Pagination button ─────────────────────────────────────────────────────────

function PagBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: active ? 'none' : '1px solid var(--c-border)',
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : disabled ? 'var(--c-text-3)' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontWeight: active ? 700 : 400,
        fontSize: active ? 12.5 : 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABLE_COLS = ['القسم', 'الإدارة', 'عدد الموظفين', 'حالة الختم', 'إجراءات']

export default function SectionsPage() {
  const toast = useToast()
  const [sections, setSections]     = useState([])
  const [departments, setDepts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [lastPage, setLastPage]     = useState(1)
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [searchParams] = useSearchParams()
  const [deptFilter, setDeptFilter] = useState(
    () => searchParams.get('department_id') ?? ''
  )
  const [drawer, setDrawer]         = useState(null)
  const [deleteTarget, setDel]      = useState(null)
  const [previewTarget, setPreview] = useState(null)

  // ── API ────────────────────────────────────────────────────────────────────

  const fetchSections = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const params = { page: targetPage }
      if (search)     params.search        = search
      if (deptFilter) params.department_id = deptFilter
      const res = await api.get('/admin/sections', { params })
      const pag = res.data.sections
      const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
      setSections(list)
      setPage(pag?.current_page ?? targetPage)
      setLastPage(pag?.last_page ?? 1)
      setTotal(pag?.total ?? list.length)
    } catch {
      setSections([])
    } finally {
      setLoading(false)
    }
  }, [search, deptFilter, page])

  const fetchDepts = useCallback(async () => {
    try {
      const res = await api.get('/admin/departments')
      const raw = res.data.departments
      setDepts(raw?.data ?? (Array.isArray(raw) ? raw : []))
    } catch { /* leave empty */ }
  }, [])

  useEffect(() => {
    setPage(1)
    fetchSections(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, deptFilter])

  useEffect(() => { fetchSections(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDepts() }, [fetchDepts])

  // Topbar "+ قسم جديد" button
  useEffect(() => {
    const handler = () => setDrawer({ mode: 'create' })
    window.addEventListener('topbar:action', handler)
    return () => window.removeEventListener('topbar:action', handler)
  }, [])

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { fetchSections(page); fetchDepts() }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchSections, fetchDepts, page])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const stampsUploaded = sections.filter(s => s.stamp).length

  const metrics = [
    { Icon: Upload, label: 'ختماً مرفوعاً', value: stampsUploaded },
    { Icon: Layers, label: 'قسماً',          value: total },
  ]

  const handleSave    = () => { toast.success(drawer?.mode === 'edit' ? 'تم تعديل القسم بنجاح' : 'تم إنشاء القسم بنجاح'); setDrawer(null); fetchSections(page) }
  const handleDeleted = () => { toast.success('تم حذف القسم بنجاح'); setDel(null); fetchSections(page) }

  const handleRowEdit = section => setDrawer({ mode: 'edit', section })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الأقسام
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          الأقسام التابعة للإدارات، ولكل قسم ختمه الرسمي المعتمد على المستندات.
        </p>

        {/* Metric strip */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {metrics.map(({ Icon, label, value }) => (
            <div key={label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              background: '#fff', border: '1px solid var(--c-border)',
              borderRadius: 12, padding: '9px 14px',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-surface)', color: 'var(--c-primary)',
              }}>
                <Icon size={15} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.3, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)', fontWeight: 600, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Layers size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>قائمة الأقسام</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {total} معروضة
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Dept filter */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              style={{
                height: 38, paddingRight: 10, paddingLeft: 32, borderRadius: 10,
                background: '#fff', border: '1px solid var(--c-border)',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
                color: deptFilter ? 'var(--c-text)' : 'var(--c-text-2)',
                cursor: 'pointer', direction: 'rtl', minWidth: 140, outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              <option value="">الإدارة: الكل</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown size={13} style={{
              position: 'absolute', left: 10, color: 'var(--c-text-3)', pointerEvents: 'none',
            }} />
          </div>

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 38, minWidth: 200,
          }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم القسم..."
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {TABLE_COLS.map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: 'right',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3].map(i => <SkeletonRow key={i} />)
                : sections.map((s, idx) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    last={idx === sections.length - 1}
                    onEdit={() => handleRowEdit(s)}
                    onDelete={() => setDel(s)}
                    onPreview={() => setPreview(s)}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && sections.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Layers size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {search || deptFilter ? 'لا توجد نتائج مطابقة' : 'لا توجد أقسام بعد'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1}       onClick={() => setPage(p => p - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>›</PagBtn>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawer && (
        <SectionDrawer
          mode={drawer.mode}
          section={drawer.section}
          departments={departments}
          onClose={() => setDrawer(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteSectionModal
          section={deleteTarget}
          onClose={() => setDel(null)}
          onDeleted={handleDeleted}
        />
      )}

      {/* Stamp preview modal */}
      {previewTarget && (
        <StampPreviewModal
          section={previewTarget}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
