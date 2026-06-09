import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import {
  Users, Settings, Shield, Search, Pencil, Trash2,
  X, User, Mail, Lock, Eye, EyeOff, Star, AlertCircle, Crown,
} from 'lucide-react'
import Button from '../components/ui/Button'

// ── Primitive components ──────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: '#224167', fg: '#fff' },
  { bg: '#1E8F5E', fg: '#fff' },
  { bg: '#9B59B6', fg: '#fff' },
  { bg: '#0077B6', fg: '#fff' },
  { bg: '#E67E22', fg: '#fff' },
  { bg: '#C0392B', fg: '#fff' },
]

function Avatar({ name, size = 40 }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  const { bg, fg } = AVATAR_PALETTE[(name?.charCodeAt(0) ?? 0) % AVATAR_PALETTE.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg, color: fg, fontWeight: 800, letterSpacing: -0.5,
      fontSize: size * 0.36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}

const ROLE_META = {
  admin:    { label: 'مدير النظام',   bg: 'var(--c-primary)',     color: '#fff',             border: 'none' },
  chief:    { label: 'الرئيس الأعلى', bg: 'var(--c-accent-tint)', color: '#8A6A23',          border: '1px solid var(--c-accent-soft)' },
  manager:  { label: 'مدير',          bg: 'rgba(34,65,103,0.09)', color: 'var(--c-primary)', border: '1px solid rgba(34,65,103,0.18)' },
  employee: { label: 'موظف',          bg: 'var(--c-surface-2)',   color: 'var(--c-text-2)',  border: 'none' },
}

function RoleBadge({ role }) {
  const m = ROLE_META[role] ?? ROLE_META.employee
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
      background: m.bg, color: m.color, border: m.border,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

function LiveDot({ on }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      fontSize: 12, fontWeight: 700,
      color: on ? 'var(--c-approved)' : 'var(--c-text-3)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: on ? 'var(--c-approved)' : 'var(--c-text-3)',
        boxShadow: on ? '0 0 0 3px var(--c-approved-bg)' : '0 0 0 3px var(--c-surface-2)',
      }} />
      {on ? 'مفعّل' : 'معطّل'}
    </span>
  )
}

function RowBtn({ children, danger, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
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

function Toggle({ on, onChange }) {
  return (
    <button
      type="button" onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 999, border: 0,
        position: 'relative', flexShrink: 0, cursor: 'pointer',
        background: on ? 'var(--c-approved)' : 'var(--c-border-strong)',
        transition: 'background .16s ease',
      }}
    >
      {/* knob: inset-inline-end 3=off, 21=on — works for RTL where inline-end=left */}
      <span style={{
        position: 'absolute', top: 3,
        insetInlineEnd: on ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(27,42,65,0.25)',
        transition: 'inset-inline-end .16s ease',
        display: 'block',
      }} />
    </button>
  )
}

// ── Drawer primitives ─────────────────────────────────────────────────────────

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
        {label}{required && <span style={{ color: 'var(--c-rejected)', marginRight: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ icon: Icon, type = 'text', placeholder, value, onChange, suffix }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, height: 42,
      background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
      borderRadius: 10, padding: '0 12px',
    }}>
      {Icon && <Icon size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
      <input
        type={type} placeholder={placeholder} value={value} onChange={onChange}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl',
        }}
      />
      {suffix}
    </div>
  )
}

function SelectInput({ placeholder, value, onChange, options }) {
  return (
    <select
      value={value} onChange={onChange}
      style={{
        width: '100%', height: 42, border: '1.5px solid var(--c-border)',
        borderRadius: 10, padding: '0 12px', background: 'var(--c-surface)',
        fontFamily: 'var(--font-sans)', fontSize: 13,
        color: value ? 'var(--c-text)' : 'var(--c-text-3)',
        outline: 'none', cursor: 'pointer', direction: 'rtl',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── Role picker card ──────────────────────────────────────────────────────────

const ROLES = [
  { key: 'admin',    label: 'مدير النظام',   desc: 'وصول كامل لجميع الإعدادات والصلاحيات', Icon: Crown, isChief: false },
  { key: 'manager',  label: 'مدير',          desc: 'يعتمد المستندات ويتابع الفريق',        Icon: Users, isChief: false },
  { key: 'chief',    label: 'الرئيس الأعلى', desc: 'الاعتماد النهائي — منصب واحد فقط',    Icon: Star,  isChief: true  },
  { key: 'employee', label: 'موظف',          desc: 'يرفع المستندات فقط',                   Icon: User,  isChief: false },
]

function RoleCard({ role, selected, onSelect }) {
  const { key, label, desc, Icon, isChief } = role
  const active = selected === key
  const accentChief = active && isChief

  return (
    <div
      onClick={() => onSelect(key)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
        borderRadius: 12, cursor: 'pointer',
        background: accentChief ? 'rgba(200,163,107,0.03)' : active ? 'rgba(34,65,103,0.03)' : '#fff',
        border: `1.5px solid ${accentChief ? 'var(--c-accent)' : active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        boxShadow: accentChief ? '0 0 0 3px var(--c-accent-tint)' : active ? '0 0 0 3px rgba(34,65,103,0.07)' : 'none',
        transition: 'all .14s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: accentChief ? 'var(--c-accent)' : 'var(--c-surface)',
        color: accentChief ? '#2A2010' : 'var(--c-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-2)', marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        border: `1.5px solid ${accentChief ? 'var(--c-accent)' : active ? 'var(--c-primary)' : 'var(--c-border-strong)'}`,
        background: accentChief ? 'var(--c-accent)' : active ? 'var(--c-primary)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accentChief ? '#2A2010' : '#fff',
      }}>
        {active && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  )
}

// ── User Drawer (create + edit) ───────────────────────────────────────────────

function UserDrawer({ mode, user, users, departments, onClose, onSave }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() => isEdit && user ? {
    name: user.name ?? '',
    email: user.email ?? '',
    password: '',
    password_confirmation: '',
    role: user.role ?? 'employee',
    department_id: user.department?.id ?? '',
    section_id: user.section?.id ?? '',
    attendance_check: user.attendance_check ?? false,
    can_view_attendance: user.can_view_attendance ?? false,
  } : {
    name: '', email: '', password: '', password_confirmation: '',
    role: 'employee', department_id: '', section_id: '',
    attendance_check: false, can_view_attendance: false,
  })

  const [sections, setSections]   = useState([])
  const [showPw, setShowPw]       = useState(false)
  const [showPwC, setShowPwC]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Fetch sections whenever department changes
  useEffect(() => {
    if (!form.department_id) { setSections([]); return }
    api.get('/admin/sections', {
      params: { department_id: form.department_id },
    })
      .then(res => setSections(res.data.sections?.data ?? res.data.sections ?? []))
      .catch(() => setSections([]))
  }, [form.department_id])

  const chiefTaken = form.role === 'chief' &&
    users.some(u => u.role === 'chief' && (!isEdit || u.id !== user?.id))

  const buildPayload = () => {
    const p = {
      name:             form.name,
      email:            form.email,
      role:                form.role,
      attendance_check:    form.attendance_check,
      can_view_attendance: form.can_view_attendance,
    }
    // Send integers, omit if empty (API accepts optional nulls)
    if (form.department_id) p.department_id = Number(form.department_id)
    if (form.section_id)    p.section_id    = Number(form.section_id)
    if (!isEdit || form.password) {
      p.password              = form.password
      p.password_confirmation = form.password_confirmation
    }
    return p
  }

  const handleSubmit = async () => {
    setError('')
    setSaving(true)
    try {
      const payload = buildPayload()
      if (isEdit) {
        await api.patch(`/admin/users/${user.id}`, payload)
      } else {
        await api.post('/admin/users', payload)
      }
      onSave()
    } catch (e) {
      const msg = e.response?.data?.message ?? e.response?.data?.errors
        ? Object.values(e.response.data.errors).flat().join(' — ')
        : 'حدث خطأ. يرجى المحاولة مرة أخرى.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const deptOptions    = departments.map(d => ({ value: d.id, label: d.name }))
  const sectionOptions = sections.map(s => ({ value: s.id, label: s.name }))

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 39,
          background: 'rgba(20,32,50,0.42)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer — pinned to inline-start (right in RTL) */}
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
            {isEdit ? 'تعديل مستخدم' : 'إضافة مستخدم'}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.4 }}>
            {isEdit ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم'}
          </h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-text-2)' }}>
            {isEdit
              ? 'عدّل بيانات الموظف أو صلاحياته وارتباطه بالإدارة.'
              : 'أكمل بيانات الموظف وحدّد دوره وارتباطه بالإدارة.'}
          </p>
          {/* Close button — pinned to inline-start corner */}
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Edit: identity card */}
          {isEdit && user && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: 14,
              borderRadius: 14, marginBottom: 18,
              background: 'linear-gradient(120deg, var(--c-surface) 0%, #fff 80%)',
              border: '1px solid var(--c-border)',
            }}>
              <Avatar name={user.name} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginTop: 2 }}>{user.email}</div>
              </div>
              <RoleBadge role={user.role} />
            </div>
          )}

          {/* ── Basic info ── */}
          <DrawerSection icon={User} label="البيانات الأساسية" />

          <FieldWrap label="الاسم الكامل" required>
            <TextInput icon={User} placeholder="مثال: أحمد الزهراني" value={form.name} onChange={e => set('name', e.target.value)} />
          </FieldWrap>

          <FieldWrap label="البريد الإلكتروني" required>
            <TextInput icon={Mail} type="email" placeholder="user@al-raqi.aa" value={form.email} onChange={e => set('email', e.target.value)} />
          </FieldWrap>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldWrap label={isEdit ? 'كلمة المرور الجديدة' : 'كلمة المرور'} required={!isEdit}>
              <TextInput
                icon={Lock} type={showPw ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => set('password', e.target.value)}
                suffix={
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--c-text-3)', display: 'flex', padding: 0 }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
            </FieldWrap>
            <FieldWrap label="تأكيد كلمة المرور" required={!isEdit}>
              <TextInput
                icon={Lock} type={showPwC ? 'text' : 'password'} placeholder="••••••••"
                value={form.password_confirmation} onChange={e => set('password_confirmation', e.target.value)}
                suffix={
                  <button type="button" onClick={() => setShowPwC(p => !p)}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--c-text-3)', display: 'flex', padding: 0 }}>
                    {showPwC ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
            </FieldWrap>
          </div>

          {/* ── Role ── */}
          <DrawerSection icon={Shield} label="الدور والصلاحية" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {ROLES.map(r => (
              <RoleCard key={r.key} role={r} selected={form.role} onSelect={v => set('role', v)} />
            ))}
          </div>

          {chiefTaken && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 12, marginTop: 10,
              background: 'var(--c-accent-tint)', fontSize: 12, lineHeight: 1.6, color: '#8A6A23',
            }}>
              <AlertCircle size={15} style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 1 }} />
              <span>تم تعيين رئيس أعلى بالفعل. لا يمكن أن يكون هناك أكثر من رئيس أعلى واحد في النظام.</span>
            </div>
          )}

          {/* ── Department / Section ── */}
          <DrawerSection icon={Settings} label="الإدارة والقسم" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldWrap label="الإدارة">
              <SelectInput
                placeholder="اختر الإدارة" value={form.department_id}
                onChange={e => { set('department_id', e.target.value); set('section_id', '') }}
                options={deptOptions}
              />
            </FieldWrap>
            <FieldWrap label="القسم">
              <SelectInput
                placeholder={form.department_id ? 'اختر القسم' : 'اختر الإدارة أولاً'}
                value={form.section_id}
                onChange={e => set('section_id', e.target.value)}
                options={sectionOptions}
              />
            </FieldWrap>
          </div>

          {/* ── Attendance toggle ── */}
          <DrawerSection icon={null} label="تسجيل الحضور" />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px',
            borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>تسجيل الحضور</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-2)', marginTop: 2, lineHeight: 1.5 }}>
                تفعيل متابعة وقت الدخول والخروج لهذا الموظف
              </div>
            </div>
            <Toggle on={form.attendance_check} onChange={v => set('attendance_check', v)} />
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px',
            borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            marginTop: 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>صلاحية عرض سجلات الحضور</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-2)', marginTop: 2, lineHeight: 1.5 }}>
                السماح لهذا المستخدم بعرض سجلات حضور وانصراف الموظفين
              </div>
            </div>
            <Toggle on={form.can_view_attendance} onChange={v => set('can_view_attendance', v)} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid var(--c-border)', background: '#fff',
        }}>
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
            <Button
              variant="primary" style={{ flex: 1, height: 46 }}
              onClick={handleSubmit}
            >
              {saving ? '...' : isEdit ? 'حفظ التعديلات' : '+ إنشاء المستخدم'}
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

// ── Delete Confirmation Modal ──────────────────────────────────────────────────

function DeleteModal({ user, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const handleDelete = async () => {
    setError('')
    setDeleting(true)
    try {
      await api.delete(`/admin/users/${user.id}`)
      onConfirm()
    } catch (e) {
      setError(e.response?.data?.message ?? 'تعذّر حذف المستخدم.')
      setDeleting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(20,32,50,0.48)',
      backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 440, background: '#fff', borderRadius: 18,
        boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
      }}>
        <div style={{ padding: '26px 26px 22px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
          }}>
            <Trash2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
            حذف المستخدم
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 340, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            هل أنت متأكد من حذف <strong>{user.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          {error && (
            <div style={{
              marginTop: 12, padding: '9px 14px', borderRadius: 10,
              background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
              fontSize: 12.5, display: 'inline-block',
            }}>
              {error}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', gap: 10, padding: '16px 22px',
          borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)',
        }}>
          <Button variant="danger" style={{ flex: 1, height: 46 }} onClick={handleDelete}>
            {deleting ? '...' : 'حذف'}
          </Button>
          <Button variant="ghost" style={{ flex: 1, height: 46 }} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  const widths = ['160px', '80px', '100px', '120px', '70px', '60px']
  return (
    <tr>
      <td style={{ padding: '14px 16px', width: 40 }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 14, borderRadius: 7, background: 'var(--c-surface-2)', width: w, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABLE_COLS = ['المستخدم', 'الدور', 'الإدارة', 'القسم', 'تسجيل الحضور', 'إجراءات']

export default function UsersPage() {
  const toast = useToast()
  const [users, setUsers]           = useState([])
  const [departments, setDepts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [lastPage, setLastPage]     = useState(1)
  const [total, setTotal]           = useState(0)
  const [tab, setTab]               = useState('all')
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [drawer, setDrawer]         = useState(null) // { mode: 'create'|'edit', user? }
  const [deleteTarget, setDelete]   = useState(null)

  // ── API ──────────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const params = { page: targetPage }
      if (search)     params.search        = search
      if (roleFilter) params.role          = roleFilter
      if (deptFilter) params.department_id = deptFilter
      const res = await api.get('/admin/users', { params })
      const pagination = res.data.users
      setUsers(pagination.data ?? [])
      setPage(pagination.current_page ?? targetPage)
      setLastPage(pagination.last_page ?? 1)
      setTotal(pagination.total ?? 0)
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [search, roleFilter, deptFilter, page])

  const fetchDepts = useCallback(async () => {
    try {
      const res = await api.get('/admin/departments')
      setDepts(res.data.departments?.data ?? res.data.departments ?? [])
    } catch { /* leave empty */ }
  }, [])

  // Reset to page 1 when filters change, then fetch
  useEffect(() => {
    setPage(1)
    fetchUsers(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, deptFilter])

  // Fetch when page changes (without resetting)
  useEffect(() => { fetchUsers(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDepts() }, [fetchDepts])

  // Topbar action button → open create drawer
  useEffect(() => {
    const handler = () => setDrawer({ mode: 'create' })
    window.addEventListener('topbar:action', handler)
    return () => window.removeEventListener('topbar:action', handler)
  }, [])

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { fetchUsers(page); fetchDepts() }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchUsers, fetchDepts, page])

  // ── Derived — tab filter is client-side on the current page ─────────────────
  const filtered = users.filter(u => {
    if (tab === 'manager'  && !['admin', 'manager', 'chief'].includes(u.role)) return false
    if (tab === 'employee' && u.role !== 'employee') return false
    return true
  })

  const counts = {
    all:      users.length,
    manager:  users.filter(u => ['admin', 'manager', 'chief'].includes(u.role)).length,
    employee: users.filter(u => u.role === 'employee').length,
  }

  const metrics = [
    { Icon: Settings, label: 'مدير نظام', value: users.filter(u => u.role === 'admin').length },
    { Icon: Shield,   label: 'رئيس أعلى', value: users.filter(u => u.role === 'chief').length },
    { Icon: Users,    label: 'إجمالي',     value: total },
  ]

  const tabs = [
    { key: 'all',      label: 'الكل',     count: counts.all },
    { key: 'manager',  label: 'مديرون',   count: counts.manager },
    { key: 'employee', label: 'موظفون',   count: counts.employee },
  ]

  const handleSave    = () => { toast.success(drawer?.mode === 'edit' ? 'تم تعديل المستخدم بنجاح' : 'تم إنشاء المستخدم بنجاح'); setDrawer(null); fetchUsers(page) }
  const handleDeleted = () => { toast.success('تم حذف المستخدم بنجاح'); setDelete(null); fetchUsers(page) }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1180, margin: '0 auto' }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الأشخاص والصلاحيات
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          إدارة حسابات الموظفين وأدوارهم وارتباطاتهم بالإدارات والأقسام.
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

      {/* ── Main card ───────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          {/* Title + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Users size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>قائمة المستخدمين</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {total} حسابات
            </span>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: 4, alignItems: 'center',
            background: 'var(--c-surface)', borderRadius: 10, padding: 4,
          }}>
            {tabs.map(t => (
              <button
                key={t.key} onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 30, padding: '0 12px', borderRadius: 8, border: 0,
                  background: tab === t.key ? 'var(--c-primary)' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--c-text-2)',
                  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer', transition: 'all .14s',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '1px 7px',
                  background: tab === t.key ? 'rgba(255,255,255,0.2)' : 'var(--c-surface-2)',
                  color: tab === t.key ? '#fff' : 'var(--c-text-2)',
                }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 10, padding: '0 12px', height: 38, minWidth: 220,
          }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
              }}
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{
              height: 38, padding: '0 10px', borderRadius: 10,
              background: '#fff', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
              color: roleFilter ? 'var(--c-text)' : 'var(--c-text-2)',
              cursor: 'pointer', direction: 'rtl', minWidth: 110, outline: 'none',
            }}
          >
            <option value="">الدور: الكل</option>
            <option value="admin">مدير النظام</option>
            <option value="chief">الرئيس الأعلى</option>
            <option value="manager">مدير</option>
            <option value="employee">موظف</option>
          </select>

          {/* Dept filter */}
          <select
            value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            style={{
              height: 38, padding: '0 10px', borderRadius: 10,
              background: '#fff', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
              color: deptFilter ? 'var(--c-text)' : 'var(--c-text-2)',
              cursor: 'pointer', direction: 'rtl', minWidth: 130, outline: 'none',
            }}
          >
            <option value="">الإدارة: الكل</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                <th style={{ width: 44, padding: '11px 16px', textAlign: 'center', borderBottom: '1px solid var(--c-border)' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--c-primary)', cursor: 'pointer' }} />
                </th>
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
                ? [0, 1, 2].map(i => <SkeletonRow key={i} />)
                : filtered.map((u, idx) => (
                  <UserRow
                    key={u.id} user={u}
                    last={idx === filtered.length - 1}
                    onEdit={() => setDrawer({ mode: 'edit', user: u })}
                    onDelete={() => setDelete(u)}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Users size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>لا توجد نتائج</p>
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1}      onClick={() => setPage(p => p - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>›</PagBtn>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawer && (
        <UserDrawer
          mode={drawer.mode}
          user={drawer.user}
          users={users}
          departments={departments}
          onClose={() => setDrawer(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onClose={() => setDelete(null)}
          onConfirm={handleDeleted}
        />
      )}
    </div>
  )
}

// ── UserRow (separated to avoid hook-in-loop) ─────────────────────────────────
function UserRow({ user: u, last, onEdit, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <input type="checkbox" style={{ accentColor: 'var(--c-primary)', cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={u.name} size={38} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{u.name}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{u.email}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <RoleBadge role={u.role} />
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--c-text-2)' }}>
        {u.department?.name ?? '—'}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--c-text-2)' }}>
        {u.section?.name ?? '—'}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <LiveDot on={u.attendance_check} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <RowBtn onClick={onEdit}><Pencil size={14} /></RowBtn>
          <RowBtn danger onClick={onDelete}><Trash2 size={14} /></RowBtn>
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
