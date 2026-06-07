import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import {
  Fingerprint, Search, ChevronDown, Calendar, LogIn, LogOut,
  MapPin, Camera, X, User as UserIcon,
} from 'lucide-react'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

const TYPE_META = {
  check_in:  { label: 'تسجيل دخول', icon: LogIn,  color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  check_out: { label: 'تسجيل خروج', icon: LogOut, color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
}

const ROLE_META = {
  admin:    { label: 'مدير النظام',   bg: 'var(--c-primary)',     color: '#fff' },
  chief:    { label: 'الرئيس الأعلى', bg: 'var(--c-accent-tint)', color: '#8A6A23' },
  manager:  { label: 'مدير',          bg: 'rgba(34,65,103,0.09)', color: 'var(--c-primary)' },
  employee: { label: 'موظف',          bg: 'var(--c-surface-2)',   color: 'var(--c-text-2)' },
}

const TABLE_COLS = ['الموظف', 'الدور', 'النوع', 'التاريخ والوقت', 'الموقع', 'الصورة']

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

// ── Badges ────────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const meta = TYPE_META[type]
  if (!meta) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: meta.color,
      background: meta.bg, border: `1px solid ${meta.color}22`,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

function RoleBadge({ role }) {
  const m = ROLE_META[role] ?? ROLE_META.employee
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  )
}

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

// ── Location / selfie cells ───────────────────────────────────────────────────

function LocationCell({ lat, lng }) {
  if (lat == null || lng == null) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const url = `https://www.google.com/maps?q=${lat},${lng}`
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className="text-[var(--c-text-2)] hover:text-[var(--c-primary)]"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        textDecoration: 'none', fontVariantNumeric: 'tabular-nums', transition: 'color .14s',
      }}
    >
      <MapPin size={12} style={{ flexShrink: 0 }} />
      {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
    </a>
  )
}

function SelfieTag({ path }) {
  if (!path) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <span title={path} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
    }}>
      <Camera size={12} />
      صورة مرفقة
    </span>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {[[170, 34, 17], [80, 22, 7], [100, 26, 7], [90, 16, 7], [110, 16, 7], [90, 22, 7]].map(([w, h, r], i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: h, width: w, borderRadius: r, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Record row (separated to avoid hook-in-loop) ─────────────────────────────

function RecordRow({ record, last }) {
  const [hov, setHov] = useState(false)
  const u = record.user
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialsTag name={u?.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{u?.name ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{u?.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <RoleBadge role={u?.role} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <TypeBadge type={record.type} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>{formatDate(record.recorded_at)}</div>
        <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{formatTime(record.recorded_at)}</div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <LocationCell lat={record.latitude} lng={record.longitude} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <SelfieTag path={record.selfie_path} />
      </td>
    </tr>
  )
}

// ── Pagination button ─────────────────────────────────────────────────────────

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

// ── User filter combobox (searches /admin/users) ─────────────────────────────

function UserPicker({ selected, onSelect }) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => {
      api.get('/admin/users', { params: query ? { search: query } : {} })
        .then(res => setResults(res.data.users?.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 280)
    return () => clearTimeout(t)
  }, [query, open])

  const pick = u => { onSelect(u); setOpen(false); setQuery('') }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          height: 38, padding: '0 12px', borderRadius: 10, minWidth: 180,
          background: '#fff', border: '1px solid var(--c-border)',
          fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
          color: selected ? 'var(--c-text)' : 'var(--c-text-2)', cursor: 'pointer',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
          <UserIcon size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.name : 'الموظف: الكل'}
          </span>
        </span>
        {selected ? (
          <span
            role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onSelect(null) }}
            style={{ display: 'inline-flex', color: 'var(--c-text-3)', flexShrink: 0 }}
          >
            <X size={13} />
          </span>
        ) : (
          <ChevronDown size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 20,
          width: 270, background: '#fff', borderRadius: 12,
          border: '1px solid var(--c-border)', boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--c-surface)', borderRadius: 9, padding: '0 10px', height: 36,
            }}>
              <Search size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو البريد..."
                style={{
                  flex: 1, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
                }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)' }}>جارٍ البحث...</div>
            )}
            {!loading && results.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)' }}>لا يوجد مستخدمون مطابقون</div>
            )}
            {!loading && results.map(u => (
              <div
                key={u.id} onClick={() => pick(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: 'pointer',
                  background: selected?.id === u.id ? 'var(--c-surface)' : 'transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-surface)' }}
                onMouseLeave={e => { e.currentTarget.style.background = selected?.id === u.id ? 'var(--c-surface)' : 'transparent' }}
              >
                <InitialsTag name={u.name} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal]     = useState(0)

  const [selectedUser, setSelectedUser] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateTo < dateFrom)

  // Guards against a stale in-flight request (e.g. for a previous filter
  // combination) resolving after newer filters have already changed state.
  const requestIdRef = useRef(0)

  // ── API ──────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async (targetPage) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    try {
      const params = { page: targetPage }
      if (selectedUser) params.user_id = selectedUser.id
      if (dateFrom)     params.from    = dateFrom
      if (dateTo)       params.to      = dateTo
      const res = await api.get('/attendance/records', { params })
      if (reqId !== requestIdRef.current) return
      const pag = res.data.records
      setRecords(pag?.data ?? [])
      setLastPage(pag?.last_page ?? 1)
      setTotal(pag?.total ?? 0)
    } catch {
      if (reqId === requestIdRef.current) setRecords([])
    } finally {
      if (reqId === requestIdRef.current) setLoading(false)
    }
  }, [selectedUser, dateFrom, dateTo])

  // Reset to page 1 when filters change, then fetch (skip when range is invalid)
  useEffect(() => {
    if (dateRangeInvalid) {
      requestIdRef.current++ // invalidate any in-flight request
      setRecords([]); setTotal(0); setLastPage(1); setLoading(false)
      return
    }
    setPage(1)
    fetchRecords(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, dateFrom, dateTo, dateRangeInvalid])

  // Fetch when page changes (without resetting)
  useEffect(() => { if (!dateRangeInvalid) fetchRecords(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { if (!dateRangeInvalid) fetchRecords(page) }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRecords, page, dateRangeInvalid])

  const hasFilters = Boolean(selectedUser || dateFrom || dateTo)
  const clearFilters = () => { setSelectedUser(null); setDateFrom(''); setDateTo('') }

  const emptyMessage = dateRangeInvalid
    ? 'يرجى تصحيح نطاق التاريخ المحدد'
    : hasFilters ? 'لا توجد سجلات مطابقة لهذا البحث' : 'لا توجد سجلات حضور مسجّلة بعد'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الحضور والانصراف
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          متابعة سجلات حضور وانصراف جميع الموظفين، مع موقع التسجيل والصورة الموثّقة لكل عملية.
        </p>
      </div>

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Fingerprint size={17} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>سجلات الحضور</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {total} سجلاً
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* User filter */}
          <UserPicker selected={selectedUser} onSelect={setSelectedUser} />

          {/* Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInputStyle} />
            <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{
                ...dateInputStyle,
                ...(dateRangeInvalid ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}),
              }}
            />
          </div>

          {dateRangeInvalid && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-rejected)', whiteSpace: 'nowrap' }}>
              تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية
            </span>
          )}

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
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {TABLE_COLS.map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: 'right',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)
                : records.map((r, idx) => <RecordRow key={r.id} record={r} last={idx === records.length - 1} />)
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && records.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Fingerprint size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {emptyMessage}
            </p>
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1}       onClick={() => setPage(p => p - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>›</PagBtn>
          </div>
        )}
      </div>
    </div>
  )
}
