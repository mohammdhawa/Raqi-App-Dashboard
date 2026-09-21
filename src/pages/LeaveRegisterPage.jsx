// The company-wide leave register: every employee's leave over a period, with
// a per-type summary and an XLSX of the same view.
//
// Two things separate it from "إدارة الإجازات" (LeavePage), which also lists
// other people's leave:
//
//  - LeavePage's approvals tab is a WORK QUEUE, scoped to the requests the
//    viewer must decide. This is a REGISTER, scoped by capability — admin and
//    HR (`leave.register.view`) — and identical for everyone who can open it.
//    A manager is refused server-side, so RequireLeaveRegisterAccess sends them
//    back rather than letting them reach a page that can only 403.
//  - Days are counted INSIDE the window. `days_in_range` is the part of a leave
//    that falls in the selected period, which is what a monthly figure means; a
//    leave crossing a boundary appears in both months and contributes only its
//    own part to each. `requested_days` (the whole leave) is shown beside it
//    whenever the two differ, so neither figure is inferred from the other.
//    Both come from the server; nothing is counted here.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  CalendarRange, Users, CalendarDays, Wallet, Building2, Layers,
  ClipboardList, Tags, ShieldCheck, X,
} from 'lucide-react'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'
import LeaveExcuseBadge from '../components/ui/LeaveExcuseBadge'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'
import { LeaveTypeFilter } from '../components/leave/LeaveTypeSelect'
import { DepartmentSelect, SectionSelect, SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh, PerPageSelect } from '../components/attendance/controls'
import { sortParams, readApiError } from '../utils/attendanceQuery'
import { useDeptSections } from '../utils/useDeptSections'
import {
  getLeaveUser, getLeaveReason, getLeaveStart, getLeaveEnd, leaveTypeName, deductsBalance,
} from '../utils/leave'

// Business rules run in Asia/Damascus; from/to are plain Y-m-d strings, so they
// are built from local calendar fields (never toISOString, which would shift
// across midnight UTC).
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthRange(offset = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: ymd(first), to: ymd(last) }
}

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Damascus' })
}

function spanDays(from, to) {
  if (!from || !to) return 0
  const a = new Date(from), b = new Date(to)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.floor((b - a) / 86400000) + 1
}

// Mirrors LeaveRegisterRequest::MAX_RANGE_DAYS, so an over-long range is caught
// before the request rather than as a 422 toast.
const MAX_RANGE_DAYS = 366

// The register defaults to approved rows (employee requests and HR excuses
// alike) — it answers "who was off, and on what". The other choices send an
// explicit `statuses` list, which is what widens it server-side.
const STATUS_CHOICES = [
  { value: '', label: 'موافق عليها (افتراضي)' },
  { value: 'pending,approved,rejected,cancelled', label: 'كل الحالات' },
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'rejected', label: 'مرفوضة' },
  { value: 'cancelled', label: 'ملغاة' },
]

const selectStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 150,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff',
  padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
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

function SummaryTile({ icon: Icon, label, value, accent, hint }) {
  return (
    <div style={{
      flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 12,
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
        {hint && <div style={{ fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 2, whiteSpace: 'nowrap' }}>{hint}</div>}
      </div>
    </div>
  )
}

/**
 * One chip per leave type, biggest first — the "what kind of leave" half of the
 * question this page answers. Days are the window's days, matching the tiles.
 * A non-deducting type is marked, because "18 days of sick leave" and "18 days
 * off the balance" are different facts.
 */
function TypeBreakdown({ types, totalDays }) {
  if (!types?.length) return null
  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18,
      padding: '12px 14px', background: '#fff', border: '1px solid var(--c-border)', borderRadius: 12,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
        <Tags size={13} style={{ color: 'var(--c-text-3)' }} />
        حسب النوع
      </span>
      {types.map((type, i) => {
        const share = totalDays > 0 ? Math.round((type.days / totalDays) * 100) : 0
        return (
          <span
            key={type.leave_type_id ?? `label-${i}`}
            title={`${type.requests} طلباً · ${type.employees} موظفاً · ${share}% من أيام الفترة`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px',
              borderRadius: 999, background: 'var(--c-surface-2)', cursor: 'help',
              fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap',
            }}
          >
            {type.name ?? '—'}
            <span style={{ fontWeight: 800, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
              {type.days}
            </span>
            {type.deducts_balance === false && <DeductsBalanceBadge deducts={false} compact short />}
          </span>
        )
      })}
    </div>
  )
}

/**
 * The days cell. `days_in_range` is the headline because the page is about a
 * period; the whole leave is shown underneath only when it is longer, which is
 * exactly when the two would otherwise be confused.
 */
function DaysCell({ row }) {
  const inRange = row?.days_in_range
  const total = row?.requested_days
  if (inRange == null) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {inRange} يوم
      </span>
      {total != null && Number(total) !== Number(inRange) && (
        <span style={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
          من أصل {total}
        </span>
      )}
    </div>
  )
}

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

function SkeletonRow({ count }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
      {Array.from({ length: count }, (_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ height: 12, borderRadius: 6, background: 'var(--c-surface-2)' }} />
        </td>
      ))}
    </tr>
  )
}

function LeaveRow({ row, last }) {
  const [hov, setHov] = useState(false)
  const employee = getLeaveUser(row)
  const reason = getLeaveReason(row)
  const deducts = deductsBalance(row)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.025)' : 'transparent', transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialsTag name={employee?.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{employee?.name ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{employee?.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <DeptSectionCell department={employee?.department?.name} section={employee?.section?.name} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
            fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
            background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
          }}>
            {leaveTypeName(row)}
          </span>
          {deducts === false && <DeductsBalanceBadge deducts={false} compact short />}
        </div>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
        {fmtDate(getLeaveStart(row))}
        <span style={{ color: 'var(--c-text-3)', margin: '0 5px' }}>←</span>
        {fmtDate(getLeaveEnd(row))}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}><DaysCell row={row} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
          <LeaveStatusBadge status={row?.status} />
          {row?.is_excuse && <LeaveExcuseBadge compact />}
        </div>
      </td>
      <td style={{ padding: '12px 16px', maxWidth: 260 }}>
        <span
          title={reason || undefined}
          style={{
            display: 'block', fontSize: 12, color: reason ? 'var(--c-text-2)' : 'var(--c-text-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {reason || '—'}
        </span>
      </td>
    </tr>
  )
}

// `field` = sortable (the leave-register whitelist: start_date, end_date,
// requested_days, status, leave_type, is_excuse, employee_name/email, …).
// `days_in_range` is computed per row and is deliberately NOT sortable — the
// server cannot order by it, and offering the header would sort by something
// other than the number under it.
const COLS = [
  { label: 'الموظف', field: 'employee_name' },
  { label: 'القسم / الشعبة' },
  { label: 'نوع الإجازة', field: 'leave_type' },
  { label: 'الفترة', field: 'start_date' },
  { label: 'أيام ضمن الفترة', center: true, title: 'أيام العمل من هذه الإجازة التي تقع داخل النطاق المحدد — وليس طول الإجازة كاملة' },
  { label: 'الحالة', field: 'status' },
  { label: 'السبب' },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeaveRegisterPage() {
  const { user } = useAuth()
  const initial = useMemo(() => monthRange(0), [])

  // The whole view lives in the URL, like the monthly attendance report: a
  // filtered register stays shareable and survives a reload. Absent params (the
  // sidebar link) mean "this month, no filters".
  const [query, setQuery] = useSearchParams()

  // `??`, not `||`: an explicitly emptied picker (from=) must stay empty —
  // only an absent param falls back to the current month.
  const from = query.get('from') ?? initial.from
  const to = query.get('to') ?? initial.to
  const departmentId = query.get('department_id') ?? ''
  const sectionId = query.get('section_id') ?? ''
  const search = query.get('search') ?? ''
  const leaveType = query.get('leave_type') ?? ''
  const statuses = query.get('statuses') ?? ''
  const excuseFilter = query.get('is_excuse') ?? ''
  const perPage = Number(query.get('per_page') ?? 25)
  const page = Number(query.get('page') ?? 1)
  const sort = useMemo(() => {
    const field = query.get('sort_by')
    return field ? { field, dir: query.get('sort_direction') === 'desc' ? 'desc' : 'asc' } : null
  }, [query])

  // Single writer for every control. A param is dropped when empty so the
  // unfiltered view keeps a clean URL and the readers' defaults stay the only
  // place a default is spelled out. `replace` so filtering doesn't stack
  // history entries between the register and wherever the user came from.
  const patchQuery = useCallback((patch) => {
    setQuery(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(patch)) {
        if (value === false || value == null || value === '') next.delete(key)
        else next.set(key, value === true ? '1' : String(value))
      }
      return next
    }, { replace: true })
  }, [setQuery])

  // Every filter change resets to page 1 — page 4 of the old filter is rarely
  // page 4 of the new one, and an out-of-range page renders an empty table.
  const patchFilter = useCallback((patch) => patchQuery({ ...patch, page: '' }), [patchQuery])

  const setRange = useCallback((range) => patchFilter({ from: range.from, to: range.to }), [patchFilter])
  // Picking a department invalidates the chosen section (the API 422s on a
  // section that doesn't belong to it), so both move in one write — clearing it
  // from an effect afterwards would also wipe a section restored from the URL.
  const setDepartmentId = useCallback(v => patchFilter({ department_id: v, section_id: '' }), [patchFilter])
  const setSectionId = useCallback(v => patchFilter({ section_id: v }), [patchFilter])
  const setSearch = useCallback(v => patchFilter({ search: v }), [patchFilter])
  const setLeaveType = useCallback(v => patchFilter({ leave_type: v }), [patchFilter])
  const setStatuses = useCallback(v => patchFilter({ statuses: v }), [patchFilter])
  const setExcuseFilter = useCallback(v => patchFilter({ is_excuse: v }), [patchFilter])
  const setPerPage = useCallback(v => patchFilter({ per_page: v === 25 ? '' : v }), [patchFilter])
  const setPage = useCallback(v => patchQuery({ page: v === 1 ? '' : v }), [patchQuery])
  const setSort = useCallback(
    s => patchFilter({ sort_by: s?.field ?? '', sort_direction: s?.dir ?? '' }),
    [patchFilter],
  )

  const [departments, setDepartments] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reqRef = useRef(0)

  // Only admin and HR reach this page, and both see every department, so the
  // picker is unconditional here — unlike the attendance reports, which hide it
  // from the department-scoped managers they also admit. `/attendance/departments`
  // nests each department's sections, so the hook answers from that payload;
  // canFetch stays admin-only because its fallback is /admin/sections, which
  // would 403 for HR.
  const sections = useDeptSections(departmentId, departments, { canFetch: user?.role === 'admin' })

  const span = spanDays(from, to)
  const rangeError = (from && to && to < from)
    ? 'تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية'
    : span > MAX_RANGE_DAYS
      ? `النطاق يتجاوز الحد الأقصى (${MAX_RANGE_DAYS} يوماً)`
      : ''

  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [])

  // Shared by the fetch and the XLSX export so the file mirrors the view.
  const buildParams = useCallback(() => {
    const params = { from, to }
    if (departmentId)        params.department_id = departmentId
    if (sectionId)           params.section_id = sectionId
    if (search.trim())       params.search = search.trim()
    if (leaveType)           params.leave_type = leaveType
    if (statuses)            params.statuses = statuses
    if (excuseFilter !== '') params.is_excuse = excuseFilter
    if (perPage !== 25)      params.per_page = perPage
    return { ...params, ...sortParams(sort) }
  }, [from, to, departmentId, sectionId, search, leaveType, statuses, excuseFilter, perPage, sort])

  const fetchRegister = useCallback(async () => {
    if (!from || !to || rangeError) return
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/attendance/leave-register', { params: { ...buildParams(), page } })
      if (reqId !== reqRef.current) return
      setReport(res.data ?? null)
    } catch (err) {
      if (reqId === reqRef.current) { setReport(null); setError(readApiError(err, 'تعذّر تحميل السجل، حاول مرة أخرى')) }
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [from, to, rangeError, buildParams, page])

  useEffect(() => { fetchRegister() }, [fetchRegister])

  useEffect(() => {
    const handler = () => fetchRegister()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRegister])

  const thisMonth = monthRange(0)
  const lastMonth = monthRange(-1)
  const isThisMonth = from === thisMonth.from && to === thisMonth.to
  const isLastMonth = from === lastMonth.from && to === lastMonth.to

  const summary = report?.summary ?? {}
  const pagination = report?.leave_requests ?? {}
  const rows = pagination.data ?? []
  const lastPage = pagination.last_page ?? 1

  const hasFilters = Boolean(departmentId || sectionId || search || leaveType || statuses || excuseFilter !== '')
  const clearFilters = () => patchFilter({
    department_id: '', section_id: '', search: '', leave_type: '', statuses: '', is_excuse: '',
  })

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          سجل الإجازات
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          كل إجازة في الفترة المحددة عبر الموظفين والأقسام: النوع، الفترة، وعدد الأيام الواقعة داخل النطاق.
          تُحتسب الأيام داخل النطاق فقط، فالإجازة الممتدة بين شهرين تظهر في كليهما بأيامها الخاصة بكل منهما.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="أي إجازة تتقاطع فترتها مع هذا النطاق">
          <CalendarRange size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <input type="date" value={from} onChange={e => setRange({ from: e.target.value, to })} style={dateInputStyle} />
          <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
          <input
            type="date" value={to} onChange={e => setRange({ from, to: e.target.value })}
            style={{ ...dateInputStyle, ...(rangeError ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}) }}
          />
        </div>
        <button onClick={() => setRange(thisMonth)} style={presetBtnStyle(isThisMonth)}>هذا الشهر</button>
        <button onClick={() => setRange(lastMonth)} style={presetBtnStyle(isLastMonth)}>الشهر الماضي</button>

        <SearchInput value={search} onChange={setSearch} />
        <DepartmentSelect departments={departments} value={departmentId} onChange={setDepartmentId} />
        <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={!departmentId} />

        {/* Which types are offered follows the source filter, as on LeavePage:
            a register with no source filter holds both kinds, so it gets the
            union — otherwise excuse-only types (official mission) would be
            missing from a list that certainly contains them. */}
        <LeaveTypeFilter
          forForm={excuseFilter === '0' ? 'requests' : excuseFilter === '1' ? 'excuses' : 'all'}
          value={leaveType} onChange={setLeaveType}
        />

        <select
          value={excuseFilter} onChange={e => setExcuseFilter(e.target.value)}
          style={{ ...selectStyle, color: excuseFilter !== '' ? 'var(--c-text)' : 'var(--c-text-2)' }}
        >
          <option value=''>المصدر: الكل</option>
          <option value='0'>طلبات الموظفين</option>
          <option value='1'>أعذار إدارية</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="السجل يعرض الإجازات الموافق عليها افتراضياً — وسّع الحالة لرؤية الطلبات قيد المراجعة أو المرفوضة">
          <ClipboardList size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <select
            value={statuses} onChange={e => setStatuses(e.target.value)}
            style={{ ...selectStyle, color: statuses ? 'var(--c-text)' : 'var(--c-text-2)' }}
          >
            {STATUS_CHOICES.map(choice => (
              <option key={choice.value} value={choice.value}>{choice.label}</option>
            ))}
          </select>
        </div>

        <PerPageSelect value={perPage} onChange={setPerPage} />

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 38, padding: '0 12px', borderRadius: 10,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
              color: 'var(--c-text-2)', cursor: 'pointer',
            }}
          >
            <X size={13} />
            مسح الفلاتر
          </button>
        )}

        <ExportButton
          url="/attendance/leave-register" params={buildParams()}
          filename="leave-register.xlsx" disabled={Boolean(rangeError)}
        />

        {rangeError && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-rejected)', whiteSpace: 'nowrap' }}>
            {rangeError}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {report && !rangeError && (
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)',
            background: 'var(--c-surface-2)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap',
          }}>
            {fmtDate(report.from)} — {fmtDate(report.to)}
          </span>
        )}
      </div>

      {/* Summary — computed server-side over the whole filtered set, not this
          page, so turning the page never moves the numbers. */}
      {!rangeError && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <SummaryTile
            icon={Users} label="موظفون في إجازة" value={summary.employees ?? 0}
            accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }}
            hint={`${summary.requests ?? 0} إجازة`}
          />
          <SummaryTile
            icon={CalendarDays} label="أيام العمل ضمن الفترة" value={summary.days ?? 0}
            accent={{ bg: 'var(--c-accent-tint)', color: 'var(--c-primary)' }}
            hint={`${summary.calendar_days ?? 0} يوم تقويمي`}
          />
          {/* Inside the figure on its left, never an addition to it. */}
          <SummaryTile
            icon={Wallet} label="منها مخصومة من الرصيد" value={summary.deducted_days ?? 0}
            accent={{ bg: 'var(--c-pending-bg)', color: 'var(--c-pending)' }}
          />
          <SummaryTile
            icon={ShieldCheck} label="أعذار إدارية" value={summary.excuses ?? 0}
            accent={{ bg: '#FFF5D9', color: '#8A5A12' }}
            hint="سجّلتها الموارد البشرية"
          />
        </div>
      )}

      {!rangeError && <TypeBreakdown types={summary.by_type} totalDays={summary.days ?? 0} />}

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
                  {COLS.map((col, i) => (
                    <SortableTh
                      key={i} label={col.label} field={col.field} sort={sort} onSort={setSort}
                      align={col.center ? 'center' : 'right'} title={col.title}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} count={COLS.length} />)
                  : rows.map((row, idx) => (
                      <LeaveRow key={row.id ?? idx} row={row} last={idx === rows.length - 1} />
                    ))
                }
              </tbody>
            </table>
          </div>
        )}

        {!loading && !rangeError && rows.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <CalendarDays size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {error || (hasFilters ? 'لا توجد إجازات مطابقة لهذه الفلاتر' : 'لا توجد إجازات في هذه الفترة')}
            </p>
          </div>
        )}

        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(page + 1)}>›</PagBtn>
          </div>
        )}
      </div>
    </div>
  )
}
