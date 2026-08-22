import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  CalendarRange, Users, UserCheck, Plane, UserX, AlertTriangle,
  Clock, Building2, Layers, ChevronLeft, ShieldCheck,
} from 'lucide-react'
import { EXCUSED_META, LEAVE_COPY } from '../utils/leave'
import { REJECTION_COPY } from '../utils/attendanceRejection'
import { DepartmentSelect, SectionSelect, SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh, ToggleChip } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'
import { useDeptSections } from '../utils/useDeptSections'

// Business rules run in Asia/Damascus; the from/to we send are plain Y-m-d
// strings, so build them from local calendar fields (never toISOString, which
// would shift across midnight UTC).
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// "Last month" = first/last calendar day of the previous month (per the spec,
// computed client-side and used as the default range).
function lastMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: ymd(first), to: ymd(last) }
}

function thisMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: ymd(first), to: ymd(last) }
}

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Decimal work-hours → "Xh Ym", matching the backend's *_formatted strings so
// the totals row reads the same way as the per-row formatted values.
function fmtHours(value) {
  if (value == null) return '—'
  const mins = Math.round(Number(value) * 60)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Inclusive day span (to − from + 1) for the client-side 92-day cap check.
function spanDays(from, to) {
  if (!from || !to) return 0
  const a = new Date(from), b = new Date(to)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.floor((b - a) / 86400000) + 1
}

const MAX_RANGE_DAYS = 92

function readApiError(err) {
  const data = err?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('، ')
  if (data?.message) return data.message
  return 'تعذّر تحميل التقرير، حاول مرة أخرى'
}

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff',
  padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

const presetBtnStyle = (active) => ({
  height: 38, padding: '0 12px', borderRadius: 10, whiteSpace: 'nowrap',
  border: active ? 'none' : '1px solid var(--c-border)',
  background: active ? 'var(--c-primary)' : '#fff',
  color: active ? '#fff' : 'var(--c-text-2)',
  fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
})

// ── Atoms ────────────────────────────────────────────────────────────────────
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

// Attendance-rate pill: present/expected %, color-banded; null → "—".
function RatePill({ rate }) {
  if (rate == null) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const v = Number(rate)
  const [color, bg] = v >= 85
    ? ['var(--c-approved)', 'var(--c-approved-bg)']
    : v >= 60
      ? ['var(--c-pending)', 'var(--c-pending-bg)']
      : ['var(--c-rejected)', 'var(--c-rejected-bg)']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 800, color, background: bg, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    }}>
      {v}%
    </span>
  )
}

function Num({ value, bold, muted }) {
  return (
    <span style={{
      fontSize: 12.5, fontWeight: bold ? 800 : 600,
      color: muted && (value === 0 || value == null) ? 'var(--c-text-3)' : 'var(--c-text)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {value ?? 0}
    </span>
  )
}

function SummaryTile({ icon: Icon, label, value, accent, hint }) {
  return (
    <div style={{
      flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 15px', borderRadius: 12, background: '#fff', border: '1px solid var(--c-border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent.bg, color: accent.color,
      }}>
        <Icon size={19} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {hint && (
          <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 2, whiteSpace: 'nowrap' }}>{hint}</div>
        )}
      </div>
    </div>
  )
}

function EmployeeRow({ row, last, onOpen }) {
  const [hov, setHov] = useState(false)
  return (
    <tr
      onClick={() => onOpen(row)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.025)' : 'transparent',
        transition: 'background .1s', cursor: 'pointer',
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialsTag name={row.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{row.name ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{row.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}><DeptSectionCell department={row.department} section={row.section} /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.expected_days} /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.present_days} bold /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.on_leave_days} muted /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        {Number(row.excused_days ?? 0) > 0
          ? <span style={{ fontSize: 12.5, fontWeight: 800, color: EXCUSED_META.color, fontVariantNumeric: 'tabular-nums' }}>{row.excused_days}</span>
          : <Num value={0} muted />}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.excused_deducted_days} muted /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.excused_not_deducted_days} muted /></td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={row.absent_days} muted /></td>
      {/* Part of the absence count on its right, never an addition to it. */}
      <td style={{ padding: '12px 16px', textAlign: 'center' }} title={REJECTION_COPY.rejectedDaysHint}>
        {Number(row.rejected_days ?? 0) > 0
          ? <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--c-rejected)', fontVariantNumeric: 'tabular-nums' }}>{row.rejected_days}</span>
          : <Num value={0} muted />}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        {row.missing_checkouts > 0
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--c-pending)', fontVariantNumeric: 'tabular-nums' }}>
              <AlertTriangle size={12} />{row.missing_checkouts}
            </span>
          : <Num value={0} muted />}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
          color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}>
          <Clock size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          {row.total_work_hours_formatted ?? fmtHours(row.total_work_hours)}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}><RatePill rate={row.attendance_rate} /></td>
      <td style={{ padding: '12px 16px' }}>
        <ChevronLeft size={16} style={{ color: 'var(--c-text-3)' }} />
      </td>
    </tr>
  )
}

function SkeletonRow({ count }) {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {Array.from({ length: count }, (_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: i === 0 ? 34 : 16, width: i === 0 ? 160 : 60, borderRadius: i === 0 ? 17 : 7, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// `field` = sortable (monthly whitelist: name, email, department, section,
// expected_days, present_days, on_leave_days, absent_days, excused_days,
// excused_deducted_days, excused_not_deducted_days, rejected_days,
// missing_checkouts, total_work_hours, attendance_rate). Last column is the
// row-open chevron.
//
// Column order mirrors the XLSX headers so the file and the screen read the
// same way: … أيام الإجازة، أيام الغياب بعذر، منها مخصومة من الرصيد،
// منها غير مخصومة، أيام الغياب بدون عذر، منها تسجيلات مرفوضة، …
//
// `absent_days` no longer contains excused absences, so it is labelled for what
// it now is: غياب بدون عذر. The reconciliation is
// expected = present + on_leave + excused + absent.
//
// `rejected_days` is NOT another slice of the month: it annotates `absent_days`,
// which already contains those days, so it sits right after it and is never
// added into any total. It counts what a refusal actually cost — a refused
// check-in with no accepted one in its place; a day re-recorded correctly after
// a refusal is a present day and is not counted here.
const COLS = [
  { label: 'الموظف', field: 'name' },
  { label: 'القسم', field: 'department' },
  { label: 'أيام العمل', field: 'expected_days', center: true },
  { label: 'الحضور', field: 'present_days', center: true },
  { label: 'الإجازات', field: 'on_leave_days', center: true },
  { label: LEAVE_COPY.excusedStatus, field: 'excused_days', center: true },
  { label: LEAVE_COPY.deductedFromBalance, field: 'excused_deducted_days', center: true },
  { label: LEAVE_COPY.notDeductedFromBalance, field: 'excused_not_deducted_days', center: true },
  { label: LEAVE_COPY.absentNoExcuse, field: 'absent_days', center: true },
  {
    label: REJECTION_COPY.rejectedDays, field: 'rejected_days', center: true,
    title: REJECTION_COPY.rejectedDaysHint,
  },
  { label: 'انصراف ناقص', field: 'missing_checkouts', center: true },
  { label: 'إجمالي الساعات', field: 'total_work_hours' },
  { label: 'نسبة الحضور', field: 'attendance_rate' },
  { label: '' },
]

export default function AttendanceMonthlyReportPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance

  const initial = lastMonthRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [search, setSearch] = useState('')
  const [departments, setDepartments] = useState([])

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // "Only rows with …" filters — totals are recomputed server-side over the
  // surviving rows, so the tiles/footer stay consistent with the table.
  const [hasAbsences, setHasAbsences] = useState(false)
  const [hasMissingCheckouts, setHasMissingCheckouts] = useState(false)
  const [sort, setSort] = useState(null)

  // Managers/chiefs have no department picker (dept-locked server-side) but
  // may still filter by section — feed them their own department's sections.
  const sectionDeptId = hasFullAccess ? departmentId : (user?.department_id ?? '')
  const sections = useDeptSections(sectionDeptId, departments, { canFetch: user?.role === 'admin' })
  const reqRef = useRef(0)

  const span = spanDays(from, to)
  const rangeInvalid = Boolean(from && to && to < from)
  const rangeTooLong = span > MAX_RANGE_DAYS
  const rangeError = rangeInvalid
    ? 'تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية'
    : rangeTooLong
      ? `النطاق يتجاوز الحد الأقصى (${MAX_RANGE_DAYS} يوماً)`
      : ''

  // The /attendance/departments route allows every attendance viewer, and
  // managers need it for their own department's nested sections.
  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => { setSectionId('') }, [departmentId])

  // Shared by the fetch and the XLSX export so the file mirrors the view.
  const buildParams = useCallback(() => {
    const params = { from, to }
    if (departmentId)        params.department_id = departmentId
    if (sectionId)           params.section_id = sectionId
    if (search.trim())       params.search = search.trim()
    if (hasAbsences)         params.has_absences = 1
    if (hasMissingCheckouts) params.has_missing_checkouts = 1
    return { ...params, ...sortParams(sort) }
  }, [from, to, departmentId, sectionId, search, hasAbsences, hasMissingCheckouts, sort])

  const fetchReport = useCallback(async () => {
    if (!from || !to || rangeInvalid || rangeTooLong) return
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/attendance/report/monthly', { params: buildParams() })
      if (reqId !== reqRef.current) return
      setReport(res.data ?? null)
    } catch (err) {
      if (reqId === reqRef.current) { setReport(null); setError(readApiError(err)) }
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [from, to, rangeInvalid, rangeTooLong, buildParams])

  useEffect(() => { fetchReport() }, [fetchReport])

  useEffect(() => {
    const handler = () => fetchReport()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchReport])

  const setPreset = (range) => { setFrom(range.from); setTo(range.to) }
  const isLastMonth = from === initial.from && to === initial.to
  const tm = thisMonthRange()
  const isThisMonth = from === tm.from && to === tm.to

  const rows = report?.rows ?? []
  const totals = report?.totals ?? {}

  const openEmployee = (row) => {
    navigate(`/admin/attendance/employee?user_id=${row.user_id}&from=${from}&to=${to}`)
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          التقرير الشهري للحضور
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          ملخّص حضور كل موظف خلال فترة محددة: أيام الحضور والإجازة، أيام الغياب بعذر وبدون عذر،
          وإجمالي ساعات العمل ونسبة الحضور. اضغط على أي موظف لعرض تفاصيله اليومية.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <SearchInput value={search} onChange={setSearch} />
        {hasFullAccess && <DepartmentSelect departments={departments} value={departmentId} onChange={setDepartmentId} />}
        {/* Managers/chiefs see it too — fed from their own department */}
        <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={hasFullAccess && !departmentId} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarRange size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ ...dateInputStyle, ...(rangeError ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}) }}
          />
        </div>
        <button onClick={() => setPreset(lastMonthRange())} style={presetBtnStyle(isLastMonth)}>الشهر الماضي</button>
        <button onClick={() => setPreset(thisMonthRange())} style={presetBtnStyle(isThisMonth)}>هذا الشهر</button>
        <ToggleChip
          label="غياب بدون عذر فقط" icon={UserX}
          active={hasAbsences} onChange={setHasAbsences}
          title="عرض الموظفين الذين لديهم أيام غياب بدون عذر فقط — تُعاد الإجماليات على الصفوف الظاهرة"
        />
        <ToggleChip
          label="انصراف ناقص فقط" icon={AlertTriangle}
          active={hasMissingCheckouts} onChange={setHasMissingCheckouts}
          title="عرض الموظفين الذين لديهم انصراف غير مسجّل فقط — تُعاد الإجماليات على الصفوف الظاهرة"
        />
        {/* The monthly workbook gained an inserted «منها تسجيلات مرفوضة» column
            right after «أيام الغياب بدون عذر», shifting every later column by
            one — the same order as COLS above. Nothing here reads the file
            back, so there is no fixed index to update. */}
        <ExportButton
          url="/attendance/report/monthly" params={buildParams()}
          filename="attendance-monthly-report.xlsx" disabled={Boolean(rangeError)}
        />
        {rangeError && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-rejected)', whiteSpace: 'nowrap' }}>
            {rangeError}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {report && !rangeError && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            {report.working_days} يوم عمل · {fmtDate(report.from)} — {fmtDate(report.to)}
          </span>
        )}
      </div>

      {/* Summary tiles */}
      {!rangeError && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <SummaryTile icon={Users} label="عدد الموظفين" value={totals.employees ?? 0}
            accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }} />
          <SummaryTile icon={UserCheck} label="أيام الحضور" value={totals.present_days ?? 0}
            accent={{ bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' }} />
          <SummaryTile icon={Plane} label="أيام الإجازة" value={totals.on_leave_days ?? 0}
            accent={{ bg: 'var(--c-accent-tint)', color: 'var(--c-primary)' }} />
          <SummaryTile
            icon={ShieldCheck} label={`أيام ${LEAVE_COPY.excusedStatus}`} value={totals.excused_days ?? 0}
            accent={{ bg: EXCUSED_META.bg, color: EXCUSED_META.color }}
            hint={`${totals.excused_deducted_days ?? 0} ${LEAVE_COPY.deductedFromBalance}`}
          />
          {/* The hint names the refused days *inside* this figure — they are
              already counted here, so the tile total is never their sum. */}
          <SummaryTile icon={UserX} label={LEAVE_COPY.absentNoExcuse} value={totals.absent_days ?? 0}
            accent={{ bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' }}
            hint={`${totals.rejected_days ?? 0} ${REJECTION_COPY.rejectedDays}`} />
          <SummaryTile icon={Clock} label="إجمالي الساعات" value={fmtHours(totals.total_work_hours)}
            accent={{ bg: 'var(--c-surface-2)', color: 'var(--c-text-2)' }} />
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)' }}>
        {rangeError ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
            <CalendarRange size={36} style={{ color: 'var(--c-text-3)', marginBottom: 14 }} />
            <p style={{ margin: '0 0 4px', color: 'var(--c-text)', fontSize: 16, fontWeight: 800 }}>نطاق غير صالح</p>
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 13.5, lineHeight: 1.6 }}>{rangeError}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--c-surface)' }}>
                  {COLS.map((c, i) => (
                    <SortableTh
                      key={i} label={c.label} field={c.field} sort={sort} onSort={setSort}
                      align={c.center ? 'center' : 'right'} title={c.title}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} count={COLS.length} />)
                  : rows.map((r, idx) => (
                      <EmployeeRow key={r.user_id ?? idx} row={r} last={idx === rows.length - 1} onOpen={openEmployee} />
                    ))
                }
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--c-surface)', borderTop: '2px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 800, color: 'var(--c-text)' }}>
                      الإجمالي · {totals.employees ?? rows.length} موظف
                    </td>
                    <td style={{ padding: '12px 16px' }} />
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.expected_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.present_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.on_leave_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.excused_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.excused_deducted_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.excused_not_deducted_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.absent_days} bold /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }} title={REJECTION_COPY.rejectedDaysHint}>
                      <Num value={totals.rejected_days} bold />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><Num value={totals.missing_checkouts} bold /></td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 800, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtHours(totals.total_work_hours)}
                    </td>
                    <td style={{ padding: '12px 16px' }} />
                    <td style={{ padding: '12px 16px' }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {!loading && !rangeError && rows.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Users size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {error || 'لا يوجد موظفون مطابقون في هذه الفترة'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
