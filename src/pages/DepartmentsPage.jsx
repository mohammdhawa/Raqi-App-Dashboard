import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  Layers, Building2, Users, Search, Pencil, Trash2,
  X, AlertTriangle, AlertCircle, LayoutGrid,
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

function FieldWrap({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginRight: 3 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--c-text-3)', lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function TextInput({ placeholder, value, onChange, mono }) {
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
          fontFamily: mono ? "'Courier New', Courier, monospace" : 'var(--font-sans)',
          fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl',
          letterSpacing: mono ? 0.5 : 'normal',
        }}
      />
    </div>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '18px 16px 14px' }}>
        <div style={{ ...pulse, width: 52, height: 12, borderRadius: 6, marginBottom: 18 }} />
        <div style={{ ...pulse, width: 46, height: 46, borderRadius: 13, marginBottom: 12 }} />
        <div style={{ ...pulse, width: '65%', height: 14, borderRadius: 7 }} />
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px dashed var(--c-border)' }}>
        <div style={{ ...pulse, width: '55%', height: 12, borderRadius: 6 }} />
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 6 }}>
        <div style={{ ...pulse, flex: 1, height: 34, borderRadius: 9 }} />
        <div style={{ ...pulse, flex: 1, height: 34, borderRadius: 9 }} />
        <div style={{ ...pulse, width: 32, height: 34, borderRadius: 9 }} />
      </div>
    </div>
  )
}

// ── Dept Card ────────────────────────────────────────────────────────────────

function DeptCard({ dept, onEdit, onDelete, onSections }) {
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
        overflow: 'hidden', position: 'relative',
        boxShadow: hov ? 'var(--sh-card-lg)' : 'var(--sh-card)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow .18s, transform .18s',
      }}
    >
      {/* Top content area */}
      <div style={{ padding: '18px 16px 14px', position: 'relative', overflow: 'hidden' }}>
        {/* Radial gradient decoration — top-right corner (physical) */}
        <div style={{
          position: 'absolute', top: -36, right: -36, width: 110, height: 110,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(200,163,107,0.22) 0%, transparent 68%)',
        }} />

        {/* Code badge — top-left (physical) */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
          background: 'rgba(200,163,107,0.13)',
          color: '#8A6A23',
          border: '1px solid rgba(200,163,107,0.3)',
          borderRadius: 7, padding: '2px 8px',
        }}>
          {dept.code}
        </div>

        {/* Icon box */}
        <div style={{
          width: 46, height: 46, borderRadius: 13, marginBottom: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--c-primary) 0%, var(--c-primary-grad) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LayoutGrid size={20} style={{ color: 'var(--c-accent)' }} />
        </div>

        {/* Department name */}
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.3 }}>
          {dept.name}
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        padding: '10px 16px', display: 'flex', gap: 18,
        borderTop: '1px dashed var(--c-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Users size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 600 }}>
            <strong style={{ color: 'var(--c-text)', fontWeight: 800 }}>{dept.users_count ?? 0}</strong>
            {' '}موظف
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Layers size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 600 }}>
            <strong style={{ color: 'var(--c-text)', fontWeight: 800 }}>{dept.sections_count ?? 0}</strong>
            {' '}أقسام
          </span>
        </div>
      </div>

      {/* Action buttons row */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--c-border)',
        display: 'flex', gap: 6,
      }}>
        <CardBtn icon={<Layers size={13} />} label="الأقسام" onClick={onSections} primary />
        <CardBtn icon={<Pencil size={13} />} label="تعديل" onClick={onEdit} />
        <RowBtn danger onClick={onDelete} title="حذف الإدارة">
          <Trash2 size={14} />
        </RowBtn>
      </div>
    </div>
  )
}

function CardBtn({ icon, label, onClick, primary }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, height: 34, borderRadius: 9,
        border: `1px solid ${hov && primary ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: hov && primary ? 'var(--c-primary-light)' : hov ? 'var(--c-surface)' : '#fff',
        color: primary ? 'var(--c-primary)' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        cursor: 'pointer', transition: 'all .14s',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Dept Drawer (create + edit) ───────────────────────────────────────────────

function DeptDrawer({ mode, dept, onClose, onSave }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({ name: dept?.name ?? '', code: dept?.code ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setError('')
    setSaving(true)
    try {
      if (isEdit) {
        await api.patch(`/admin/departments/${dept.id}`, form)
      } else {
        await api.post('/admin/departments', form)
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
            {isEdit ? 'تعديل إدارة' : 'إضافة إدارة'}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.4 }}>
            {isEdit ? 'تعديل الإدارة' : 'إضافة إدارة'}
          </h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {isEdit
              ? 'عدّل اسم الإدارة أو رمزها المرجعي.'
              : 'أدخل اسم الإدارة ورمزها المرجعي الفريد.'}
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
          <DrawerSection icon={Building2} label="بيانات الإدارة" />

          <FieldWrap label="اسم الإدارة" required>
            <TextInput
              placeholder="مثال: الموارد البشرية"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </FieldWrap>

          <FieldWrap
            label="رمز الإدارة"
            required
            hint="سيظهر الرمز على بطاقة الإدارة وكرمز مرجعي."
          >
            <TextInput
              placeholder="مثال: HR-03"
              value={form.code}
              onChange={e => set('code', e.target.value.toUpperCase())}
              mono
            />
          </FieldWrap>
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
              {saving ? '...' : isEdit ? 'حفظ التعديلات' : '+ إنشاء الإدارة'}
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

// ── Delete Modal — confirm → blocked on 422 ───────────────────────────────────

function DeleteDeptModal({ dept, onClose, onDeleted }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('confirm') // 'confirm' | 'blocked'
  const [deleting, setDeleting] = useState(false)
  const [blockedCounts, setBlockedCounts] = useState({ sections: 0, users: 0 })

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/admin/departments/${dept.id}`)
      onDeleted()
    } catch (e) {
      if (e.response?.status === 422) {
        setBlockedCounts({ sections: dept.sections_count ?? 0, users: dept.users_count ?? 0 })
        setPhase('blocked')
      }
    } finally {
      setDeleting(false)
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
        width: 460, background: '#fff', borderRadius: 18,
        boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
      }}>

        {phase === 'blocked' ? (
          <>
            <div style={{ padding: '30px 26px 22px', textAlign: 'center' }}>
              {/* Warning icon */}
              <div style={{
                width: 62, height: 62, borderRadius: 16, margin: '0 auto 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
              }}>
                <AlertTriangle size={28} />
              </div>
              <h3 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
                لا يمكن حذف الإدارة
              </h3>
              <p style={{ margin: '0 auto 18px', maxWidth: 360, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.75 }}>
                يجب أولاً نقل أو حذف الأقسام والموظفين المرتبطين بهذه الإدارة قبل أن تتمكن من حذفها.
              </p>

              {/* Dept ref chip */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
                padding: '5px 13px', borderRadius: 999,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)',
              }}>
                <Building2 size={13} style={{ color: 'var(--c-text-3)' }} />
                {dept.name} · {dept.code}
              </div>

              {/* Stats chips */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999,
                  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                  fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)',
                }}>
                  <Users size={11} style={{ color: 'var(--c-text-3)' }} />
                  {blockedCounts.users} موظفاً
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999,
                  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                  fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)',
                }}>
                  <Layers size={11} style={{ color: 'var(--c-text-3)' }} />
                  {blockedCounts.sections} أقساماً مرتبطة
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 10, padding: '16px 22px',
              borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
            }}>
              <Button
                variant="primary" style={{ flex: 1, height: 46, gap: 7 }}
                onClick={() => { onClose(); navigate('/admin/sections') }}
              >
                <Layers size={15} style={{ marginLeft: 6 }} />
                إدارة الأقسام
              </Button>
              <Button variant="ghost" style={{ flex: 1, height: 46 }} onClick={onClose}>
                إغلاق
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '30px 26px 22px', textAlign: 'center' }}>
              {/* Trash icon */}
              <div style={{
                width: 62, height: 62, borderRadius: 16, margin: '0 auto 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
              }}>
                <Trash2 size={28} />
              </div>
              <h3 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
                حذف الإدارة؟
              </h3>
              <p style={{ margin: '0 auto 18px', maxWidth: 360, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.75 }}>
                سيتم حذف هذه الإدارة نهائياً. لا يمكن التراجع عن هذا الإجراء.
              </p>

              {/* Dept ref chip */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 13px', borderRadius: 999,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)',
              }}>
                <Building2 size={13} style={{ color: 'var(--c-text-3)' }} />
                {dept.name} · {dept.code}
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 10, padding: '16px 22px',
              borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
            }}>
              <Button variant="danger" style={{ flex: 1, height: 46, gap: 7 }} onClick={handleDelete}>
                {deleting ? '...' : <><Trash2 size={15} style={{ marginLeft: 6 }} /> حذف نهائي</>}
              </Button>
              <Button variant="ghost" style={{ flex: 1, height: 46 }} onClick={onClose}>
                إلغاء
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [depts, setDepts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [total, setTotal]       = useState(0)
  const [drawer, setDrawer]     = useState(null) // { mode: 'create'|'edit', dept? }
  const [deleteTarget, setDel]  = useState(null)

  const fetchDepts = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      const res = await api.get('/admin/departments', { params })
      const raw = res.data.departments
      const list = raw?.data ?? (Array.isArray(raw) ? raw : [])
      setDepts(list)
      setTotal(raw?.total ?? list.length)
    } catch {
      setDepts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchDepts() }, [fetchDepts])

  // Topbar "+ إدارة جديدة" button
  useEffect(() => {
    const handler = () => setDrawer({ mode: 'create' })
    window.addEventListener('topbar:action', handler)
    return () => window.removeEventListener('topbar:action', handler)
  }, [])

  // Topbar refresh button
  useEffect(() => {
    window.addEventListener('topbar:refresh', fetchDepts)
    return () => window.removeEventListener('topbar:refresh', fetchDepts)
  }, [fetchDepts])

  // Derived metrics — summed from local list
  const totalSections = depts.reduce((s, d) => s + (d.sections_count ?? 0), 0)
  const totalUsers    = depts.reduce((s, d) => s + (d.users_count    ?? 0), 0)

  const metrics = [
    { Icon: Layers,   label: 'أقساماً', value: totalSections },
    { Icon: Building2, label: 'إدارات',  value: total },
    { Icon: Users,    label: 'موظفاً',   value: totalUsers },
  ]

  const handleSave    = () => { toast.success(drawer?.mode === 'edit' ? 'تم تعديل الإدارة بنجاح' : 'تم إنشاء الإدارة بنجاح'); setDrawer(null); fetchDepts() }
  const handleDeleted = () => { toast.success('تم حذف الإدارة بنجاح'); setDel(null); fetchDepts() }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الإدارات
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          الهيكل التنظيمي للشركة — كل إدارة تضم أقساماً وموظفين.
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

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={17} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>
            {total} إدارات
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 10, padding: '0 12px', height: 38, minWidth: 220,
        }}>
          <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الرمز..."
            style={{
              flex: 1, border: 0, outline: 0, background: 'transparent',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : depts.length === 0 ? (
        <div style={{ padding: '72px 20px', textAlign: 'center' }}>
          <Building2 size={36} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
          <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
            {search ? 'لا توجد نتائج مطابقة' : 'لا توجد إدارات بعد'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {depts.map(dept => (
            <DeptCard
              key={dept.id}
              dept={dept}
              onEdit={() => setDrawer({ mode: 'edit', dept })}
              onDelete={() => setDel(dept)}
              onSections={() => navigate(`/admin/sections?department_id=${dept.id}`)}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <DeptDrawer
          mode={drawer.mode}
          dept={drawer.dept}
          onClose={() => setDrawer(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteDeptModal
          dept={deleteTarget}
          onClose={() => setDel(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
