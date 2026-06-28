import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  UserCheck, LogIn, AlertTriangle, Plane, CalendarOff, UserX,
  Clock, Building2, Layers, ChevronRight, Loader2,
} from 'lucide-react'
import { leaveTypeLabel } from '../utils/leave'

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(value) {
  if (!value) return null
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}
function fmtHours(value) {
  if (value == null) return '—'
  const mins = Math.round(Number(value) * 60)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const WEEKDAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// One status per day, by the precedence the backend already resolved. A real
// check-in overrides weekend/leave, so `off`/`on_leave` only appear with no punch.
const STATUS_META = {
  present:          { label: 'حاضر',         color: 'var(--c-approved)', bg: 'var(--c-approved-bg)', icon: UserCheck },
  checked_in:       { label: 'بالداخل',      color: '#2563EB',           bg: '#EAF1FE',              icon: LogIn },
  missing_checkout: { label: 'انصراف ناقص',  color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)',  icon: AlertTriangle },
  on_leave:         { label: 'إجازة',        color: 'var(--c-primary)',  bg: 'var(--c-accent-tint)', icon: Plane },
  off:              { label: 'عطلة',         color: 'var(--c-text-3)',   bg: 'var(--c-surface-2)',   icon: CalendarOff },
  absent:           { label: 'غائب',         color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)', icon: UserX },
}

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

function StatCard({ icon: Icon, label, value, accent }) {
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
      </div>
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

function DayRow({ day, last }) {
  const [hov, setHov] = useState(false)
  const dim = day.status === 'off'
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : dim ? 'var(--c-surface)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ padding: '11px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: dim ? 'var(--c-text-2)' : 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmtDate(day.date)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{WEEKDAY_AR[day.weekday] ?? ''}</div>
      </td>
      <td style={{ padding: '11px 16px' }}><StatusBadge status={day.status} /></td>
      <td style={{ padding: '11px 16px' }}><TimeCell time={day.check_in_time} /></td>
      <td style={{ padding: '11px 16px' }}><TimeCell time={day.check_out_time} /></td>
      <td style={{ padding: '11px 16px' }}>
        {day.work_hours_formatted
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <Clock size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />{day.work_hours_formatted}
            </span>
          : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '11px 16px' }}>
        {day.status === 'on_leave' && day.leave_type
          ? <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
              fontSize: 11.5, fontWeight: 700, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
            }}>{leaveTypeLabel(day.leave_type)}</span>
          : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
    </tr>
  )
}

function SkeletonRow() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {Array.from({ length: 6 }, (_, i) => (
        <td key={i} style={{ padding: '11px 16px' }}>
          <div style={{ ...pulse, height: 16, width: i === 0 ? 110 : 70, borderRadius: 7, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

const COLS = ['التاريخ', 'الحالة', 'الدخول', 'الخروج', 'ساعات العمل', 'نوع الإجازة']

export default function AttendanceEmployeeReportPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const userId = params.get('user_id')
  const from = params.get('from')
  const to = params.get('to')

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reqRef = useRef(0)

  const fetchReport = useCallback(async () => {
    if (!userId || !from || !to) { setLoading(false); setError('معلومات الطلب ناقصة'); return }
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/attendance/report/employee', { params: { user_id: userId, from, to } })
      if (reqId !== reqRef.current) return
      setReport(res.data ?? null)
    } catch (err) {
      if (reqId === reqRef.current) { setReport(null); setError(readApiError(err)) }
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [userId, from, to])

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
          <StatCard icon={UserX} label="أيام الغياب" value={summary.absent_days ?? 0}
            accent={{ bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' }} />
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

      {/* Day-by-day table */}
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {COLS.map(c => (
                  <th key={c} style={{
                    padding: '11px 16px', textAlign: 'right', fontSize: 11.5, fontWeight: 700,
                    color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} />)
                : days.map((d, idx) => <DayRow key={d.date ?? idx} day={d} last={idx === days.length - 1} />)
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
    </div>
  )
}
