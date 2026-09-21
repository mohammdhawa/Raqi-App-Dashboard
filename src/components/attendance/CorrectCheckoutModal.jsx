// The one dialog behind every missing-checkout correction, shared by the daily
// report and the per-employee day grid.
//
// A day the employee never closed is worth zero work hours until someone says
// when they actually left, so the fix has to be reachable from wherever HR
// notices it — the daily board on the day, or the monthly drill-down weeks
// later. Both open this.

import { useState, useEffect } from 'react'
import { X, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useToast } from '../ui/Toast'
import { parseApiDate, formatTime } from '../../utils/attendanceCapture'

// datetime-local ("YYYY-MM-DDTHH:mm[:ss]") → backend "YYYY-MM-DD HH:mm:ss"
function toBackendDatetime(local) {
  if (!local) return null
  const [d, t = ''] = local.split('T')
  const time = t.length === 5 ? `${t}:00` : t
  return `${d} ${time}`
}

// The check-in timestamp as the input's `min`, sliced straight out of the API
// string rather than reformatted — the value is already in the attendance
// timezone, and re-deriving it through the viewer's would shift the bound.
function minAttribute(checkInTime) {
  if (!checkInTime) return undefined
  const s = String(checkInTime)
  return `${s.slice(0, 10)}T${s.slice(11, 16)}`
}

/**
 * @param {object} target { recordId, name, checkInTime, date }
 *                        `recordId` is the orphan check-in row, `date` the day
 *                        being corrected (defaults the picker to 17:00 on it).
 * @param {Function} onDone called after a success — and after a 403, where the
 *                        row that opened this may simply be stale — so the
 *                        caller refetches rather than patching a row.
 */
export default function CorrectCheckoutModal({ target, onClose, onDone }) {
  const toast = useToast()
  const recordId = target?.recordId ?? null
  const checkInDate = parseApiDate(target?.checkInTime)
  const day = target?.date ?? String(target?.checkInTime ?? '').slice(0, 10)

  // Default to the checkout-reminder time (17:00) on the day being corrected.
  const [datetime, setDatetime] = useState(day ? `${day}T17:00` : '')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  // Mirror the backend rule (وقت الانصراف يجب أن يكون بعد وقت الحضور) client-side so
  // we can disable the submit and warn live before the request is ever sent.
  const chosen = datetime ? new Date(datetime) : null
  const timeInvalid = !chosen || Number.isNaN(chosen.getTime()) || (checkInDate && chosen <= checkInDate)
  const liveError = datetime && checkInDate && chosen && chosen <= checkInDate
    ? 'وقت الانصراف يجب أن يكون بعد وقت الحضور'
    : ''

  const submit = async () => {
    setError('')
    if (!datetime) { setError('يرجى تحديد وقت الخروج'); return }
    if (timeInvalid) { setError('وقت الانصراف يجب أن يكون بعد وقت الحضور'); return }
    if (!recordId) { setError('تعذّر تحديد سجل الدخول المراد تصحيحه'); return }
    setSubmitting(true)
    try {
      const body = { checked_out_at: toBackendDatetime(datetime) }
      if (note.trim()) body.note = note.trim()
      await api.patch(`/attendance/records/${recordId}/checkout`, body)
      toast.success('تم تسجيل الخروج وتصحيح السجل')
      onDone()
      onClose()
    } catch (err) {
      const data = err.response?.data

      // 403 covers both "you may not touch this record" and "this record does
      // not exist": the route pins its missing-model handler to the same 403 as
      // the authorization middleware, so the two are indistinguishable by
      // design and neither may be reported as a missing record. The row that
      // opened this dialog may simply be stale, so the view is pulled again.
      if (err.response?.status === 403) {
        setError('ليس لديك صلاحية لتصحيح هذا السجل، أو لم يعد السجل متاحاً. تم تحديث التقرير.')
        onDone()
      } else {
        // 422 keeps carrying the field validation and the business rules
        // (wrong record type, nothing to correct, checkout before check-in).
        setError(data?.errors
          ? Object.values(data.errors).flat().join('، ')
          : (data?.message ?? 'تعذّر تصحيح السجل، حاول مرة أخرى'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = submitting || timeInvalid || !recordId

  return (
    <div
      onClick={() => { if (!submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card-lg)' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>تصحيح الخروج المنسي</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {target?.name ?? '—'} — دخول {formatTime(target?.checkInTime) || '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 10,
            background: 'var(--c-pending-bg)', border: '1px solid var(--c-pending)22',
          }}>
            <AlertTriangle size={15} style={{ color: 'var(--c-pending)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: 'var(--c-text-2)' }}>
              لم يُسجِّل الموظف خروجه وأُغلق اليوم تلقائياً. حدّد وقت الخروج الفعلي ليُحتسب وقت العمل،
              وسيُسجَّل اسمك ووقت التصحيح في سجل المراجعة.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
              وقت الخروج الفعلي
            </label>
            <input
              type="datetime-local" value={datetime} min={minAttribute(target?.checkInTime)}
              onChange={e => setDatetime(e.target.value)}
              style={{
                width: '100%', height: 40, borderRadius: 10, border: '1px solid var(--c-border)',
                background: '#fff', padding: '0 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--c-text)', outline: 'none',
              }}
            />
            {liveError && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)' }}>
                {liveError}
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
              ملاحظة (اختياري)
            </label>
            <textarea
              value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="سبب التصحيح أو مرجعه..."
              style={{
                width: '100%', borderRadius: 10, border: '1px solid var(--c-border)',
                background: '#fff', padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--c-text)', outline: 'none', resize: 'vertical', lineHeight: 1.6,
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-rejected)', background: 'var(--c-rejected-bg)', padding: '8px 12px', borderRadius: 9 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-start', gap: 10 }}>
          <button
            onClick={submit} disabled={disabled}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 10,
              background: 'var(--c-primary)', color: '#fff', border: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
            }}
            className="hover:opacity-90"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            تأكيد التصحيح
          </button>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, background: '#fff', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)',
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
