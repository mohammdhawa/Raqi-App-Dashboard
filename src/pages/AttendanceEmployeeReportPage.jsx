import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  UserCheck, LogIn, AlertTriangle, Plane, CalendarOff, UserX,
  Clock, Building2, Layers, ChevronRight, Loader2,
  ShieldPlus, ShieldCheck, ShieldX,
} from 'lucide-react'
import { leaveTypeLabel, EXCUSED_META, LEAVE_COPY } from '../utils/leave'
import {
  readRejection, rejectionTooltip, REJECTION_COPY,
} from '../utils/attendanceRejection'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'
import ExcuseLeaveModal from '../components/leave/ExcuseLeaveModal'
import { ExportButton, SortableTh, ToggleChip } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'

const TIME_ZONE = 'Europe/Istanbul'

function fmtDate(value) {
  if (!value) return '—'

  const d = new Date(String(value).replace(' ', 'T'))

  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: TIME_ZONE,
      })
}

function fmtTime(value) {
  if (!value) return null

  const d = new Date(String(value).replace(' ', 'T'))

  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TIME_ZONE,
      })
}
function fmtHours(value) {
  if (value == null) return '—'
  const mins = Math.round(Number(value) * 60)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const WEEKDAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// One status per day, by the precedence the backend already resolved:
// accepted check-in → off → excused → on_leave → rejected → absent.
//
// `off` outranking leave is deliberate: leave and excuses are counted in
// working days everywhere (the balance, the monthly report), so a non-working
// day *inside* a span resolves to `off` instead of being charged, and all three
// agree on what a span is worth. Which days are non-working is server config
// (currently all seven days are working, so `off` only appears for a configured
// holiday), so nothing here assumes a particular calendar — `weekday`/`status`
// come from the API. The day still carries `leave_type` whatever its status,
// which is what the calendar shades the full span from.
//
// `rejected` sits second-to-last: a refused check-in is not attendance, so
// anything that legitimately explains the day (a day off, an excuse, approved
// leave) outranks it — and a `rejected` day is itself counted in `absent_days`.
const STATUS_META = {
  present:          { label: 'حاضر',         color: 'var(--c-approved)', bg: 'var(--c-approved-bg)', icon: UserCheck },
  checked_in:       { label: 'بالداخل',      color: '#2563EB',           bg: '#EAF1FE',              icon: LogIn },
  missing_checkout: { label: 'انصراف ناقص',  color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)',  icon: AlertTriangle },
  // An absence HR answered for — neither planned leave nor an unexplained
  // absence, so it gets its own colour rather than borrowing either one's.
  excused:          { label: EXCUSED_META.label, color: EXCUSED_META.color, bg: EXCUSED_META.bg,     icon: ShieldCheck },
  on_leave:         { label: 'إجازة',        color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)', icon: Plane },
  off:              { label: 'عطلة',         color: 'var(--c-text-3)',   bg: 'var(--c-surface-2)',   icon: CalendarOff },
  // A day whose only check-in HR refused, with nothing accepted in its place.
  // Counted inside `absent_days`, never alongside it.
  rejected:         { label: REJECTION_COPY.dayStatus, color: '#8E2C20', bg: '#F7DEDA', icon: ShieldX },
  absent:           { label: LEAVE_COPY.absentNoExcuseShort, color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)', icon: UserX },
}

// Day statuses that mean "absent with nothing accounting for it", so HR can
// still file an excuse. Both are counted in `absent_days`.
const EXCUSABLE_STATUSES = ['absent', 'rejected']

function readApiError(err) {
  const data = err?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('، ')
  if (data?.message) return data.message
  return 'تعذّر تحميل التقرير، حاول مرة أخرى'
}

function InitialsTag({ name, size = 44 }) {
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
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}22`, whiteSpace: 'nowrap',
    }}>
      <Icon size={12} />
      {m.label}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, accent, hint }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 11,
      padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1px solid var(--c-border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent.bg, color: accent.color,
      }}>
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {hint && <div style={{ fontSize: 10, color: 'var(--c-text-3)', marginTop: 2, whiteSpace: 'nowrap' }}>{hint}</div>}
      </div>
    </div>
  )
}

// Day-status legend — the grid's colours are the only thing distinguishing a
// planned leave day from an absence that was answered for, so they are named.
function StatusLegend() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-text-3)' }}>دليل الحالات</span>
      {DAY_STATUSES.map(status => {
        const meta = STATUS_META[status]
        return (
          <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3, flexShrink: 0,
              background: meta.bg, border: `1.5px solid ${meta.color}`,
            }} />
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}

function TimeCell({ time }) {
  const t = fmtTime(time)
  if (!t) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t}</span>
  )
}

function DayRow({ day, last, onExcuse }) {
  const [hov, setHov] = useState(false)
  const dim = day.status === 'off'
  // A day inside a leave/excuse span names the span in `leave_type` whatever
  // its status, so the whole range shades — including any non-working day in
  // the middle of it, which resolves to `off`.
  const inSpan = day.leave_type != null
  const excuse = day.excuse ?? null
  // Present on **any** day carrying a refused check-in, even when leave or a
  // later accepted check-in outranks it in `status`. It is what the employee was
  // notified about and what HR will be asked about, so it is always shown.
  const rejection = readRejection(day)
  const background = hov
    ? 'rgba(34,65,103,0.015)'
    : day.status === 'rejected'
      ? 'rgba(192,57,43,0.05)'
      : day.status === 'excused'
        ? EXCUSED_META.bg
        : inSpan
          ? 'var(--c-accent-tint)'
          : dim ? 'var(--c-surface)' : 'transparent'
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background, transition: 'background .1s',
      }}
    >
      <td style={{ padding: '11px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: dim ? 'var(--c-text-2)' : 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmtDate(day.date)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{WEEKDAY_AR[day.weekday] ?? ''}</div>
      </td>
      <td style={{ padding: '11px 16px' }}>
        <StatusBadge status={day.status} />
        {rejection && (
          <div
            title={rejectionTooltip(day)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 6,
              maxWidth: 220, cursor: 'help',
            }}
          >
            <ShieldX size={11} style={{ color: 'var(--c-rejected)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-rejected)', lineHeight: 1.6 }}>
              {rejection.recordedAt ? `${fmtTime(rejection.recordedAt)} · ` : ''}
              {rejection.short}
              {rejection.note && (
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--c-text-2)' }}>
                  {rejection.note}
                </span>
              )}
            </span>
          </div>
        )}
      </td>
      <td style={{ padding: '11px 16px' }}><TimeCell time={day.check_in_time} /></td>
      <td style={{ padding: '11px 16px' }}><TimeCell time={day.check_out_time} /></td>
      <td style={{ padding: '11px 16px' }}>
        {day.work_hours_formatted
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <Clock size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />{day.work_hours_formatted}
            </span>
          : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      {/* `rejected` is an absence too — it outranks `absent` in the day's
          status only because it explains *why* the day is empty, and it is
          counted inside `absent_days`. Excluding it here would quietly remove
          HR's excuse action from exactly the days a refusal created. Anything
          the day is already answered for (`off` / `excused` / `on_leave`)
          outranks both, so this stays the "unanswered absence" test. */}
      <td style={{ padding: '11px 16px' }}>
        {EXCUSABLE_STATUSES.includes(day.status) ? <button onClick={() => onExcuse(day)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 31, padding: '0 10px', borderRadius: 9, border: 'none', background: 'var(--c-primary-light)', color: 'var(--c-primary)', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer' }}><ShieldPlus size={13} /> تسجيل عذر</button> : <span style={{ color: 'var(--c-text-3)' }}>—</span>}
      </td>
      {/* Shown for every day inside a span, not only `on_leave` ones — a
          non-working day in the middle of a leave is `off` but still part
          of it. */}
      <td style={{ padding: '11px 16px' }}>
        {inSpan
          ? <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
              fontSize: 11.5, fontWeight: 700, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
            }}>{leaveTypeLabel(excuse?.leave_type_name ?? day.leave_type)}</span>
          : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      {/* The excuse behind an `excused` day — null on every other status. */}
      <td style={{ padding: '11px 16px' }}>
        {excuse ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, maxWidth: 260 }}>
            <DeductsBalanceBadge deducts={excuse.deducts_balance} compact short />
            {excuse.reason && (
              <span style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.5 }} title={excuse.reason}>
                {excuse.reason}
              </span>
            )}
            <span style={{ fontSize: 10.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
              سجّلها: {excuse.recorded_by ?? 'الموارد البشرية'}
            </span>
          </div>
        ) : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
    </tr>
  )
}

function SkeletonRow() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {Array.from({ length: COLS.length }, (_, i) => (
        <td key={i} style={{ padding: '11px 16px' }}>
          <div style={{ ...pulse, height: 16, width: i === 0 ? 110 : 70, borderRadius: 7, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// `field` = sortable (employee-report day grid whitelist: date, status, work_hours).
const COLS = [
  { label: 'التاريخ', field: 'date' },
  { label: 'الحالة', field: 'status' },
  { label: 'الدخول' },
  { label: 'الخروج' },
  { label: 'ساعات العمل', field: 'work_hours' },
  { label: '—' },
  { label: 'نوع الإجازة' },
  { label: 'العذر' },
]

// Day-status filter options (status=…) — labels reuse STATUS_META, and the
// order matches the backend's precedence (accepted check-in → off → excuse →
// approved leave → rejected → absent), so the legend reads as the rule.
const DAY_STATUSES = ['present', 'checked_in', 'missing_checkout', 'off', 'excused', 'on_leave', 'rejected', 'absent']

export default function AttendanceEmployeeReportPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const userId = params.get('user_id')
  const from = params.get('from')
  const to = params.get('to')

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Day filters narrow the `days` grid only; the summary keeps describing the
  // whole requested range (rendered as-is by design).
  const [dayStatus, setDayStatus] = useState('')
  const [workingDaysOnly, setWorkingDaysOnly] = useState(false)
  const [sort, setSort] = useState(null)
  const [excuseDay, setExcuseDay] = useState(null)
  const reqRef = useRef(0)

  // Shared by the fetch and the XLSX export so the file mirrors the view.
  const buildParams = useCallback(() => {
    const params = { user_id: userId, from, to }
    if (dayStatus)       params.status = dayStatus
    if (workingDaysOnly) params.working_days_only = 1
    return { ...params, ...sortParams(sort) }
  }, [userId, from, to, dayStatus, workingDaysOnly, sort])

  const fetchReport = useCallback(async () => {
    if (!userId || !from || !to) { setLoading(false); setError('معلومات الطلب ناقصة'); return }
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/attendance/report/employee', { params: buildParams() })
      if (reqId !== reqRef.current) return
      setReport(res.data ?? null)
    } catch (err) {
      if (reqId === reqRef.current) { setReport(null); setError(readApiError(err)) }
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [userId, from, to, buildParams])

  useEffect(() => { fetchReport() }, [fetchReport])

  useEffect(() => {
    const handler = () => fetchReport()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchReport])

  const goBack = () => navigate('/admin/attendance/monthly')

  const u = report?.user
  const summary = report?.summary ?? {}
  const days = report?.days ?? []

  const backBtn = (
    <button
      onClick={goBack}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 10,
        background: '#fff', border: '1px solid var(--c-border)',
        fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', cursor: 'pointer',
      }}
    >
      <ChevronRight size={15} />
      العودة إلى التقرير الشهري
    </button>
  )

  if (!loading && error) {
    return (
      <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>{backBtn}</div>
        <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, boxShadow: 'var(--sh-card)', padding: '56px 24px', textAlign: 'center' }}>
          <UserX size={36} style={{ color: 'var(--c-text-3)', marginBottom: 14 }} />
          <p style={{ margin: '0 0 4px', color: 'var(--c-text)', fontSize: 16, fontWeight: 800 }}>تعذّر عرض التقرير</p>
          <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 13.5, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>{backBtn}</div>

      {/* Employee header card */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, boxShadow: 'var(--sh-card)',
        padding: '18px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />
            <span style={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>جارٍ تحميل تقرير الموظف...</span>
          </div>
        ) : (
          <>
            <InitialsTag name={u?.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>{u?.name ?? '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 2 }}>{u?.email ?? '—'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {u?.department && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-2)' }}>
                    <Building2 size={12} style={{ color: 'var(--c-text-3)' }} />{u.department}
                  </span>
                )}
                {u?.section && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-3)' }}>
                    <Layers size={11} />{u.section}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
              {fmtDate(report?.from)} — {fmtDate(report?.to)}
            </span>
          </>
        )}
      </div>

      {/* Summary stat cards */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatCard icon={UserCheck} label="أيام الحضور" value={summary.present_days ?? 0}
            accent={{ bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' }} />
          <StatCard icon={UserX} label={LEAVE_COPY.absentNoExcuse} value={summary.absent_days ?? 0}
            accent={{ bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' }}
            hint={`${summary.rejected_days ?? 0} ${REJECTION_COPY.rejectedDays}`} />
          {/* A subset of the absence count on its right, never an addition to
              it: a refused check-in with no accepted one in its place. */}
          <StatCard icon={ShieldX} label={REJECTION_COPY.rejectedDays} value={summary.rejected_days ?? 0}
            accent={{ bg: '#F7DEDA', color: '#8E2C20' }}
            hint={`ضمن ${LEAVE_COPY.absentNoExcuse}`} />
          <StatCard
            icon={ShieldCheck} label={`أيام ${LEAVE_COPY.excusedStatus}`} value={summary.excused_days ?? 0}
            accent={{ bg: EXCUSED_META.bg, color: EXCUSED_META.color }}
            hint={`${summary.excused_deducted_days ?? 0} ${LEAVE_COPY.deductedFromBalance} · ${summary.excused_not_deducted_days ?? 0} ${LEAVE_COPY.notDeductedFromBalance}`}
          />
          <StatCard icon={Plane} label="أيام الإجازة" value={summary.on_leave_days ?? 0}
            accent={{ bg: 'var(--c-accent-tint)', color: 'var(--c-primary)' }} />
          <StatCard icon={CalendarOff} label="أيام العطل" value={summary.off_days ?? 0}
            accent={{ bg: 'var(--c-surface-2)', color: 'var(--c-text-2)' }} />
          <StatCard icon={AlertTriangle} label="انصراف ناقص" value={summary.missing_checkouts ?? 0}
            accent={{ bg: 'var(--c-pending-bg)', color: 'var(--c-pending)' }} />
          <StatCard icon={Clock} label="إجمالي الساعات" value={summary.total_work_hours_formatted ?? fmtHours(summary.total_work_hours)}
            accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }} />
          <StatCard icon={UserCheck} label="نسبة الحضور" value={summary.attendance_rate == null ? '—' : `${summary.attendance_rate}%`}
            accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }} />
        </div>
      )}

      {/* Day filters + export — narrow the grid only; the summary above keeps
          describing the full range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <select
          value={dayStatus} onChange={e => setDayStatus(e.target.value)}
          style={{
            height: 38, padding: '0 10px', borderRadius: 10, minWidth: 140,
            background: '#fff', border: '1px solid var(--c-border)',
            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', direction: 'rtl', outline: 'none',
            color: dayStatus ? 'var(--c-text)' : 'var(--c-text-2)',
          }}
        >
          <option value="">حالة اليوم: الكل</option>
          {DAY_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <ToggleChip
          label="أيام العمل فقط" icon={CalendarOff}
          active={workingDaysOnly} onChange={setWorkingDaysOnly}
          title="إخفاء أيام العطلة من الجدول"
        />
        <div style={{ flex: 1 }} />
        {/* The employee workbook gained three appended day-grid columns —
            سبب رفض التسجيل، ملاحظة الرفض، مرفوض بواسطة — plus a
            «منها تسجيلات مرفوضة» row in the summary sheet. Nothing here reads
            the file back, so there is no fixed index to update. */}
        <ExportButton
          url="/attendance/report/employee" params={buildParams()}
          filename="attendance-employee-report.xlsx" disabled={!userId || !from || !to}
        />
      </div>

      {/* Day-by-day table */}
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)' }}>
        <StatusLegend />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {COLS.map(c => (
                  <SortableTh key={c.label} label={c.label} field={c.field} sort={sort} onSort={setSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} />)
                : days.map((d, idx) => <DayRow key={d.date ?? idx} day={d} last={idx === days.length - 1} onExcuse={setExcuseDay} />)
              }
            </tbody>
          </table>
        </div>

        {!loading && days.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <CalendarOff size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>لا توجد أيام في هذه الفترة</p>
          </div>
        )}
      </div>
      {excuseDay && <ExcuseLeaveModal employee={{ id: u?.id ?? Number(userId), name: u?.name, email: u?.email }} date={excuseDay.date} onClose={() => setExcuseDay(null)} onSubmitted={fetchReport} />}
    </div>
  )
}
