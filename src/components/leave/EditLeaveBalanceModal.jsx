import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import api from '../../services/api'
import { useToast } from '../ui/Toast'
import { LEAVE_COPY } from '../../utils/leave'

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
    {!error && hint && <div style={{ color: 'var(--c-text-3)', fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
  </div>
}

export default function EditLeaveBalanceModal({ row, defaultDays, selectedYear, onClose, onSaved }) {
  const toast = useToast()
  const adjustment = Number(row.adjustment_days ?? 0)
  const effective = Number(row.allocated_days ?? defaultDays ?? 0)
  const [allocatedDays, setAllocatedDays] = useState(row.is_custom ? Math.max(0, effective - adjustment) : Number(defaultDays ?? effective))
  const [adjustmentDays, setAdjustmentDays] = useState(adjustment)
  const [note, setNote] = useState(row.note ?? '')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const validate = () => {
    const next = {}
    if (allocatedDays === '' || !Number.isInteger(Number(allocatedDays)) || Number(allocatedDays) < 0 || Number(allocatedDays) > 365) next.allocated_days = 'الرصيد السنوي يجب أن يكون عدداً صحيحاً بين ٠ و٣٦٥.'
    if (adjustmentDays !== '' && (!Number.isInteger(Number(adjustmentDays)) || Number(adjustmentDays) < -365 || Number(adjustmentDays) > 365)) next.adjustment_days = 'التسوية يجب أن تكون عدداً صحيحاً بين −٣٦٥ و٣٦٥.'
    if (note.length > 255) next.note = 'الملاحظة يجب ألا تتجاوز ٢٥٥ محرفاً.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const response = await api.put(`/attendance/users/${row.user.id}/leave-balance`, {
        allocated_days: Number(allocatedDays), year: Number(selectedYear),
        adjustment_days: Number(adjustmentDays || 0), note: note.trim() || null,
      })
      toast.success('تم تحديث الرصيد.')
      onSaved(response.data?.balance ?? {})
      onClose()
    } catch (error) {
      const status = error?.response?.status
      const data = error?.response?.data ?? {}
      if (status === 403) {
        toast.error('لا تملك صلاحية تعديل رصيد هذا الموظف.')
      } else if (status === 422 && data.message === 'Allocation is lower than the days already approved for this year.') {
        const used = Number(data.used_days ?? row.used_days ?? 0).toLocaleString('ar-EG')
        setErrors(value => ({ ...value, allocated_days: `لا يمكن أن يكون الرصيد أقل من الأيام المعتمدة بالفعل هذا العام (${used} أيام).` }))
      } else if (status === 422 && data.errors) {
        setErrors(Object.fromEntries(Object.entries(data.errors).map(([key, value]) => [key, Array.isArray(value) ? value.join('، ') : String(value)])))
      } else {
        toast.error(data.message ?? 'تعذّر تحديث الرصيد، حاول مرة أخرى.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,32,50,0.52)', backdropFilter: 'blur(2px)' }}>
      <div role='dialog' aria-modal='true' aria-label='تعديل رصيد الإجازات' onClick={event => event.stopPropagation()} style={{ width: 'min(540px, 100%)', background: '#fff', borderRadius: 16, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>تعديل رصيد الإجازات — {row.user.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 4 }}>
              السنة {selectedYear} · مستخدم {row.used_days} يوم · متبقي {row.remaining_days} يوم
              {/* Approved days under a non-deducting type — never part of
                  used_days, so they are named apart from it. */}
              {Number(row.non_deducting_days ?? 0) > 0 && (
                <span title={LEAVE_COPY.nonDeductingDaysHint}> · {LEAVE_COPY.nonDeductingDays} {row.non_deducting_days} يوم</span>
              )}
            </div>
          </div>
          <button type='button' onClick={onClose} disabled={submitting} title='إغلاق' style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          {!row.is_custom && <div style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--c-primary-light)', color: 'var(--c-primary)', fontSize: 12, fontWeight: 700 }}>هذا الموظف يستخدم الرصيد الافتراضي حالياً.</div>}
          <Field label='الرصيد السنوي' required error={errors.allocated_days}>
            <input type='number' min='0' max='365' step='1' value={allocatedDays} onChange={event => { setAllocatedDays(event.target.value); setErrors(value => ({ ...value, allocated_days: undefined })) }} style={inputStyle} />
          </Field>
          <Field label='تسوية (ترحيل/خصم)' error={errors.adjustment_days} hint='رصيد مرحّل من العام السابق (+) أو خصم (−)'>
            <input type='number' min='-365' max='365' step='1' value={adjustmentDays} onChange={event => { setAdjustmentDays(event.target.value); setErrors(value => ({ ...value, adjustment_days: undefined })) }} style={inputStyle} />
          </Field>
          <Field label='ملاحظة' error={errors.note} hint={`${note.length} / ٢٥٥`}>
            <textarea value={note} maxLength={255} rows={3} onChange={event => { setNote(event.target.value); setErrors(value => ({ ...value, note: undefined })) }} style={{ ...inputStyle, height: 'auto', minHeight: 82, padding: 12, resize: 'vertical' }} />
          </Field>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type='button' onClick={onClose} disabled={submitting} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>إلغاء</button>
          <button type='button' onClick={submit} disabled={submitting} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--c-primary)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? <Loader2 size={14} className='animate-spin' /> : <Check size={14} />} حفظ التعديل
          </button>
        </div>
      </div>
    </div>
  )
}
