import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  Calendar, CalendarOff, X, MapPin, LogIn, LogOut, UserCheck,
  AlertTriangle, Plane, Clock, ImageOff, ExternalLink, Loader2,
  ShieldCheck, Building2, Layers, RotateCcw,
} from 'lucide-react'
import { DepartmentSelect, SectionSelect, SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'
import { useDeptSections } from '../utils/useDeptSections'
import { leaveTypeLabel } from '../utils/leave'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'

// ── Date/time helpers (backend sends "Y-m-d H:i:s") ──────────────────────────
function toDate(value) {
  if (!value) return null
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}
function fmtTime(value) {
  const d = toDate(value)
  return d ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : null
}
function fmtDate(value) {
  const d = toDate(value)
  return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
function fmtDateTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  return `${fmtDate(value)} — ${fmtTime(value)}`
}
// datetime-local ("YYYY-MM-DDTHH:mm[:ss]") → backend "YYYY-MM-DD HH:mm:ss"
function toBackendDatetime(local) {
  if (!local) return null
  const [d, t = ''] = local.split('T')
  const time = t.length === 5 ? `${t}:00` : t
  return `${d} ${time}`
}

// The orphan check-in row id needed by the correction endpoint isn't named
// explicitly in the report payload, so read the common variants defensively.
function getRecordId(row) {
  return row?.record_id ?? row?.check_in_id ?? row?.checkin_id ?? row?.attendance_id ?? row?.id ?? null
}
function getCorrection(row) {
  const by = row?.corrected_by
  const at = row?.corrected_at
  if (!by && !at) return null
  const byName = by && typeof by === 'object' ? (by.name ?? by.email) : by
  return { by: byName, at, note: row?.correction_note ?? row?.correction?.note ?? null }
}

// Tooltip for the "تم التصحيح" badge: the correction note and when it was made.
function correctionTooltip({ note, at }) {
  const parts = []
  if (note) parts.push(note)
  if (at) parts.push(`وقت التصحيح: ${fmtDateTime(at)}`)
  return parts.length ? parts.join('\n') : 'تم تصحيح الانصراف بواسطة مشرف'
}

// ── Section / status meta (consistent colors across the report) ──────────────
const SECTIONS = [
  { key: 'present',          label: 'الحاضرون',       icon: UserCheck,     color: 'var(--c-primary)',  bg: 'var(--c-primary-light)' },
  { key: 'checked_in',       label: 'داخل الآن',       icon: LogIn,         color: '#2563EB',           bg: '#EAF1FE' },
  { key: 'checked_out',      label: 'أكملوا الدوام',   icon: LogOut,        color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  { key: 'missing_checkout', label: 'خروج غير مسجّل', icon: AlertTriangle, color: 'var(--c-pending)',   bg: 'var(--c-pending-bg)' },
  { key: 'on_leave',         label: 'في إجازة',        icon: Plane,         color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)' },
]

const STATUS_META = {
  present:          { label: 'حاضر',          color: 'var(--c-primary)',  bg: 'var(--c-primary-light)', icon: UserCheck },
  checked_in:       { label: 'داخل الآن',      color: '#2563EB',           bg: '#EAF1FE',                icon: LogIn },
  checked_out:      { label: 'أكمل الدوام',    color: 'var(--c-approved)', bg: 'var(--c-approved-bg)',   icon: LogOut },
  missing_checkout: { label: 'خروج غير مسجّل', color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)',    icon: AlertTriangle },
  on_leave:         { label: 'في إجازة',       color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)',   icon: Plane },
}

// ── Small atoms ──────────────────────────────────────────────────────────────
function InitialsTag({ name, size = 34 }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--c-primary), #1C3A5E)',
      color: '#fff', fontWeight: 800, fontSize: size * 0.34,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}

function StatusBadge({ status }) {
  const m = STATUS_META[status]
  if (!m) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const Icon = m.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: m.color,
      background: m.bg, border: `1px solid ${m.color}22`, whiteSpace: 'nowrap',
    }}>
      <Icon size={12} />
      {m.label}
    </span>
  )
}

function EmployeeCell({ name, email }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <InitialsTag name={name} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{name ?? '—'}</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{email ?? '—'}</div>
      </div>
    </div>
  )
}

function DeptSectionCell({ department, section }) {
  if (!department && !section) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {department && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
          <Building2 size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          {department}
        </span>
      )}
      {section && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--c-text-3)' }}>
          <Layers size={11} style={{ flexShrink: 0 }} />
          {section}
        </span>
      )}
    </div>
  )
}

function MapLink({ loc }) {
  const lat = loc?.latitude, lng = loc?.longitude
  if (lat == null || lng == null) return null
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
      title="عرض الموقع على الخريطة"
      className="text-[var(--c-text-3)] hover:text-[var(--c-primary)]"
      style={{ display: 'inline-flex', alignItems: 'center', transition: 'color .14s' }}
    >
      <MapPin size={13} />
    </a>
  )
}

function SelfieThumb({ url, onClick }) {
  const [err, setErr] = useState(false)
  if (!url) return null
  if (err) {
    return (
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: 'var(--c-surface-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ImageOff size={13} style={{ color: 'var(--c-text-3)' }} />
      </span>
    )
  }
  return (
    <button
      onClick={onClick} title="عرض الصورة"
      style={{
        width: 30, height: 30, borderRadius: 8, padding: 0, flexShrink: 0,
        border: '1px solid var(--c-border)', cursor: 'pointer', overflow: 'hidden', background: 'none',
      }}
    >
      <img
        src={url} alt="صورة" onError={() => setErr(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </button>
  )
}

// Check-in / check-out compound cell: time + selfie thumb + map pin.
function PunchCell({ time, selfie, loc, onViewSelfie, label, missing }) {
  const t = fmtTime(time)
  if (!t && missing) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
        color: 'var(--c-pending)', background: 'var(--c-pending-bg)', padding: '4px 9px', borderRadius: 999,
        border: '1px solid var(--c-pending)22', whiteSpace: 'nowrap',
      }}>
        <AlertTriangle size={11} />
        لم يُسجَّل
      </span>
    )
  }
  if (!t) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t}</div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <SelfieThumb url={selfie} onClick={() => onViewSelfie({ url: selfie, label, time })} />
        <MapLink loc={loc} />
      </div>
    </div>
  )
}

// Display only `work_hours_formatted` from the API ("8h 30m"); it is null until
// the check-out row exists (work still in progress). No client-side formatting.
function WorkHoursCell({ formatted }) {
  if (formatted == null) {
    return <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>غير مكتمل</span>
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
      color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    }}>
      <Clock size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      {formatted}
    </span>
  )
}

// ── Attendance report row ────────────────────────────────────────────────────
function AttendanceRow({ row, last, onViewSelfie, onCorrect, showActions }) {
  const [hov, setHov] = useState(false)
  const correction = getCorrection(row)
  const isMissing = row.status === 'missing_checkout' || (row.check_in_time && !row.check_out_time)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: isMissing ? 'rgba(200,163,107,0.05)' : hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}><EmployeeCell name={row.name} email={row.email} /></td>
      <td style={{ padding: '12px 16px' }}><DeptSectionCell department={row.department} section={row.section} /></td>
      <td style={{ padding: '12px 16px' }}>
        <PunchCell time={row.check_in_time} selfie={row.check_in_selfie} loc={row.check_in_location}
          onViewSelfie={onViewSelfie} label="صورة الدخول" />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <PunchCell time={row.check_out_time} selfie={row.check_out_selfie} loc={row.check_out_location}
          onViewSelfie={onViewSelfie} label="صورة الخروج" missing={isMissing} />
        {correction && (
          <span title={correctionTooltip(correction)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5,
            fontSize: 10.5, fontWeight: 700, color: 'var(--c-approved)', cursor: 'help',
          }}>
            <ShieldCheck size={11} />
            تم التصحيح
          </span>
        )}
      </td>
      <td style={{ padding: '12px 16px' }}><WorkHoursCell formatted={row.work_hours_formatted} /></td>
      <td style={{ padding: '12px 16px' }}><StatusBadge status={row.status} /></td>
      {showActions && (
        <td style={{ padding: '12px 16px' }}>
          {isMissing && !correction && (
            <button
              onClick={() => onCorrect(row)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 12px', borderRadius: 9,
                background: 'var(--c-primary)', color: '#fff', border: 'none',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              className="hover:opacity-90"
            >
              <Clock size={12} />
              تصحيح الخروج
            </button>
          )}
          {correction && (
            <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{fmtDateTime(correction.at)}</span>
          )}
        </td>
      )}
    </tr>
  )
}

// ── Leave report row ─────────────────────────────────────────────────────────
function LeaveReportRow({ row, last }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent', transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}><EmployeeCell name={row.name} email={row.email} /></td>
      <td style={{ padding: '12px 16px' }}><DeptSectionCell department={row.department} section={row.section} /></td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
          fontSize: 11.5, fontWeight: 700, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
        }}>
          {leaveTypeLabel(row.leave_type)}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmtDate(row.start_date)} — {fmtDate(row.end_date)}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveStatusBadge status="approved_leave" /></td>
    </tr>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow({ count }) {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {Array.from({ length: count }, (_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: i === 0 ? 34 : 16, width: i === 0 ? 160 : 90, borderRadius: i === 0 ? 17 : 7, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Summary tile (also the section switcher) ─────────────────────────────────
function SummaryTile({ meta, count, active, onClick }) {
  const Icon = meta.icon
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 15px', borderRadius: 12, cursor: 'pointer', textAlign: 'right',
        background: '#fff', fontFamily: 'var(--font-sans)',
        border: active ? `1.5px solid ${meta.color}` : '1px solid var(--c-border)',
        boxShadow: active ? `0 0 0 3px ${meta.color}1a` : 'none',
        transition: 'border-color .14s, box-shadow .14s',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: meta.bg, color: meta.color,
      }}>
        <Icon size={19} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{meta.label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </div>
      </div>
    </button>
  )
}

// ── Correction dialog ────────────────────────────────────────────────────────
function CorrectionDialog({ row, reportDate, onClose, onDone }) {
  const toast = useToast()
  const recordId = getRecordId(row)
  const checkInDate = toDate(row.check_in_time)
  // Default to the checkout-reminder time (17:00) on the report day.
  const [datetime, setDatetime] = useState(`${reportDate}T17:00`)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const minAttr = checkInDate
    ? `${row.check_in_time.slice(0, 10)}T${row.check_in_time.slice(11, 16)}`
    : undefined

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
      const msg = data?.errors
        ? Object.values(data.errors).flat().join('، ')
        : (data?.message ?? 'تعذّر تصحيح السجل، حاول مرة أخرى')
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
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
              {row.name} — دخول {fmtTime(row.check_in_time) ?? '—'}
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
              type="datetime-local" value={datetime} min={minAttr}
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
            onClick={submit} disabled={submitting || timeInvalid || !recordId}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 10,
              background: 'var(--c-primary)', color: '#fff', border: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              cursor: (submitting || timeInvalid || !recordId) ? 'default' : 'pointer',
              opacity: (submitting || timeInvalid || !recordId) ? 0.7 : 1,
            }}
            className="hover:opacity-90"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            تأكيد التصحيح
          </button>
          <button
            onClick={onClose}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, background: '#fff', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)', cursor: 'pointer',
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Selfie preview modal ─────────────────────────────────────────────────────
function SelfiePreview({ data, onClose }) {
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card-lg)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>{data.label ?? 'الصورة'}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{fmtDateTime(data.time)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {status === 'loaded' && (
              <button
                onClick={() => window.open(data.url, '_blank', 'noopener,noreferrer')} title="فتح في تبويب جديد"
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ExternalLink size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--c-surface)' }}>
          {status === 'loading' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>جارٍ تحميل الصورة...</span>
            </div>
          )}
          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <ImageOff size={28} style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>تعذّر تحميل الصورة</span>
            </div>
          )}
          <img
            src={data.url} alt={data.label ?? 'صورة'}
            onLoad={() => setStatus('loaded')} onError={() => setStatus('error')}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'loaded' ? 'block' : 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff',
  padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

export default function AttendanceReportPage() {
  const { user } = useAuth()
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance

  const [date, setDate]           = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [search, setSearch]       = useState('')
  const [departments, setDepartments] = useState([])

  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('present')
  const [selfie, setSelfie]   = useState(null)
  const [correcting, setCorrecting] = useState(null)
  // Applied to the rows of every report section; null keeps the documented
  // per-section default order.
  const [sort, setSort] = useState(null)

  const sections = useDeptSections(departmentId, departments, { canFetch: user?.role === 'admin' })
  const reqRef = useRef(0)

  useEffect(() => {
    if (!hasFullAccess) return
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [hasFullAccess])

  // Clear an orphan section whenever the department changes.
  useEffect(() => { setSectionId('') }, [departmentId])

  // Shared by the fetch and the XLSX export so the file mirrors the view.
  const buildParams = useCallback(() => {
    const params = {}
    if (date)          params.date          = date
    if (departmentId)  params.department_id = departmentId
    if (sectionId)     params.section_id    = sectionId
    if (search.trim()) params.search        = search.trim()
    return { ...params, ...sortParams(sort) }
  }, [date, departmentId, sectionId, search, sort])

  const fetchReport = useCallback(async () => {
    const reqId = ++reqRef.current
    setLoading(true)
    try {
      const res = await api.get('/attendance/report', { params: buildParams() })
      if (reqId !== reqRef.current) return
      setReport(res.data ?? null)
    } catch {
      if (reqId === reqRef.current) setReport(null)
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [buildParams])

  useEffect(() => { fetchReport() }, [fetchReport])

  useEffect(() => {
    const handler = () => fetchReport()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchReport])

  const summary = report?.summary ?? {}
  const countFor = key => summary[key] ?? (Array.isArray(report?.[key]) ? report[key].length : 0)

  const isLeaveSection = section === 'on_leave'
  const rows = report?.[section] ?? []
  const showActions = section === 'missing_checkout'

  // `field` = sortable (report whitelist: name, email, department, section,
  // status, check_in_time, check_out_time, work_hours — applies to all sections).
  const ATT_COLS = [
    { label: 'الموظف', field: 'name' },
    { label: 'القسم', field: 'department' },
    { label: 'الدخول', field: 'check_in_time' },
    { label: 'الخروج', field: 'check_out_time' },
    { label: 'ساعات العمل', field: 'work_hours' },
    { label: 'الحالة', field: 'status' },
  ]
  const cols = isLeaveSection
    ? [
        { label: 'الموظف', field: 'name' },
        { label: 'القسم', field: 'department' },
        { label: 'نوع الإجازة' },
        { label: 'الفترة' },
        { label: 'حالة الإجازة' },
      ]
    : showActions ? [...ATT_COLS, { label: 'إجراءات' }] : ATT_COLS

  const activeMeta = SECTIONS.find(s => s.key === section)
  const reportDate = report?.date || date || ''

  const emptyLabel = {
    present:          'لا يوجد حاضرون في هذا اليوم',
    checked_in:       'لا أحد داخل العمل حالياً',
    checked_out:      'لم يُكمل أحد الدوام بعد',
    missing_checkout: 'لا توجد سجلات خروج غير مكتملة',
    on_leave:         'لا يوجد موظفون في إجازة معتمدة',
  }[section]

  const hasFilters = Boolean(date || departmentId || sectionId || search)

  // Fri/Sat (or configured holidays) — the board would otherwise read as if
  // everyone is absent, so show an explicit non-working-day state instead.
  const nonWorkingDay = !loading && report?.working_day === false

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          التقرير اليومي للحضور
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          ملخّص حضور اليوم: الحاضرون، من أكمل الدوام، من نسي تسجيل الخروج، والموظفون في إجازة معتمدة.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <SearchInput value={search} onChange={setSearch} />
        {hasFullAccess && <DepartmentSelect departments={departments} value={departmentId} onChange={setDepartmentId} />}
        {hasFullAccess && <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={!departmentId} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
        </div>
        {hasFilters && (
          <button
            onClick={() => { setDate(''); setDepartmentId(''); setSectionId(''); setSearch('') }}
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
        {/* report_section restricts the workbook to the active tile's sheet
            (plus the summary) so the file matches what's on screen */}
        <ExportButton
          url="/attendance/report" params={{ ...buildParams(), report_section: section }}
          filename="attendance-daily-report.xlsx"
        />
        <div style={{ flex: 1 }} />
        {reportDate && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '6px 12px' }}>
            ليوم {fmtDate(reportDate)}
          </span>
        )}
      </div>

      {nonWorkingDay ? (
        /* Non-working day (Fri/Sat or configured holiday) — no attendance expected */
        <div style={{
          background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
          boxShadow: 'var(--sh-card)', padding: '56px 24px', textAlign: 'center',
        }}>
          <CalendarOff size={36} style={{ color: 'var(--c-text-3)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 4px', color: 'var(--c-text)', fontSize: 16, fontWeight: 800 }}>
            يوم عطلة
          </p>
          <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 13.5, lineHeight: 1.6 }}>
            هذا اليوم ليس يوم عمل — لا يُتوقع تسجيل حضور.
          </p>
        </div>
      ) : (
      <>
      {/* Summary tiles / section switcher */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {SECTIONS.map(meta => (
          <SummaryTile
            key={meta.key} meta={meta} count={countFor(meta.key)}
            active={section === meta.key} onClick={() => setSection(meta.key)}
          />
        ))}
      </div>

      {/* Active section table */}
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)' }}>
        {/* Section heading */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeMeta && (
            <span style={{ width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: activeMeta.bg, color: activeMeta.color, flexShrink: 0 }}>
              <activeMeta.icon size={16} />
            </span>
          )}
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>{activeMeta?.label}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px' }}>
            {countFor(section)}
          </span>
          {section === 'missing_checkout' && countFor('missing_checkout') > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginInlineStart: 'auto' }}>
              يُغلق اليوم تلقائياً الساعة 22:00 — صحّح الخروج لاحتساب ساعات العمل
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {cols.map(c => (
                  <SortableTh key={c.label} label={c.label} field={c.field} sort={sort} onSort={setSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} count={cols.length} />)
                : isLeaveSection
                  ? rows.map((r, idx) => <LeaveReportRow key={r.user_id ?? idx} row={r} last={idx === rows.length - 1} />)
                  : rows.map((r, idx) => (
                      <AttendanceRow
                        key={getRecordId(r) ?? r.user_id ?? idx} row={r} last={idx === rows.length - 1}
                        onViewSelfie={setSelfie} onCorrect={setCorrecting} showActions={showActions}
                      />
                    ))
              }
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            {activeMeta && <activeMeta.icon size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />}
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>{emptyLabel}</p>
          </div>
        )}
      </div>
      </>
      )}

      {selfie && <SelfiePreview data={selfie} onClose={() => setSelfie(null)} />}
      {correcting && (
        <CorrectionDialog
          row={correcting} reportDate={reportDate || new Date().toISOString().slice(0, 10)}
          onClose={() => setCorrecting(null)} onDone={fetchReport}
        />
      )}
    </div>
  )
}
