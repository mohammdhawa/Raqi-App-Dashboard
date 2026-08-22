import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, Edit3, Inbox, Wallet } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DepartmentSelect, SearchInput, SectionSelect } from '../components/attendance/filters'
import { PerPageSelect, SortableTh } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'
import { useDeptSections } from '../utils/useDeptSections'
import { EXCUSED_META, LEAVE_COPY } from '../utils/leave'
import EditLeaveBalanceModal from '../components/leave/EditLeaveBalanceModal'

const currentYear = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Damascus' }).format(new Date()))
const years = Array.from({ length: 101 }, (_, index) => 2000 + index)
// `excused_days` are approved days taken under a non-deducting type. They are
// excluded from `used_days` by design, so the label and its tooltip have to say
// plainly that they are not part of the allocation.
const columns = [
  { label: 'الموظف', field: 'name' }, { label: 'القسم / الشعبة' },
  { label: 'الرصيد السنوي' }, { label: 'التسوية' }, { label: 'المستخدم' },
  { label: LEAVE_COPY.excusedDays, title: LEAVE_COPY.excusedDaysHint },
  { label: 'المتبقي' }, { label: 'ملاحظة' }, { label: '—' },
]

function PagBtn({ children, active, disabled, onClick }) {
  return <button onClick={onClick} disabled={disabled} style={{
    width: 32, height: 32, borderRadius: 8, border: active ? 'none' : '1px solid var(--c-border)',
    background: active ? 'var(--c-primary)' : '#fff', color: active ? '#fff' : 'var(--c-text-2)',
    opacity: disabled ? 0.5 : 1, fontFamily: 'var(--font-sans)', cursor: disabled ? 'default' : 'pointer',
  }}>{children}</button>
}

function Initials({ name }) {
  const value = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')
  return <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--c-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{value}</div>
}

function BalanceRow({ row, defaultDays, last, onEdit }) {
  const remaining = Number(row.remaining_days ?? 0)
  const adjustment = Number(row.adjustment_days ?? 0)
  const remainingColor = remaining === 0 ? 'var(--c-rejected)' : remaining <= 3 ? 'var(--c-pending)' : 'var(--c-approved)'
  return <tr style={{ borderBottom: last ? 'none' : '1px solid var(--c-border)' }}>
    <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Initials name={row.user?.name} />
      <div><div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{row.user?.name ?? '—'}</span>
        {!row.is_custom && <span title={`يستخدم الرصيد الافتراضي للشركة (${defaultDays} يوم)`} style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', fontSize: 10.5, fontWeight: 800 }}>الافتراضي</span>}
      </div><div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{row.user?.email ?? '—'}</div></div>
    </div></td>
    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--c-text-2)' }}>
      <div>{row.user?.department?.name ?? '—'}</div><div style={{ color: 'var(--c-text-3)', fontSize: 11, marginTop: 2 }}>{row.user?.section?.name ?? '—'}</div>
    </td>
    <td style={{ padding: '12px 16px', fontWeight: 800 }}>{row.allocated_days}</td>
    <td style={{ padding: '12px 16px', color: adjustment < 0 ? 'var(--c-rejected)' : 'var(--c-approved)', fontWeight: 700 }}>{adjustment === 0 ? '—' : adjustment > 0 ? `+${adjustment}` : `−${Math.abs(adjustment)}`}</td>
    <td style={{ padding: '12px 16px', fontWeight: 700 }}>{row.used_days}</td>
    <td title={LEAVE_COPY.excusedDaysHint} style={{ padding: '12px 16px', fontWeight: 700, cursor: 'help', color: Number(row.excused_days ?? 0) > 0 ? EXCUSED_META.color : 'var(--c-text-3)' }}>
      {row.excused_days ?? 0}
    </td>
    <td style={{ padding: '12px 16px', fontWeight: 800, color: remainingColor }}>{row.remaining_days}</td>
    <td style={{ padding: '12px 16px', maxWidth: 220 }}><div title={row.note ?? undefined} style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: row.note ? 'var(--c-text-2)' : 'var(--c-text-3)', fontSize: 12 }}>{row.note || '—'}</div></td>
    <td style={{ padding: '12px 16px' }}><button onClick={() => onEdit(row)} title='تعديل الرصيد' style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Edit3 size={14} /></button></td>
  </tr>
}

export default function LeaveBalancesPage() {
  const { user } = useAuth()
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance
  const [year, setYear] = useState(currentYear)
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [search, setSearch] = useState('')
  const [departments, setDepartments] = useState([])
  const [rows, setRows] = useState([])
  const [defaultDays, setDefaultDays] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const reqRef = useRef(0)
  const sectionDeptId = hasFullAccess ? departmentId : (user?.department_id ?? '')
  const sections = useDeptSections(sectionDeptId, departments, { canFetch: user?.role === 'admin' })

  useEffect(() => {
    api.get('/attendance/departments').then(response => setDepartments(response.data?.departments ?? [])).catch(() => setDepartments([]))
  }, [])

  const fetchRows = useCallback(async targetPage => {
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const params = { year, page: targetPage, per_page: perPage, ...sortParams(sort) }
      if (departmentId) params.department_id = departmentId
      if (sectionId) params.section_id = sectionId
      if (search.trim()) params.search = search.trim()
      const response = await api.get('/attendance/leave-balances', { params })
      if (reqId !== reqRef.current) return
      const paginator = response.data?.balances ?? {}
      setRows(paginator.data ?? []); setPage(paginator.current_page ?? targetPage)
      setLastPage(paginator.last_page ?? 1); setTotal(paginator.total ?? 0)
      setDefaultDays(response.data?.default_days ?? null)
    } catch (error) {
      if (reqId !== reqRef.current) return
      setRows([]); setTotal(0); setLastPage(1)
      const data = error?.response?.data
      setError(data?.errors ? Object.values(data.errors).flat().join('، ') : data?.message ?? 'تعذّر تحميل أرصدة الإجازات.')
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [year, perPage, sort, departmentId, sectionId, search])

  useEffect(() => {
    // Data fetching intentionally starts when the active query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(1)
  }, [year, perPage, sort, departmentId, sectionId, search, fetchRows])

  useEffect(() => {
    const handler = () => fetchRows(page)
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRows, page])

  const changeDepartment = value => { setDepartmentId(value); setSectionId('') }
  const saveRow = balance => {
    setRows(current => current.map(row => String(row.user?.id) === String(balance.user_id) ? { ...row, ...balance, user: row.user } : row))
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)' }}>أرصدة الإجازات</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          إدارة الاستحقاق السنوي والتسويات ومتابعة الرصيد المستخدم والمتبقي لكل موظف.
          عمود «{LEAVE_COPY.excusedDays}» يعرض الإجازات المعتمدة التي لا تُخصم من الاستحقاق.
        </p>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', fontSize: 11, fontWeight: 700 }}><Wallet size={12} />{total} موظفاً</span>
          <div style={{ flex: 1 }} />
          <SearchInput value={search} onChange={setSearch} />
          {hasFullAccess && <DepartmentSelect departments={departments} value={departmentId} onChange={changeDepartment} />}
          <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={hasFullAccess && !departmentId} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} style={{ color: 'var(--c-text-3)' }} />
            <select value={year} onChange={event => setYear(Number(event.target.value))} style={{ height: 38, padding: '0 10px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)' }}>
              {years.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <PerPageSelect value={perPage} onChange={setPerPage} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          {error && <div style={{ margin: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--c-surface)' }}>
              {columns.map(column => <SortableTh key={column.label} label={column.label} field={column.field} title={column.title} sort={sort} onSort={setSort} />)}
            </tr></thead>
            <tbody>
              {loading ? [0, 1, 2, 3, 4].map(index => <tr key={index}>{columns.map((column, cell) => <td key={column.label} style={{ padding: '12px 16px' }}><div style={{ height: 16, width: cell === 0 ? 150 : 70, borderRadius: 7, background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} /></td>)}</tr>)
                : rows.map((row, index) => <BalanceRow key={row.user?.id ?? index} row={row} defaultDays={defaultDays} last={index === rows.length - 1} onEdit={setEditing} />)}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && <div style={{ padding: '56px 20px', textAlign: 'center' }}><Inbox size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} /><p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>لا يوجد موظفون مطابقون للتصفية</p></div>}
        {lastPage > 1 && <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'center', gap: 6 }}>
          <PagBtn disabled={page <= 1} onClick={() => { setPage(page - 1); fetchRows(page - 1) }}>‹</PagBtn>
          {Array.from({ length: lastPage }, (_, index) => index + 1).map(value => <PagBtn key={value} active={value === page} onClick={() => { setPage(value); fetchRows(value) }}>{value}</PagBtn>)}
          <PagBtn disabled={page >= lastPage} onClick={() => { setPage(page + 1); fetchRows(page + 1) }}>›</PagBtn>
        </div>}
      </div>
      {editing && <EditLeaveBalanceModal row={editing} defaultDays={defaultDays} selectedYear={year} onClose={() => setEditing(null)} onSaved={saveRow} />}
    </div>
  )
}
