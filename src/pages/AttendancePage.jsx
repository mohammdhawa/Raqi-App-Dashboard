import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  Fingerprint, Search, ChevronDown, Calendar, LogIn, LogOut,
  MapPin, Camera, X, User as UserIcon, UserX, Building2,
  Loader2, ImageOff, ExternalLink,
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
const TABLE_COLS_ABSENT = ['الموظف', 'الدور', 'الإدارة', 'الحالة']

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

const deptSelectStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 140,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
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

function AbsentBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: 'var(--c-rejected)',
      background: 'var(--c-rejected-bg)', border: '1px solid var(--c-rejected)22',
      whiteSpace: 'nowrap',
    }}>
      <UserX size={12} />
      غائب
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

function SelfieTag({ record, onView }) {
  if (!record.selfie_path) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <button
      onClick={() => onView(record)} title="عرض الصورة"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
        background: 'var(--c-surface-2)', color: 'var(--c-text-2)', whiteSpace: 'nowrap',
        border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'background .12s, color .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-primary)'; e.currentTarget.style.color = '#fff' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-surface-2)'; e.currentTarget.style.color = 'var(--c-text-2)' }}
    >
      <Camera size={12} />
      صورة مرفقة
    </button>
  )
}

// ── Selfie preview modal ──────────────────────────────────────────────────────

function SelfiePreviewModal({ record, onClose }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'loaded' | 'error'
  const u = record.user
  const url = record.selfie_url

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)', background: '#fff', borderRadius: 16,
          overflow: 'hidden', boxShadow: 'var(--sh-card-lg)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 800, color: 'var(--c-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {u?.name ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>
              {formatDate(record.recorded_at)} — {formatTime(record.recorded_at)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {url && status === 'loaded' && (
              <button
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="فتح في تبويب جديد"
                style={{
                  width: 34, height: 34, borderRadius: 9,
                  border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <ExternalLink size={15} />
              </button>
            )}
            <button
              onClick={onClose} title="إغلاق"
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--c-surface)' }}>
          {status === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>جارٍ تحميل الصورة...</span>
            </div>
          )}
          {status === 'error' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <ImageOff size={28} style={{ color: 'var(--c-text-3)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>
                تعذّر تحميل الصورة
              </span>
            </div>
          )}
          {url && (
            <img
              src={url} alt="صورة تسجيل الحضور"
              onLoad={() => setStatus('loaded')}
              onError={() => setStatus('error')}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: status === 'loaded' ? 'block' : 'none',
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <TypeBadge type={record.type} />
          <LocationCell lat={record.latitude} lng={record.longitude} />
        </div>
      </div>
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

const SKELETON_CELLS = [[170, 34, 17], [80, 22, 7], [100, 26, 7], [90, 16, 7], [110, 16, 7], [90, 22, 7]]
const SKELETON_CELLS_ABSENT = [[170, 34, 17], [80, 22, 7], [120, 16, 7], [70, 26, 7]]

function SkeletonRow({ cells = SKELETON_CELLS }) {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {cells.map(([w, h, r], i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: h, width: w, borderRadius: r, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// ── Record row (separated to avoid hook-in-loop) ─────────────────────────────

function RecordRow({ record, last, onViewSelfie }) {
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
        <SelfieTag record={record} onView={onViewSelfie} />
      </td>
    </tr>
  )
}

// ── Absent row ────────────────────────────────────────────────────────────────

function AbsentRow({ user, last }) {
  const [hov, setHov] = useState(false)
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
          <InitialsTag name={user?.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{user?.name ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>{user?.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <RoleBadge role={user?.role} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        {user?.department?.name ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--c-text-2)' }}>
            <Building2 size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            {user.department.name}
          </span>
        ) : (
          <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
        )}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <AbsentBadge />
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

// ── Department filter (admin / can_view_attendance only) ─────────────────────

function DepartmentFilter({ departments, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Building2 size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{ ...deptSelectStyle, color: value ? 'var(--c-text)' : 'var(--c-text-2)' }}
      >
        <option value="">الإدارة: الكل</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth()
  // /admin/users (used by the employee filter) is admin-only — managers/chiefs
  // and non-admin HR viewers see records auto-scoped to their department instead.
  const canPickUser = user?.role === 'admin'
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance

  // 'records' = attendance log (defaults to today on the backend),
  // 'absent'  = employees with attendance_check who have no check-in for the day.
  const [view, setView] = useState('records')

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal]     = useState(0)

  const [selectedUser, setSelectedUser] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments]   = useState([])

  const [selfiePreview, setSelfiePreview] = useState(null)

  // Absent-today tab — single date (empty = today, resolved by the backend).
  const [absentRows, setAbsentRows]   = useState([])
  const [absentLoading, setAbsentLoading] = useState(true)
  const [absentPage, setAbsentPage]   = useState(1)
  const [absentLastPage, setAbsentLastPage] = useState(1)
  const [absentTotal, setAbsentTotal] = useState(0)
  const [absentDate, setAbsentDate]   = useState('')
  const [resolvedDate, setResolvedDate] = useState('')

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateTo < dateFrom)
  const isAbsent = view === 'absent'
  const noDateFilter = !dateFrom && !dateTo

  // Guards against a stale in-flight request (e.g. for a previous filter
  // combination) resolving after newer filters have already changed state.
  const requestIdRef = useRef(0)

  // Department picker — only admins / can_view_attendance users can filter by
  // department, so only fetch the list for them.
  useEffect(() => {
    if (!hasFullAccess) return
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [hasFullAccess])

  // ── API ──────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async (targetPage) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    try {
      const params = { page: targetPage }
      if (selectedUser)   params.user_id       = selectedUser.id
      if (dateFrom)       params.from          = dateFrom
      if (dateTo)         params.to            = dateTo
      if (departmentId)   params.department_id = departmentId
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
  }, [selectedUser, dateFrom, dateTo, departmentId])

  const absentReqRef = useRef(0)
  const fetchAbsent = useCallback(async (targetPage) => {
    const reqId = ++absentReqRef.current
    setAbsentLoading(true)
    try {
      const params = { page: targetPage }
      if (absentDate)    params.date          = absentDate
      if (departmentId)  params.department_id = departmentId
      const res = await api.get('/attendance/absent-today', { params })
      if (reqId !== absentReqRef.current) return
      const pag = res.data.employees
      setAbsentRows(pag?.data ?? [])
      setAbsentLastPage(pag?.last_page ?? 1)
      setAbsentTotal(pag?.total ?? 0)
      setResolvedDate(res.data.date ?? '')
    } catch {
      if (reqId === absentReqRef.current) { setAbsentRows([]); setAbsentTotal(0); setAbsentLastPage(1) }
    } finally {
      if (reqId === absentReqRef.current) setAbsentLoading(false)
    }
  }, [absentDate, departmentId])

  // Reset to page 1 when records filters change, then fetch (skip when range is invalid)
  useEffect(() => {
    if (isAbsent) return
    if (dateRangeInvalid) {
      requestIdRef.current++ // invalidate any in-flight request
      setRecords([]); setTotal(0); setLastPage(1); setLoading(false)
      return
    }
    setPage(1)
    fetchRecords(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, dateFrom, dateTo, departmentId, dateRangeInvalid, view])

  // Fetch records when page changes (without resetting)
  useEffect(() => { if (!isAbsent && !dateRangeInvalid) fetchRecords(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when the absent date or department changes, then fetch
  useEffect(() => {
    if (!isAbsent) return
    setAbsentPage(1)
    fetchAbsent(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absentDate, departmentId, view])

  // Fetch absentees when page changes (without resetting)
  useEffect(() => { if (isAbsent) fetchAbsent(absentPage) }, [absentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Topbar refresh button — refresh whichever tab is active
  useEffect(() => {
    const handler = () => {
      if (isAbsent) fetchAbsent(absentPage)
      else if (!dateRangeInvalid) fetchRecords(page)
    }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRecords, fetchAbsent, page, absentPage, dateRangeInvalid, isAbsent])

  const hasFilters = Boolean(selectedUser || dateFrom || dateTo || departmentId)
  const clearFilters = () => { setSelectedUser(null); setDateFrom(''); setDateTo(''); setDepartmentId('') }

  // Active-tab view-model so the table/empty/pagination blocks stay tab-agnostic.
  const activeLoading  = isAbsent ? absentLoading  : loading
  const activeRows     = isAbsent ? absentRows     : records
  const activeTotal    = isAbsent ? absentTotal    : total
  const activeLastPage = isAbsent ? absentLastPage : lastPage
  const activePage     = isAbsent ? absentPage     : page
  const goToPage = (p) => (isAbsent ? setAbsentPage(p) : setPage(p))

  const recordsEmptyMessage = dateRangeInvalid
    ? 'يرجى تصحيح نطاق التاريخ المحدد'
    : hasFilters
      ? (noDateFilter ? 'لا توجد سجلات مطابقة لهذا الموظف اليوم' : 'لا توجد سجلات مطابقة لهذا البحث')
      : 'لا توجد سجلات حضور لهذا اليوم'
  const emptyMessage = isAbsent ? 'لا يوجد موظفون غائبون في هذا اليوم' : recordsEmptyMessage

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          الحضور والانصراف
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          {hasFullAccess
            ? 'متابعة سجلات حضور وانصراف جميع الموظفين، مع موقع التسجيل والصورة الموثّقة لكل عملية.'
            : 'متابعة سجلات حضور وانصراف موظفي إدارتك، مع موقع التسجيل والصورة الموثّقة لكل عملية.'}
        </p>
      </div>

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '8px 12px', borderBottom: '1px solid var(--c-border)',
        }}>
          {[
            { key: 'records', label: 'سجلات الحضور',  icon: Fingerprint },
            { key: 'absent',  label: 'الغائبون اليوم', icon: UserX },
          ].map(t => {
            const Icon = t.icon
            const active = view === t.key
            return (
              <button
                key={t.key} onClick={() => setView(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 36, padding: '0 14px', borderRadius: 9, border: 'none',
                  background: active ? 'var(--c-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--c-text-2)',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'background .12s',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
              background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
            }}>
              {isAbsent ? `${activeTotal} غائباً` : `${activeTotal} سجلاً`}
            </span>
            {isAbsent
              ? resolvedDate && (
                  <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>ليوم {formatDate(resolvedDate)}</span>
                )
              : noDateFilter && (
                  <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    يُعرض حضور اليوم — حدّد تاريخاً لعرض سجلات أخرى
                  </span>
                )}
          </div>

          <div style={{ flex: 1 }} />

          {isAbsent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Department filter — only meaningful for admin / can_view_attendance users */}
              {hasFullAccess && (
                <DepartmentFilter departments={departments} value={departmentId} onChange={setDepartmentId} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input type="date" value={absentDate} onChange={e => setAbsentDate(e.target.value)} style={dateInputStyle} />
                {absentDate && (
                  <button
                    onClick={() => setAbsentDate('')} title="العودة إلى اليوم"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 38, padding: '0 12px', borderRadius: 10,
                      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                      color: 'var(--c-text-2)', cursor: 'pointer',
                    }}
                  >
                    <X size={13} />
                    اليوم
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* User filter — relies on /admin/users, which is admin-only */}
              {canPickUser && <UserPicker selected={selectedUser} onSelect={setSelectedUser} />}

              {/* Department filter — only meaningful for admin / can_view_attendance users */}
              {hasFullAccess && (
                <DepartmentFilter departments={departments} value={departmentId} onChange={setDepartmentId} />
              )}

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
            </>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {(isAbsent ? TABLE_COLS_ABSENT : TABLE_COLS).map(col => (
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
              {activeLoading
                ? [0, 1, 2, 3, 4].map(i => (
                    <SkeletonRow key={i} cells={isAbsent ? SKELETON_CELLS_ABSENT : SKELETON_CELLS} />
                  ))
                : isAbsent
                  ? activeRows.map((u, idx) => <AbsentRow key={u.id} user={u} last={idx === activeRows.length - 1} />)
                  : activeRows.map((r, idx) => <RecordRow key={r.id} record={r} last={idx === activeRows.length - 1} onViewSelfie={setSelfiePreview} />)
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!activeLoading && activeRows.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            {isAbsent
              ? <UserX size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
              : <Fingerprint size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />}
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
              {emptyMessage}
            </p>
          </div>
        )}

        {/* Pagination */}
        {activeLastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={activePage <= 1}             onClick={() => goToPage(activePage - 1)}>‹</PagBtn>
            {Array.from({ length: activeLastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === activePage} onClick={() => goToPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={activePage >= activeLastPage} onClick={() => goToPage(activePage + 1)}>›</PagBtn>
          </div>
        )}
      </div>

      {selfiePreview && (
        <SelfiePreviewModal record={selfiePreview} onClose={() => setSelfiePreview(null)} />
      )}
    </div>
  )
}
