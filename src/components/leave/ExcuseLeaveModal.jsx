import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import api from '../../services/api'
import { useToast } from '../ui/Toast'
import { LEAVE_TYPE_LABELS } from '../../utils/leave'

const OVER_BALANCE_MESSAGE = 'Excuse exceeds the employee remaining annual leave balance. Send force=true to record it anyway.'
const BUSINESS_MESSAGES = {
  'The selected period contains no working days.': 'الفترة المحددة لا تحتوي على أيام عمل.',
  'A pending or approved leave request already overlaps this period.': 'يوجد طلب إجازة معلّق أو معتمد يتداخل مع هذه الفترة.',
}
const inputStyle = {
  width: '100%', height: 42, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

function Field({ label, required, error, hint, children }) {
  return <div>
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
      {label}{required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
    </label>
    {children}
    {error && <div style={{ color: 'var(--c-rejected)', fontSize: 11.5, fontWeight: 600, marginTop: 5 }}>{error}</div>}
    {!error && hint && <div style={{ color: 'var(--c-text-3)', fontSize: 11, marginTop: 5 }}>{hint}</div>}
  </div>
}

function getValidationErrors(data) {
  if (!data?.errors || typeof data.errors !== 'object') return {}
  return Object.fromEntries(Object.entries(data.errors).map(([key, value]) => [
    key, Array.isArray(value) ? value.join('، ') : String(value),
  ]))
}

export default function ExcuseLeaveModal({ employee, date, employees = [], onClose, onSubmitted }) {
  const toast = useToast()
  const [userId, setUserId] = useState(employee?.id ? String(employee.id) : '')
  const [startDate, setStartDate] = useState(date ?? '')
  const [endDate, setEndDate] = useState(date ?? '')
  const [leaveType, setLeaveType] = useState('annual')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [forceData, setForceData] = useState(null)
  const selectedEmployee = useMemo(
    () => employee ?? employees.find(item => String(item.id) === userId) ?? null,
    [employee, employees, userId]
  )

  useEffect(() => {
    const onKey = event => {
      if (event.key !== 'Escape' || submitting) return
      if (forceData) setForceData(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forceData, onClose, submitting])

  const body = useMemo(() => ({
    user_id: Number(userId), start_date: startDate, end_date: endDate, leave_type: leaveType,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  }), [userId, startDate, endDate, leaveType, reason])

  const validate = () => {
    const next = {}
    if (!userId) next.user_id = 'الموظف مطلوب.'
    if (!startDate) next.start_date = 'تاريخ البداية مطلوب.'
    if (!endDate) next.end_date = 'تاريخ النهاية مطلوب.'
    if (startDate && endDate && endDate < startDate) next.end_date = 'تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية.'
    if (!leaveType.trim()) next.leave_type = 'نوع الإجازة مطلوب.'
    if (leaveType.length > 100) next.leave_type = 'نوع الإجازة يجب ألا يتجاوز ١٠٠ محرف.'
    if (reason.length > 2000) next.reason = 'السبب يجب ألا يتجاوز ٢٠٠٠ محرف.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (force = false) => {
    if (!force && !validate()) return
    setSubmitting(true); setFormError('')
    try {
      const response = await api.post('/attendance/leave-requests/excuse', { ...body, ...(force ? { force: true } : {}) })
      toast.success('تم تسجيل الإجازة.')
      onSubmitted?.(response.data)
      onClose()
    } catch (error) {
      const status = error?.response?.status
      const data = error?.response?.data ?? {}
      if (status === 403) {
        toast.error('لا تملك صلاحية تسجيل إجازة لهذا الموظف.')
      } else if (status === 422 && data.message === OVER_BALANCE_MESSAGE) {
        const balance = data.balance ?? {}
        setForceData({
          remainingDays: Number(balance.remaining_days ?? 0),
          requestedDays: data.requested_days ?? data.required_days ?? balance.requested_days ?? balance.required_days ?? '—',
        })
      } else {
        const validation = getValidationErrors(data)
        if (Object.keys(validation).length) setErrors(validation)
        else setFormError(BUSINESS_MESSAGES[data.message] ?? data.message ?? 'تعذّر تسجيل الإجازة، حاول مرة أخرى.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={() => !submitting && !forceData && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 60, padding: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(20,32,50,0.52)', backdropFilter: 'blur(2px)',
    }}>
      <div role='dialog' aria-modal='true' aria-label='تسجيل عذر أو إجازة'
        onClick={event => event.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: 'var(--sh-card-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', background: 'var(--c-primary-light)' }}><ShieldCheck size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>تسجيل عذر / إجازة</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>تُسجّل الإجازة معتمدة مباشرة باسم الموارد البشرية.</div>
          </div>
          <button type='button' onClick={onClose} disabled={submitting} title='إغلاق' style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          {formError && <div style={{ padding: '10px 12px', borderRadius: 10, color: 'var(--c-rejected)', background: 'var(--c-rejected-bg)', fontSize: 12.5, fontWeight: 600 }}>{formError}</div>}
          <Field label='الموظف' required error={errors.user_id}>
            {employee ? (
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--c-surface)', color: 'var(--c-text-2)' }}>
                <span style={{ fontWeight: 700 }}>{selectedEmployee?.name ?? '—'}</span>
                {selectedEmployee?.email && <span style={{ color: 'var(--c-text-3)', marginInlineStart: 8, fontSize: 11.5 }}>{selectedEmployee.email}</span>}
              </div>
            ) : (
              <select value={userId} onChange={event => { setUserId(event.target.value); setErrors(value => ({ ...value, user_id: undefined })) }} style={inputStyle}>
                <option value=''>اختر الموظف</option>
                {employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}
              </select>
            )}
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label='من' required error={errors.start_date}>
              <input type='date' value={startDate} onChange={event => { setStartDate(event.target.value); setErrors(value => ({ ...value, start_date: undefined })) }} style={inputStyle} />
            </Field>
            <Field label='إلى' required error={errors.end_date}>
              <input type='date' value={endDate} min={startDate || undefined} onChange={event => { setEndDate(event.target.value); setErrors(value => ({ ...value, end_date: undefined })) }} style={inputStyle} />
            </Field>
          </div>
          <Field label='نوع الإجازة' required error={errors.leave_type}>
            <select value={leaveType} onChange={event => { setLeaveType(event.target.value); setErrors(value => ({ ...value, leave_type: undefined })) }} style={inputStyle}>
              {Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field label='السبب' error={errors.reason} hint={`${reason.length} / ٢٠٠٠`}>
            <textarea value={reason} maxLength={2000} rows={4} placeholder='سبب تسجيل العذر (اختياري)…'
              onChange={event => { setReason(event.target.value); setErrors(value => ({ ...value, reason: undefined })) }}
              style={{ ...inputStyle, height: 'auto', minHeight: 94, padding: 12, resize: 'vertical', lineHeight: 1.6 }} />
          </Field>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type='button' onClick={onClose} disabled={submitting} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>إلغاء</button>
          <button type='button' onClick={() => submit(false)} disabled={submitting} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--c-primary)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? <Loader2 size={14} className='animate-spin' /> : <Check size={14} />} تسجيل الإجازة
          </button>
        </div>
      </div>
      {forceData && (
        <div role='alertdialog' aria-modal='true' aria-label='تجاوز الرصيد' onClick={event => event.stopPropagation()}
          style={{ position: 'fixed', zIndex: 70, width: 'min(430px, calc(100% - 40px))', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(20,32,50,.32)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 20px 14px', textAlign: 'center' }}>
            <div style={{ width: 46, height: 46, margin: '0 auto 12px', borderRadius: 13, background: 'var(--c-pending-bg)', color: 'var(--c-pending)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={22} /></div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-text)', marginBottom: 8 }}>تجاوز الرصيد</div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
              رصيد الموظف المتبقي {forceData.remainingDays} يوم، والعذر يحتاج {forceData.requestedDays} يوم.
              <br />هل تريد تسجيل الإجازة رغم تجاوز الرصيد؟
            </p>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type='button' onClick={() => setForceData(null)} disabled={submitting} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>إلغاء</button>
            <button type='button' onClick={() => submit(true)} disabled={submitting} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--c-pending)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {submitting ? <Loader2 size={14} className='animate-spin' /> : <ShieldCheck size={14} />} تسجيل رغم التجاوز
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
