// Admin-only CRUD over the leave/excuse vocabulary (/admin/leave-types).
//
// The screen exists for one field: `deducts_balance`. Everything else is
// labelling and picker plumbing; that flag decides whether taking this kind of
// leave costs the employee an annual-balance day, which is why the write
// endpoints are admin-only and why editing it asks for confirmation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Tags, Plus, Pencil, Trash2, X, AlertTriangle, AlertCircle, Inbox,
  Check, ShieldCheck, UserCheck, Loader2,
} from 'lucide-react'
import Button from '../components/ui/Button'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'
import { useToast } from '../components/ui/Toast'
import { LEAVE_COPY, leaveApiMessage } from '../utils/leave'
import {
  fetchLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  onLeaveTypesChanged,
} from '../utils/leaveTypes'

const CODE_PATTERN = /^[a-z0-9_]+$/

// Picker order is creation order, so a new type lands at the end on its own —
// there is no order to choose here.
const EMPTY_FORM = {
  code: '', name_ar: '', name_en: '',
  deducts_balance: true, for_requests: true, for_excuses: true,
  requires_reason: false, is_active: true,
}

const filterSelectStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 150,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 42,
  background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
  borderRadius: 10, padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function RowBtn({ children, danger, disabled, onClick, title }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${danger && hov && !disabled ? '#F4C9C6' : 'var(--c-border)'}`,
        background: danger && hov && !disabled ? 'var(--c-rejected-bg)' : '#fff',
        color: disabled ? 'var(--c-text-3)' : danger && hov ? 'var(--c-rejected)' : 'var(--c-text-2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'all .14s',
      }}
    >
      {children}
    </button>
  )
}

function StatePill({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
      fontSize: 11, fontWeight: 800,
      color: active ? 'var(--c-approved)' : 'var(--c-text-3)',
      background: active ? 'var(--c-approved-bg)' : 'var(--c-surface-2)',
      border: `1px solid ${active ? 'var(--c-approved)22' : 'var(--c-border)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: active ? 'var(--c-approved)' : 'var(--c-text-3)',
      }} />
      {active ? LEAVE_COPY.active : LEAVE_COPY.retired}
    </span>
  )
}

function FormPill({ icon: Icon, label, on }) {
  if (!on) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      fontSize: 10.5, fontWeight: 700, color: 'var(--c-text-2)',
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    }}>
      <Icon size={11} style={{ color: 'var(--c-text-3)' }} />
      {label}
    </span>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      borderRadius: 11, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 10, opacity: disabled ? 0.6 : 1,
    }}>
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--c-primary)', width: 16, height: 16, marginTop: 1, flexShrink: 0, cursor: 'inherit' }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--c-text-3)', marginTop: 3, lineHeight: 1.6 }}>{hint}</span>}
      </span>
    </label>
  )
}

function FieldWrap({ label, required, error, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

function TypeRow({ type, last, onEdit, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent', transition: 'background .1s',
        opacity: type.is_active ? 1 : 0.72,
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{type.name_ar}</div>
        {type.name_en && (
          <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
            {type.name_en}
          </div>
        )}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          fontFamily: "'Courier New', Courier, monospace", direction: 'ltr', display: 'inline-block',
          fontSize: 11.5, color: 'var(--c-text-2)', background: 'var(--c-surface)',
          border: '1px solid var(--c-border)', borderRadius: 7, padding: '2px 8px',
        }}>
          {type.code}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <DeductsBalanceBadge deducts={type.deducts_balance} compact />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <FormPill icon={UserCheck} label={LEAVE_COPY.forRequests} on={type.for_requests} />
          <FormPill icon={ShieldCheck} label={LEAVE_COPY.forExcuses} on={type.for_excuses} />
          {!type.for_requests && !type.for_excuses && (
            <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>لا يظهر في أي نموذج</span>
          )}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        {type.requires_reason
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
              <Check size={12} style={{ color: 'var(--c-approved)' }} />نعم
            </span>
          : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px' }}><StatePill active={type.is_active} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <RowBtn title="تعديل النوع" onClick={onEdit}><Pencil size={14} /></RowBtn>
          <RowBtn danger title="حذف أو تقاعد النوع" onClick={onDelete}><Trash2 size={14} /></RowBtn>
        </div>
      </td>
    </tr>
  )
}

// ── Create / edit drawer ─────────────────────────────────────────────────────

function TypeDrawer({ mode, type, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(() => (isEdit
    ? {
        code: type.code ?? '', name_ar: type.name_ar ?? '', name_en: type.name_en ?? '',
        deducts_balance: Boolean(type.deducts_balance),
        for_requests: Boolean(type.for_requests),
        for_excuses: Boolean(type.for_excuses),
        requires_reason: Boolean(type.requires_reason),
        is_active: Boolean(type.is_active),
      }
    : EMPTY_FORM))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Editing the balance policy is a payroll decision — confirmed, not typed.
  const [confirmDeducts, setConfirmDeducts] = useState(false)

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || saving) return
      if (confirmDeducts) setConfirmDeducts(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeducts, onClose, saving])

  const deductsChanged = isEdit && Boolean(type.deducts_balance) !== form.deducts_balance

  const validate = () => {
    const next = {}
    // `code` is only submitted on create; on edit it is locked and not sent, so
    // a legacy type with an odd code stays editable.
    if (!isEdit) {
      const code = form.code.trim()
      if (!code) next.code = 'الرمز مطلوب.'
      else if (!CODE_PATTERN.test(code)) next.code = 'الرمز يجب أن يتكون من أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط.'
      else if (code.length > 50) next.code = 'الرمز يجب ألا يتجاوز 50 حرفاً.'
    }
    if (!form.name_ar.trim()) next.name_ar = 'الاسم بالعربية مطلوب.'
    else if (form.name_ar.trim().length > 100) next.name_ar = 'الاسم بالعربية يجب ألا يتجاوز 100 حرف.'
    if (form.name_en.trim().length > 100) next.name_en = 'الاسم بالإنجليزية يجب ألا يتجاوز 100 حرف.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    setFormError('')
    if (!validate()) return
    // The confirmation gate only guards the policy flip, so it runs after the
    // rest of the form is known to be valid.
    if (deductsChanged && !confirmDeducts) { setConfirmDeducts(true); return }
    setSaving(true)
    try {
      const data = isEdit ? await updateLeaveType(type.id, form) : await createLeaveType(form)
      onSaved(data?.leave_type ?? null, isEdit)
    } catch (err) {
      const bag = err?.response?.data?.errors
      if (bag && typeof bag === 'object') {
        setErrors(Object.fromEntries(Object.entries(bag).map(([key, value]) => [
          key, Array.isArray(value) ? value.join('، ') : String(value),
        ])))
        setFormError('')
      } else if (err?.response?.status === 403) {
        setFormError('هذه الشاشة متاحة لمدير النظام فقط.')
      } else {
        setFormError(leaveApiMessage(err, 'تعذّر حفظ نوع الإجازة، حاول مرة أخرى.'))
      }
      setConfirmDeducts(false)
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={() => !saving && onClose()} style={{
        position: 'fixed', inset: 0, zIndex: 39, background: 'rgba(20,32,50,0.42)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, bottom: 0, insetInlineStart: 0,
        width: 'min(520px, 100vw)', background: '#fff', zIndex: 40,
        boxShadow: '-14px 0 40px rgba(20,32,50,0.22)',
        display: 'flex', flexDirection: 'column', borderInlineEnd: '1px solid var(--c-border)',
      }}>
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, position: 'relative' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, color: 'var(--c-accent)', marginBottom: 6 }}>
            {isEdit ? 'تعديل نوع' : 'نوع جديد'}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.4 }}>
            {isEdit ? 'تعديل نوع الإجازة' : 'إضافة نوع إجازة'}
          </h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            حدّد اسم النوع وما إذا كان يُخصم من الرصيد السنوي، والنماذج التي يظهر فيها.
          </p>
          {/* Closes only when idle, like the backdrop, Escape and the footer's
              cancel: dismissing the drawer mid-save would leave the POST/PATCH
              in flight with nowhere to report success or a validation failure. */}
          <button
            type="button" onClick={onClose} disabled={saving}
            title={saving ? 'جارٍ الحفظ…' : 'إغلاق'}
            style={{
              position: 'absolute', insetInlineStart: 18, top: 18, width: 34, height: 34, borderRadius: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <FieldWrap
            label="الاسم بالعربية" required error={errors.name_ar}
            hint="الاسم الذي يظهر في كل القوائم والتقارير."
          >
            <input
              value={form.name_ar} maxLength={100}
              onChange={e => set('name_ar', e.target.value)}
              placeholder="مثال: إجازة مرضية"
              style={{ ...inputStyle, borderColor: errors.name_ar ? 'var(--c-rejected)' : 'var(--c-border)' }}
            />
          </FieldWrap>

          {/* Read-only after creation: legacy rows stored the raw code as free
              text and are matched by it, so renaming it would drop them out of
              their own type's filter. */}
          <FieldWrap
            label={isEdit ? `الرمز — ${LEAVE_COPY.codeLocked}` : 'الرمز'}
            required={!isEdit} error={errors.code}
            hint={isEdit
              ? LEAVE_COPY.codeLockedHint
              : 'المعرّف الثابت المستخدم في الفلاتر والتقارير — أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط.'}
          >
            <input
              value={form.code} maxLength={50} readOnly={isEdit}
              onChange={e => set('code', e.target.value)}
              placeholder="sick"
              title={isEdit ? LEAVE_COPY.codeLockedHint : undefined}
              style={{
                ...inputStyle, direction: 'ltr', textAlign: 'left',
                fontFamily: "'Courier New', Courier, monospace",
                borderColor: errors.code ? 'var(--c-rejected)' : 'var(--c-border)',
                ...(isEdit ? { color: 'var(--c-text-3)', cursor: 'not-allowed' } : {}),
              }}
            />
          </FieldWrap>

          <FieldWrap label="الاسم بالإنجليزية" error={errors.name_en} hint="اختياري.">
            <input
              value={form.name_en} maxLength={100}
              onChange={e => set('name_en', e.target.value)}
              placeholder="Sick leave"
              style={{
                ...inputStyle, direction: 'ltr', textAlign: 'left',
                borderColor: errors.name_en ? 'var(--c-rejected)' : 'var(--c-border)',
              }}
            />
          </FieldWrap>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 22 }}>
            <Tags size={15} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>السياسة</span>
            <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
          </div>

          <Toggle
            checked={form.deducts_balance} onChange={v => set('deducts_balance', v)}
            label={LEAVE_COPY.deducts}
            hint="عند التفعيل، كل يوم معتمد تحت هذا النوع يُخصم من رصيد الإجازات السنوي للموظف. عند الإيقاف يُبرَّر الغياب دون أي خصم."
          />
          {errors.deducts_balance && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)', margin: '-4px 0 10px' }}>
              {errors.deducts_balance}
            </div>
          )}
          {deductsChanged && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
              borderRadius: 12, marginBottom: 14, background: 'var(--c-accent-tint)',
              fontSize: 12, lineHeight: 1.7, color: '#8A6A23',
            }}>
              <AlertTriangle size={15} style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 1 }} />
              <span>{LEAVE_COPY.deductsChangeWarning}</span>
            </div>
          )}

          <Toggle
            checked={form.requires_reason} onChange={v => set('requires_reason', v)}
            label={LEAVE_COPY.requiresReason}
            hint="يصبح حقل السبب إلزامياً عند اختيار هذا النوع."
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 22 }}>
            <UserCheck size={15} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>الظهور</span>
            <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
          </div>

          <Toggle
            checked={form.for_requests} onChange={v => set('for_requests', v)}
            label={`يظهر في ${LEAVE_COPY.forRequests}`}
            hint="يمكن للموظف اختيار هذا النوع عند تقديم طلب إجازة."
          />
          <Toggle
            checked={form.for_excuses} onChange={v => set('for_excuses', v)}
            label={`يظهر في ${LEAVE_COPY.forExcuses}`}
            hint="يمكن للموارد البشرية تسجيل عذر تحت هذا النوع — المأموريات الرسمية مثلاً تُسجَّل ولا تُطلب."
          />
          <Toggle
            checked={form.is_active} onChange={v => set('is_active', v)}
            label="نوع مُفعّل"
            hint="الأنواع المتقاعدة تختفي من كل القوائم، وتبقى الطلبات السابقة مرتبطة بها."
          />
        </div>

        <div style={{ flexShrink: 0, borderTop: '1px solid var(--c-border)', background: '#fff' }}>
          {formError && (
            <div style={{
              display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 24px',
              background: 'var(--c-rejected-bg)', borderBottom: '1px solid #F4C9C6',
              fontSize: 12.5, color: 'var(--c-rejected)', lineHeight: 1.6,
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              {formError}
            </div>
          )}
          <div style={{ padding: '16px 24px', display: 'flex', gap: 10 }}>
            <Button variant="primary" style={{ flex: 1, height: 46 }} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : isEdit ? 'حفظ التعديلات' : 'إنشاء النوع'}
            </Button>
            <Button variant="ghost" style={{ flex: 1, height: 46 }} onClick={onClose} disabled={saving}>
              إلغاء
            </Button>
          </div>
        </div>
      </div>

      {confirmDeducts && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,32,50,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ width: 'min(440px, calc(100vw - 32px))', background: '#fff', borderRadius: 18, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '26px 24px 18px', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
              }}>
                <AlertTriangle size={25} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
                تغيير سياسة الخصم؟
              </h3>
              <p style={{ margin: '0 auto 14px', maxWidth: 350, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
                سيصبح «{form.name_ar || type.name_ar}» {form.deducts_balance ? LEAVE_COPY.deducts : LEAVE_COPY.notDeducts}.
                <br />{LEAVE_COPY.deductsChangeWarning}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
              <Button variant="primary" style={{ flex: 1, height: 44 }} onClick={save} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : 'تأكيد التغيير'}
              </Button>
              <Button variant="ghost" style={{ flex: 1, height: 44 }} onClick={() => setConfirmDeducts(false)} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Delete / retire modal ────────────────────────────────────────────────────

function DeleteTypeModal({ type, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      onDone(await deleteLeaveType(type.id))
    } catch (err) {
      setError(leaveApiMessage(err, 'تعذّر حذف نوع الإجازة، حاول مرة أخرى.'))
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,32,50,0.48)',
      backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ width: 'min(460px, calc(100vw - 32px))', background: '#fff', borderRadius: 18, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
          }}>
            <Trash2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
            حذف نوع الإجازة؟
          </h3>
          <p style={{ margin: '0 auto 14px', maxWidth: 370, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
            {LEAVE_COPY.retireInsteadOfDelete}
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
          }}>
            <Tags size={12} />
            {type.name_ar}
          </div>
          {error && (
            <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 10, background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <Button variant="danger" style={{ flex: 1, height: 44 }} onClick={run} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><Trash2 size={14} /> متابعة</>}
          </Button>
          <Button variant="ghost" style={{ flex: 1, height: 44 }} onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const COLS = ['النوع', 'الرمز', 'الخصم من الرصيد', 'يظهر في', LEAVE_COPY.requiresReason, 'الحالة', 'إجراءات']

export default function LeaveTypesPage() {
  const toast = useToast()
  const [tab, setTab] = useState('active')        // active | retired
  const [forFilter, setForFilter] = useState('')  // '' | requests | excuses
  const [deductsFilter, setDeductsFilter] = useState('') // '' | '1' | '0'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [deleting, setDeleting] = useState(null)
  // A type retired instead of deleted vanishes from the active tab, which reads
  // as "it was deleted after all". Keep it on screen, badged متقاعد, until the
  // view changes.
  const [justRetired, setJustRetired] = useState([])
  // Saving a type's activation state fires two loads: the mutation announces
  // itself (reloading the tab being left) and onSaved then follows the type to
  // the other tab. Without a request id the first response can land last and
  // fill the newly selected tab with the other tab's rows.
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      // `active` is always sent explicitly: omitting it means active-only
      // server-side, which would put retired types out of the admin's reach.
      const list = await fetchLeaveTypes({
        active: tab === 'active',
        forForm: forFilter || undefined,
        deductsBalance: deductsFilter === '' ? undefined : deductsFilter === '1',
      })
      if (reqId !== reqRef.current) return
      setRows(list)
    } catch (err) {
      if (reqId !== reqRef.current) return
      setRows([])
      setError(leaveApiMessage(err, 'تعذّر تحميل أنواع الإجازات.'))
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [tab, forFilter, deductsFilter])

  useEffect(() => {
    // Data fetching intentionally starts when the active tab/filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])
  // Any mutation clears the shared cache and announces itself, so the list
  // re-resolves instead of answering from what the mutation invalidated.
  useEffect(() => onLeaveTypesChanged(load), [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [load])

  const changeView = (next) => { setJustRetired([]); next() }

  const onSaved = (saved, wasEdit) => {
    toast.success(wasEdit ? 'تم حفظ نوع الإجازة' : 'تم إنشاء نوع الإجازة')
    setDrawer(null)
    setJustRetired([])
    // A type saved as retired (or reactivated) belongs to the other tab; follow
    // it rather than leaving the admin looking at a list it just left.
    if (saved && Boolean(saved.is_active) !== (tab === 'active')) {
      setTab(saved.is_active ? 'active' : 'retired')
    }
  }

  const onDeleted = ({ retired, leaveType }) => {
    // The row's position is remembered so the pinned copy can go back exactly
    // where it was rather than jumping to the end of the list.
    const index = deleting?.index ?? rows.length
    setDeleting(null)
    if (retired) {
      toast.info(LEAVE_COPY.retiredInsteadOfDeleted)
      // Pin it so the row stays visible with its badge flipped instead of
      // disappearing from the active tab.
      if (leaveType) {
        setJustRetired(list => [
          ...list.filter(pin => pin.type.id !== leaveType.id),
          { type: leaveType, index },
        ])
      }
    } else {
      toast.success('تم حذف نوع الإجازة')
      setJustRetired(list => list.filter(pin => pin.type.id !== leaveType?.id))
    }
  }

  // Rows are rendered in the order the API returned them (creation order) and
  // are never re-sorted here. A pinned retired row is spliced back at the index
  // it occupied, so the table doesn't reshuffle around the row just acted on.
  const visible = useMemo(() => {
    if (tab !== 'active' || justRetired.length === 0) return rows
    const out = [...rows]
    for (const { type, index } of justRetired) {
      if (out.some(row => row.id === type.id)) continue
      out.splice(Math.min(index, out.length), 0, type)
    }
    return out
  }, [rows, justRetired, tab])
  const hasFilters = Boolean(forFilter || deductsFilter)

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{
        marginBottom: 22, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
            {LEAVE_COPY.typesTitle}
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6, maxWidth: 640 }}>
            {LEAVE_COPY.typesSubtitle}
          </p>
        </div>
        <button
          onClick={() => setDrawer({ mode: 'create' })}
          style={{
            height: 42, padding: '0 18px', borderRadius: 11, border: 'none', flexShrink: 0,
            background: 'var(--c-primary)', color: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          نوع إجازة جديد
        </button>
      </div>

      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--c-border)' }}>
          {[
            { key: 'active', label: 'الأنواع المُفعّلة', icon: Check },
            { key: 'retired', label: 'المتقاعدة', icon: Trash2 },
          ].map(t => {
            const Icon = t.icon
            const isActive = tab === t.key
            return (
              <button
                key={t.key} onClick={() => changeView(() => setTab(t.key))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 36, padding: '0 14px', borderRadius: 9, border: 'none',
                  background: isActive ? 'var(--c-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--c-text-2)',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'background .12s',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px' }}>
            {visible.length} نوعاً
          </span>
          {tab === 'active' && !hasFilters && (
            <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              تظهر الأنواع في القوائم بترتيب إضافتها — يُضاف كل نوع جديد في نهاية القائمة
            </span>
          )}
          <div style={{ flex: 1 }} />

          <select
            value={forFilter} onChange={e => changeView(() => setForFilter(e.target.value))}
            style={{ ...filterSelectStyle, color: forFilter ? 'var(--c-text)' : 'var(--c-text-2)' }}
          >
            <option value="">يظهر في: الكل</option>
            <option value="requests">{LEAVE_COPY.forRequests}</option>
            <option value="excuses">{LEAVE_COPY.forExcuses}</option>
          </select>

          <select
            value={deductsFilter} onChange={e => changeView(() => setDeductsFilter(e.target.value))}
            style={{ ...filterSelectStyle, color: deductsFilter ? 'var(--c-text)' : 'var(--c-text-2)' }}
          >
            <option value="">الخصم من الرصيد: الكل</option>
            <option value="1">{LEAVE_COPY.deducts}</option>
            <option value="0">{LEAVE_COPY.notDeducts}</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => changeView(() => { setForFilter(''); setDeductsFilter('') })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', borderRadius: 10,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', cursor: 'pointer',
              }}
            >
              <X size={13} />
              مسح الفلاتر
            </button>
          )}
        </div>

        {error && (
          <div style={{ margin: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {COLS.map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: 'right', fontSize: 11.5, fontWeight: 700,
                    color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3].map(i => (
                    <tr key={i}>
                      {COLS.map((col, cell) => (
                        <td key={col} style={{ padding: '12px 16px' }}>
                          <div style={{
                            height: 16, width: cell === 0 ? 140 : 80, borderRadius: 7,
                            background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite',
                            animationDelay: `${cell * 0.08}s`,
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : visible.map((type, idx) => (
                    <TypeRow
                      key={type.id} type={type} last={idx === visible.length - 1}
                      onEdit={() => setDrawer({ mode: 'edit', type })}
                      onDelete={() => setDeleting({ type, index: idx })}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>

        {!loading && visible.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Inbox size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {hasFilters
                ? 'لا توجد أنواع مطابقة لهذه الفلاتر'
                : tab === 'retired' ? 'لا توجد أنواع متقاعدة' : 'لم يتم تعريف أي نوع إجازة بعد'}
            </p>
          </div>
        )}
      </div>

      {drawer && (
        <TypeDrawer
          mode={drawer.mode} type={drawer.type}
          onClose={() => setDrawer(null)} onSaved={onSaved}
        />
      )}
      {deleting && (
        <DeleteTypeModal type={deleting.type} onClose={() => setDeleting(null)} onDone={onDeleted} />
      )}
    </div>
  )
}
