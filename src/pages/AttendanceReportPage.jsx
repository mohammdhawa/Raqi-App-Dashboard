import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  Calendar, CalendarOff, X, MapPin, LogIn, LogOut, UserCheck,
  AlertTriangle, Plane, Clock, ImageOff, ExternalLink, Loader2,
  ShieldCheck, ShieldX, Building2, Layers, ArrowLeft, Undo2, CalendarCheck,
} from 'lucide-react'
import { DepartmentSelect, SectionSelect, SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh } from '../components/attendance/controls'
import RejectRecordModal from '../components/attendance/RejectRecordModal'
import CorrectCheckoutModal from '../components/attendance/CorrectCheckoutModal'
import { readCorrection, correctionTooltip } from '../utils/attendanceCorrection'
import UndoExcuseModal from '../components/leave/UndoExcuseModal'
import ReturnToWorkModal from '../components/leave/ReturnToWorkModal'
import { sortParams } from '../utils/attendanceQuery'
import { damascusToday } from '../utils/attendanceCapture'
import { useDeptSections } from '../utils/useDeptSections'
import { leaveTypeName, deductsBalance, EXCUSED_META, LEAVE_COPY } from '../utils/leave'
import {
  readRejection, canRejectRecord, formatRejectedAt, REJECTION_COPY,
} from '../utils/attendanceRejection'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'
import LeaveExcuseBadge from '../components/ui/LeaveExcuseBadge'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'

const ATTENDANCE_TIME_ZONE = 'Asia/Damascus'

// ── Date/time helpers (backend sends "Y-m-d H:i:s") ──────────────────────────
function toDate(value) {
  if (!value) return null
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}
function fmtTime(value) {
  const d = toDate(value)
  return d ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: ATTENDANCE_TIME_ZONE }) : null
}
function fmtDate(value) {
  const d = toDate(value)
  return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ATTENDANCE_TIME_ZONE }) : '—'
}
function fmtDateTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  return `${fmtDate(value)} — ${fmtTime(value)}`
}
// The orphan check-in row id needed by the correction endpoint isn't named
// explicitly in the report payload, so read the common variants defensively.
function getRecordId(row) {
  return row?.record_id ?? row?.check_in_id ?? row?.checkin_id ?? row?.attendance_id ?? row?.id ?? null
}

// ── Section / status meta (consistent colors across the report) ──────────────
const SECTIONS = [
  { key: 'present',          label: 'الحاضرون',       icon: UserCheck,     color: 'var(--c-primary)',  bg: 'var(--c-primary-light)' },
  { key: 'checked_in',       label: 'داخل الآن',       icon: LogIn,         color: '#2563EB',           bg: '#EAF1FE' },
  { key: 'checked_out',      label: 'أكملوا الدوام',   icon: LogOut,        color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  { key: 'missing_checkout', label: 'خروج غير مسجّل', icon: AlertTriangle, color: 'var(--c-pending)',   bg: 'var(--c-pending-bg)' },
  { key: 'on_leave',         label: 'في إجازة',        icon: Plane,         color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)' },
  // Disjoint from on_leave: an absence HR justified after the fact appears only
  // here, never among the planned-leave rows.
  { key: 'excused',          label: LEAVE_COPY.excusedStatus, icon: ShieldCheck, color: EXCUSED_META.color, bg: EXCUSED_META.bg },
  // Days whose check-in HR refused and the employee has not re-recorded. They
  // appear in no other section and count as absent everywhere else.
  {
    key: 'rejected', label: REJECTION_COPY.section, icon: ShieldX,
    color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)',
    title: REJECTION_COPY.sectionHint,
  },
]

const STATUS_META = {
  present:          { label: 'حاضر',          color: 'var(--c-primary)',  bg: 'var(--c-primary-light)', icon: UserCheck },
  checked_in:       { label: 'داخل الآن',      color: '#2563EB',           bg: '#EAF1FE',                icon: LogIn },
  checked_out:      { label: 'أكمل الدوام',    color: 'var(--c-approved)', bg: 'var(--c-approved-bg)',   icon: LogOut },
  missing_checkout: { label: 'خروج غير مسجّل', color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)',    icon: AlertTriangle },
  on_leave:         { label: 'في إجازة',       color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)',   icon: Plane },
  excused:          { label: EXCUSED_META.label, color: EXCUSED_META.color, bg: EXCUSED_META.bg,         icon: ShieldCheck },
  // Derived, never a raw record's `status` — a refusal lives in `rejected_at`.
  rejected:         { label: REJECTION_COPY.dayStatus, color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)', icon: ShieldX },
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

// The `rejection` block of a refused row: the grounds (rendered from the
// payload's own `reason_label`, never re-derived), the note, and who refused it
// when. This is the audit trail HR will be asked about.
function RejectionCell({ rejection }) {
  if (!rejection) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 280 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-rejected)', lineHeight: 1.5 }}>
        {rejection.label}
      </span>
      {rejection.note && (
        <span style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.5 }} title={rejection.note}>
          {REJECTION_COPY.note}: {rejection.note}
        </span>
      )}
      <span style={{ fontSize: 10.5, color: 'var(--c-text-3)', lineHeight: 1.5 }}>
        {rejection.by ? `${REJECTION_COPY.by}: ${rejection.by}` : ''}
        {rejection.by && rejection.at ? ' · ' : ''}
        {rejection.at ? formatRejectedAt(rejection.at) : ''}
      </span>
    </div>
  )
}

const rowActionStyle = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px', borderRadius: 9, border: 'none',
  background: bg, color, fontFamily: 'var(--font-sans)',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
})

// ── Attendance report row ────────────────────────────────────────────────────
function AttendanceRow({
  row, last, onViewSelfie, onCorrect, onReject, onUndoReject,
  showActions, showCorrection, showRejection, canReject,
}) {
  const [hov, setHov] = useState(false)
  const correction = readCorrection(row)
  const rejection = readRejection(row)
  // A refused day has no check-out to be missing — it has no attendance at all,
  // so it must not borrow the "forgot to check out" warning.
  const isMissing = !rejection
    && (row.status === 'missing_checkout' || (row.check_in_time && !row.check_out_time))
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: rejection
          ? 'rgba(192,57,43,0.045)'
          : isMissing ? 'rgba(200,163,107,0.05)' : hov ? 'rgba(34,65,103,0.015)' : 'transparent',
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
      {showRejection && (
        <td style={{ padding: '12px 16px' }}><RejectionCell rejection={rejection} /></td>
      )}
      {showActions && (
        <td style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {showCorrection && isMissing && !correction && (
              <button
                onClick={() => onCorrect(row)}
                style={rowActionStyle('var(--c-primary)', '#fff')}
                className="hover:opacity-90"
              >
                <Clock size={12} />
                تصحيح الخروج
              </button>
            )}
            {/* A refusal is offered on rows that still stand, undo on the ones
                already refused — never both, and neither on a row this viewer
                cannot reach (it could only come back 403). */}
            {canReject && (rejection ? (
              <button
                onClick={() => onUndoReject(row)}
                style={rowActionStyle('var(--c-surface-2)', 'var(--c-text-2)')}
                className="hover:opacity-90"
              >
                <ShieldCheck size={12} />
                {REJECTION_COPY.undo}
              </button>
            ) : (
              <button
                onClick={() => onReject(row)}
                title="رفض تسجيل غير مطابق — الموقع أو الصورة"
                style={rowActionStyle('var(--c-rejected-bg)', 'var(--c-rejected)')}
                className="hover:opacity-90"
              >
                <ShieldX size={12} />
                {REJECTION_COPY.reject}
              </button>
            ))}
            {showCorrection && correction && (
              <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{fmtDateTime(correction.at)}</span>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

// ── Leave / excuse report row ────────────────────────────────────────────────
// Serves both leave sections. On an excused row the `excuse` block behind the
// absence — its reason and who recorded it — is the audit trail HR needs, so it
// gets its own columns rather than a tooltip.
function LeaveReportRow({ row, last, showExcuse, onUndoExcuse, onReturnToWork }) {
  const [hov, setHov] = useState(false)
  const excuse = row.excuse ?? null
  const deducts = deductsBalance(row)
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
            fontSize: 11.5, fontWeight: 700, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
          }}>
            {leaveTypeName(row)}
          </span>
          {deducts === false && <DeductsBalanceBadge deducts={false} compact short />}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmtDate(row.start_date)} — {fmtDate(row.end_date)}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <LeaveStatusBadge status='approved_leave' />
          {row.is_excuse && <LeaveExcuseBadge compact />}
        </div>
      </td>
      {showExcuse && (
        <>
          <td style={{ padding: '12px 16px' }}>
            {excuse?.reason
              ? <div style={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.5, maxWidth: 260 }} title={excuse.reason}>{excuse.reason}</div>
              : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
          </td>
          <td style={{ padding: '12px 16px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
              {excuse?.recorded_by ?? 'الموارد البشرية'}
            </span>
          </td>
          {/* Only an HR-filed excuse can be undone — an employee's own request
              is decided through its approval chain and the endpoint answers 422
              for one. The section is excuses by definition, so `is_excuse` is
              belt and braces against a row that arrived without its block. */}
          <td style={{ padding: '12px 16px' }}>
            {row.is_excuse && excuse?.leave_request_id ? (
              <button
                onClick={() => onUndoExcuse(row)} title={LEAVE_COPY.undoExcuseTitle}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 31, padding: '0 10px',
                  borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff',
                  fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 800,
                  color: 'var(--c-text-2)', whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                <Undo2 size={13} /> {LEAVE_COPY.undoExcuse}
              </button>
            ) : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
          </td>
        </>
      )}
      {/* Planned leave: the employee turned up anyway. Not an undo — the leave
          ends at the days actually taken and the approval stands — but it is
          what frees today for a check-in, which is why it belongs on the daily
          board and not only in the leave register. */}
      {!showExcuse && (
        <td style={{ padding: '12px 16px' }}>
          {row.leave_request_id ? (
            <button
              onClick={() => onReturnToWork(row)} title={LEAVE_COPY.returnToWorkTitle}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 31, padding: '0 10px',
                borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 800,
                color: 'var(--c-text-2)', whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              <CalendarCheck size={13} /> {LEAVE_COPY.returnToWork}
            </button>
          ) : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
        </td>
      )}
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
      onClick={onClick} title={meta.title}
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
  const toast = useToast()
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
  // { row, mode } — one dialog for both directions of a refusal.
  const [rejecting, setRejecting]   = useState(null)
  // The excused row whose HR excuse is being retracted.
  const [undoingExcuse, setUndoingExcuse] = useState(null)
  // The on-leave row whose employee turned up at work anyway.
  const [returningToWork, setReturningToWork] = useState(null)
  // Applied to the rows of every report section; null keeps the documented
  // per-section default order.
  const [sort, setSort] = useState(null)

  // Managers/chiefs have no department picker (dept-locked server-side) but
  // may still filter by section — feed them their own department's sections.
  const sectionDeptId = hasFullAccess ? departmentId : (user?.department_id ?? '')
  const sections = useDeptSections(sectionDeptId, departments, { canFetch: user?.role === 'admin' })
  const reqRef = useRef(0)

  // The /attendance/departments route allows every attendance viewer, and
  // managers need it for their own department's nested sections.
  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [])

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

  const isExcusedSection = section === 'excused'
  const isLeaveSection = section === 'on_leave' || isExcusedSection
  const isRejectedSection = section === 'rejected'
  const rows = report?.[section] ?? []
  const showCorrection = section === 'missing_checkout'
  // Refusing is offered on every attendance section, not just one: the row is
  // wherever the employee currently sits, and the point of refusing is to move
  // them out of it.
  const showActions = !isLeaveSection

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
  const LEAVE_COLS = [
    { label: 'الموظف', field: 'name' },
    { label: 'القسم', field: 'department' },
    { label: 'نوع الإجازة' },
    { label: 'الفترة' },
    { label: 'حالة الإجازة' },
  ]
  // Both leave sections get an actions column now — the excused half retracts
  // an entry filed by mistake, the planned half ends a leave the employee came
  // back from early. The excused one carries two more columns for the excuse
  // behind the absence, which planned leave has nothing to put in.
  const cols = isLeaveSection
    ? (isExcusedSection
        ? [...LEAVE_COLS, { label: 'سبب العذر' }, { label: 'مسجّل بواسطة' }, { label: 'إجراءات' }]
        : [...LEAVE_COLS, { label: 'إجراءات' }])
    : [
        ...ATT_COLS,
        ...(isRejectedSection ? [{ label: 'تفاصيل الرفض' }] : []),
        ...(showActions ? [{ label: 'إجراءات' }] : []),
      ]

  const activeMeta = SECTIONS.find(s => s.key === section)
  const reportDate = report?.date || date || ''

  const emptyLabel = {
    present:          'لا يوجد حاضرون في هذا اليوم',
    checked_in:       'لا أحد داخل العمل حالياً',
    checked_out:      'لم يُكمل أحد الدوام بعد',
    missing_checkout: 'لا توجد سجلات خروج غير مكتملة',
    on_leave:         'لا يوجد موظفون في إجازة معتمدة',
    excused:          'لا توجد أيام غياب مسجَّل عنها عذر في هذا اليوم',
    rejected:         REJECTION_COPY.sectionEmpty,
  }[section]

  const hasFilters = Boolean(date || departmentId || sectionId || search)

  // A configured holiday (the weekly calendar is currently all seven days) —
  // the board would otherwise read as if everyone is absent, so show an
  // explicit non-working-day state instead. Never derived here: `working_day`
  // is the server's answer.
  const nonWorkingDay = !loading && report?.working_day === false

  // One refusal can move two rows *and* move the employee between sections, so
  // the whole report is pulled again rather than patching the row in place.
  const afterRejection = (payload) => {
    if (payload?.message) toast.success(payload.message)
    fetchReport()
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          التقرير اليومي للحضور
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          ملخّص حضور اليوم: الحاضرون، من أكمل الدوام، من نسي تسجيل الخروج، الموظفون في إجازة معتمدة،
          من سُجّل عذر عن غيابه، ومن رُفض تسجيله.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <SearchInput value={search} onChange={setSearch} />
        {hasFullAccess && <DepartmentSelect departments={departments} value={departmentId} onChange={setDepartmentId} />}
        {/* Managers/chiefs see it too — fed from their own department */}
        <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={hasFullAccess && !departmentId} />
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
        {/* The unrestricted workbook has 8 sheets (الحضور، لم ينصرفوا بعد،
            المنصرفون، انصراف مفقود، الإجازات، الغياب بعذر، تسجيلات مرفوضة،
            الملخص); report_section restricts it to the active tile's sheet plus
            the summary, so the file matches what's on screen. `excused` is a
            valid section as of v9.1, `rejected` as of the refusal release —
            which also added a `تسجيلات مرفوضة` row to the summary sheet.
            Nothing here reads the file back, so there is no fixed index to
            update. */}
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
        /* Non-working day per the server's `working_day` (a configured
           holiday) — no attendance expected */
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
          {isExcusedSection && (
            <span style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginInlineStart: 'auto' }}>
              {LEAVE_COPY.excusedSectionHint}
            </span>
          )}
          {/* Two refusals are deliberately absent from this section: a day the
              employee re-recorded correctly (they are in `present` now) and a
              check-out refused on its own (its check-in still stands, so they
              are still in `checked_in`). Both are in the records table. */}
          {isRejectedSection && (
            <div style={{
              marginInlineStart: 'auto', display: 'flex', alignItems: 'center',
              gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end',
            }}>
              <span
                title={REJECTION_COPY.sectionHint}
                style={{ fontSize: 11.5, color: 'var(--c-text-3)', cursor: 'help' }}
              >
                {REJECTION_COPY.sectionHintShort}
              </span>
              <Link
                to="/admin/attendance?rejected=1"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  fontSize: 11.5, fontWeight: 800, color: 'var(--c-primary)', textDecoration: 'none',
                }}
              >
                {REJECTION_COPY.allRejectedLink}
                <ArrowLeft size={13} />
              </Link>
            </div>
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
                  ? rows.map((r, idx) => (
                      <LeaveReportRow
                        key={r.leave_request_id ?? r.excuse?.leave_request_id ?? r.user_id ?? idx} row={r}
                        last={idx === rows.length - 1} showExcuse={isExcusedSection}
                        onUndoExcuse={setUndoingExcuse}
                        onReturnToWork={setReturningToWork}
                      />
                    ))
                  : rows.map((r, idx) => (
                      <AttendanceRow
                        key={getRecordId(r) ?? r.user_id ?? idx} row={r} last={idx === rows.length - 1}
                        onViewSelfie={setSelfie} onCorrect={setCorrecting}
                        onReject={row => setRejecting({ row, mode: 'reject' })}
                        onUndoReject={row => setRejecting({ row, mode: 'undo' })}
                        showActions={showActions} showCorrection={showCorrection}
                        showRejection={isRejectedSection}
                        canReject={canRejectRecord(user, r) && getRecordId(r) != null}
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
      {/* A report row only carries the check-in id, so a refusal filed here
          always takes the whole day — the modal says so. */}
      {rejecting && (
        <RejectRecordModal
          mode={rejecting.mode}
          target={{
            recordId: getRecordId(rejecting.row),
            name: rejecting.row.name,
            email: rejecting.row.email,
            type: 'check_in',
            recordedAt: rejecting.row.check_in_time,
            selfieUrl: rejecting.row.check_in_selfie,
            latitude: rejecting.row.check_in_location?.latitude,
            longitude: rejecting.row.check_in_location?.longitude,
            source: rejecting.row,
          }}
          onClose={() => setRejecting(null)}
          onDone={afterRejection}
        />
      )}
      {correcting && (
        <CorrectCheckoutModal
          target={{
            recordId: getRecordId(correcting),
            name: correcting.name,
            checkInTime: correcting.check_in_time,
            date: reportDate || damascusToday(),
          }}
          onClose={() => setCorrecting(null)} onDone={fetchReport}
        />
      )}
      {/* Undoing moves the employee out of «الغياب بعذر» and back among the
          absentees, so the report is pulled again rather than dropping the row.
          The modal raises its own toast — this only refreshes. */}
      {undoingExcuse && (
        <UndoExcuseModal
          target={{
            leaveRequestId: undoingExcuse.excuse?.leave_request_id,
            name: undoingExcuse.name,
            email: undoingExcuse.email,
            startDate: undoingExcuse.start_date,
            endDate: undoingExcuse.end_date,
            leaveTypeName: leaveTypeName(undoingExcuse),
            deductsBalance: undoingExcuse.excuse?.deducts_balance ?? deductsBalance(undoingExcuse),
            reason: undoingExcuse.excuse?.reason,
            recordedBy: undoingExcuse.excuse?.recorded_by,
          }}
          onClose={() => setUndoingExcuse(null)}
          onDone={fetchReport}
        />
      )}
      {/* The employee stops being «في إجازة» for this day and becomes someone
          who can check in, so the board is pulled again rather than dropping the
          row — the counters above move with it. The report is always keyed to
          one day, and that day is why the employee is standing there, so it is
          the return date the form opens on. */}
      {returningToWork && (
        <ReturnToWorkModal
          key={returningToWork.leave_request_id}
          target={{
            leaveRequestId: returningToWork.leave_request_id,
            name: returningToWork.name,
            email: returningToWork.email,
            startDate: returningToWork.start_date,
            endDate: returningToWork.end_date,
            leaveTypeName: leaveTypeName(returningToWork),
            deductsBalance: deductsBalance(returningToWork),
            approvedBy: returningToWork.approved_by,
            defaultReturnedOn: reportDate,
          }}
          onClose={() => setReturningToWork(null)}
          onDone={fetchReport}
        />
      )}
    </div>
  )
}
