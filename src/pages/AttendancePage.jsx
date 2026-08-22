import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  Fingerprint, Calendar, LogIn, LogOut,
  MapPin, Camera, X, User as UserIcon, UserX, Building2,
  Loader2, ImageOff, ExternalLink, Plane, CalendarOff,
  Layers, AlertTriangle, ShieldCheck, Clock,
  ShieldPlus,
} from 'lucide-react'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'
import LeaveExcuseBadge from '../components/ui/LeaveExcuseBadge'
import ExcuseLeaveModal from '../components/leave/ExcuseLeaveModal'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'
import { getLeaveUser, getLeaveStart, getLeaveEnd, getLeaveDays, leaveTypeName, deductsBalance } from '../utils/leave'
import { SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh, PerPageSelect, ToggleChip, MultiSelect } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'
import { useDeptsSections } from '../utils/useDeptSections'

// The system is single-timezone (Asia/Damascus). `recorded_at` is serialized
// as UTC ISO by the backend, so pin formatting to Damascus — otherwise times
// would render in the viewer's browser timezone and disagree with the report.
const ATT_TZ = 'Asia/Damascus'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ATT_TZ })
}

function formatTime(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: ATT_TZ })
}

// Surface the API's Arabic message: prefer field-validation errors (e.g.
// errors.section_id when a section doesn't belong to the department), then the
// business-rule top-level `message`. 401 is handled globally by the interceptor.
function readApiError(err) {
  const data = err?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('، ')
  if (data?.message) return data.message
  return 'تعذّر تحميل البيانات، حاول مرة أخرى'
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

// Column defs: `field` marks a header as sortable and must stay inside the
// endpoint's whitelist (records: recorded_at/type + relation employee_name;
// absent-today: name/role/department; approved-leave-users: employee_name/
// leave_type/start_date/requested_days).
const TABLE_COLS = [
  { label: 'الموظف', field: 'employee_name' },
  { label: 'القسم', field: 'department' },
  { label: 'النوع', field: 'type' },
  { label: 'التاريخ والوقت', field: 'recorded_at' },
  { label: 'الموقع' },
  { label: 'الصورة' },
]
const TABLE_COLS_ABSENT = [
  { label: 'الموظف', field: 'name' },
  { label: 'الدور', field: 'role' },
  { label: 'الإدارة', field: 'department' },
  { label: 'الحالة' },
  { label: '—' },
]
const TABLE_COLS_LEAVE = [
  { label: 'الموظف', field: 'employee_name' },
  { label: 'الإدارة' },
  { label: 'نوع الإجازة', field: 'leave_type' },
  { label: 'الفترة', field: 'start_date' },
  { label: 'الأيام', field: 'requested_days' },
  { label: 'الحالة' },
  { label: 'مسجّل بواسطة' },
]

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
  // Gate on the public URL (null for admin-created checkouts), not selfie_path.
  if (!record.selfie_url) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
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
const SKELETON_CELLS_ABSENT = [[170, 34, 17], [80, 22, 7], [120, 16, 7], [70, 26, 7], [110, 30, 8]]
const SKELETON_CELLS_LEAVE = [[170, 34, 17], [120, 16, 7], [70, 22, 7], [140, 16, 7], [50, 16, 7], [90, 22, 7], [110, 16, 7]]

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
        <DeptSectionCell department={u?.department?.name} section={u?.section?.name} />
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

function AbsentRow({ user, last, onExcuse }) {
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
      <td style={{ padding: '12px 16px' }}>
        <button onClick={() => onExcuse(user)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 9, border: 'none', background: 'var(--c-primary-light)', color: 'var(--c-primary)', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <ShieldPlus size={13} /> تسجيل عذر / إجازة
        </button>
      </td>
    </tr>
  )
}

// Department + section stacked cell — same design as the daily report page.
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

// ── Approved-leave row ────────────────────────────────────────────────────────

function DeptCell({ name }) {
  if (!name) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--c-text-2)' }}>
      <Building2 size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      {name}
    </span>
  )
}

// Label from the row's resolved type, policy from the row's own
// `deducts_balance` snapshot — the raw `leave_type` string is never switched on
// (new rows hold the type's Arabic label, older ones raw free text).
function LeaveTypePill({ item }) {
  const deducts = deductsBalance(item)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
        background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
      }}>
        {leaveTypeName(item)}
      </span>
      {deducts === false && <DeductsBalanceBadge deducts={false} compact short />}
    </div>
  )
}

function LeaveRow({ item, last }) {
  const [hov, setHov] = useState(false)
  const u = getLeaveUser(item)
  const start = getLeaveStart(item)
  const end = getLeaveEnd(item)
  const days = getLeaveDays(item)
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
        <DeptCell name={u?.department?.name} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <LeaveTypePill item={item} />
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
          {formatDate(start)} — {formatDate(end)}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
          {days != null ? `${days} يوم` : '—'}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <LeaveStatusBadge status='approved_leave' />
          {item.is_excuse && <LeaveExcuseBadge compact />}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
          {item.is_excuse ? (item.creator?.name ?? 'الموارد البشرية') : (item.manager?.name ?? '—')}
        </div>
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




// ── Single-date filters (shared by the absent + approved-leave tabs) ─────────
// Mirrors the records filter set: department(s) → dependent section(s) cascade,
// employee multi-select, a name/email search box, and a single date. The
// department picker is gated to full-access viewers (managers/chiefs are
// auto-scoped to their own department server-side); the section picker shows
// for everyone, fed from the manager's own department when there's no picker.

function SingleDateFilters({
  hasFullAccess, departments, departmentIds, setDepartmentIds,
  sections, sectionIds, setSectionIds,
  employees, userIds, setUserIds,
  search, setSearch, date, setDate,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <SearchInput value={search} onChange={setSearch} />
      {hasFullAccess && (
        <MultiSelect
          icon={Building2} label="الإدارة" options={departments}
          values={departmentIds} onChange={setDepartmentIds}
        />
      )}
      {/* Managers/chiefs see it too — fed from their own department */}
      <MultiSelect
        icon={Layers} label="القسم" options={sections}
        values={sectionIds} onChange={setSectionIds}
        disabled={hasFullAccess && !departmentIds.length} disabledTitle="اختر الإدارة أولاً"
      />
      {employees.length > 0 && (
        <MultiSelect
          icon={UserIcon} label="الموظف" options={employees}
          values={userIds} onChange={setUserIds}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
        {date && (
          <button
            onClick={() => setDate('')} title="العودة إلى اليوم"
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
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuth()
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance

  // 'records' = attendance log (defaults to today on the backend),
  // 'absent'  = employees with attendance_check who have no check-in for the day,
  // 'leave'   = employees on approved leave for the day (excluded from absent).
  const [view, setView] = useState('records')

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal]     = useState(0)
  const [recordsWorkingDay, setRecordsWorkingDay] = useState(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [monthValue, setMonthValue] = useState('') // "YYYY-MM" → month/year shorthand
  const [departmentIds, setDepartmentIds] = useState([])
  const [departments, setDepartments]     = useState([])
  const [sectionIds, setSectionIds] = useState([])
  const [userIds, setUserIds]       = useState([])
  const [employees, setEmployees]   = useState([])
  const [search, setSearch]         = useState('')
  const [type, setType]             = useState('')
  const [missingCheckout, setMissingCheckout] = useState(false)
  const [isCorrected, setIsCorrected]         = useState(false)
  const [whMin, setWhMin] = useState('')
  const [whMax, setWhMax] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [sort, setSort]             = useState(null)
  const [absentSort, setAbsentSort] = useState(null)
  const [leaveSort, setLeaveSort]   = useState(null)

  // Section options depend on the chosen departments (avoids the 422 the
  // backend raises when a section doesn't belong to the selected departments).
  // Managers/chiefs have no department picker (they're dept-locked server-side)
  // but may still filter by section — feed them their own department's sections.
  const ownDeptId = user?.department_id ?? null
  const sectionDeptIds = useMemo(
    () => hasFullAccess
      ? departmentIds
      : (ownDeptId != null ? [String(ownDeptId)] : []),
    [hasFullAccess, departmentIds, ownDeptId]
  )
  const sections = useDeptsSections(sectionDeptIds, departments, { canFetch: user?.role === 'admin' })

  const [selfiePreview, setSelfiePreview] = useState(null)
  const [excuseTarget, setExcuseTarget] = useState(null)

  // Absent-today tab — single date (empty = today, resolved by the backend).
  const [absentRows, setAbsentRows]   = useState([])
  const [absentLoading, setAbsentLoading] = useState(true)
  const [absentPage, setAbsentPage]   = useState(1)
  const [absentLastPage, setAbsentLastPage] = useState(1)
  const [absentTotal, setAbsentTotal] = useState(0)
  const [absentDate, setAbsentDate]   = useState('')
  const [resolvedDate, setResolvedDate] = useState('')
  const [absentWorkingDay, setAbsentWorkingDay] = useState(true)
  const [absentError, setAbsentError] = useState('')

  // Approved-leave tab — single date (empty = today, resolved by the backend).
  const [leaveRows, setLeaveRows]     = useState([])
  const [leaveLoading, setLeaveLoading] = useState(true)
  const [leavePage, setLeavePage]     = useState(1)
  const [leaveLastPage, setLeaveLastPage] = useState(1)
  const [leaveTotal, setLeaveTotal]   = useState(0)
  const [leaveDate, setLeaveDate]     = useState('')
  const [leaveResolvedDate, setLeaveResolvedDate] = useState('')
  const [leaveWorkingDay, setLeaveWorkingDay] = useState(true)
  const [leaveError, setLeaveError]   = useState('')

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateTo < dateFrom)
  const isAbsent = view === 'absent'
  const isLeave  = view === 'leave'
  const noDateFilter = !dateFrom && !dateTo && !monthValue

  // Guards against a stale in-flight request (e.g. for a previous filter
  // combination) resolving after newer filters have already changed state.
  const requestIdRef = useRef(0)

  // Departments feed — full-access users get the department picker from it;
  // managers/chiefs still need it for their own department's nested sections
  // (the /attendance/departments route allows every attendance viewer).
  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [])

  // Employee picker (user_ids) — fed from the admin users list, so admins only.
  useEffect(() => {
    if (user?.role !== 'admin') return
    api.get('/admin/users', { params: { per_page: 100 } })
      .then(res => setEmployees(res.data.users?.data ?? []))
      .catch(() => setEmployees([]))
  }, [user?.role])

  // Setting a date range clears the month shorthand and vice versa (the API
  // would silently prefer from/to; keeping one active avoids confusion).
  const changeDateFrom = v => { setDateFrom(v); if (v) setMonthValue('') }
  const changeDateTo   = v => { setDateTo(v);   if (v) setMonthValue('') }
  const changeMonth    = v => { setMonthValue(v); if (v) { setDateFrom(''); setDateTo('') } }

  // Filter params shared by the records fetch and its XLSX export (which must
  // mirror the exact query, minus page/per_page).
  const buildRecordFilters = useCallback(() => {
    const params = {}
    if (dateFrom) params.from = dateFrom
    if (dateTo)   params.to   = dateTo
    if (!dateFrom && !dateTo && monthValue) {
      const [y, m] = monthValue.split('-')
      params.month = Number(m)
      params.year  = Number(y)
    }
    if (departmentIds.length) params.department_ids = departmentIds.join(',')
    if (sectionIds.length)    params.section_ids    = sectionIds.join(',')
    if (userIds.length)       params.user_ids       = userIds.join(',')
    if (search.trim())        params.search         = search.trim()
    if (type)                 params.type           = type
    if (missingCheckout)      params.missing_checkout = 1
    if (isCorrected)          params.is_corrected     = 1
    if (whMin !== '')         params.work_hours_min = whMin
    if (whMax !== '')         params.work_hours_max = whMax
    return { ...params, ...sortParams(sort) }
  }, [dateFrom, dateTo, monthValue, departmentIds, sectionIds, userIds, search,
      type, missingCheckout, isCorrected, whMin, whMax, sort])

  // ── API ──────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async (targetPage) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    try {
      const params = { ...buildRecordFilters(), page: targetPage, per_page: perPage }
      const res = await api.get('/attendance/records', { params })
      if (reqId !== requestIdRef.current) return
      const pag = res.data.records
      setRecords(pag?.data ?? [])
      setLastPage(pag?.last_page ?? 1)
      setTotal(pag?.total ?? 0)
      setRecordsWorkingDay(res.data.working_day ?? null)
    } catch {
      if (reqId === requestIdRef.current) setRecords([])
    } finally {
      if (reqId === requestIdRef.current) setLoading(false)
    }
  }, [buildRecordFilters, perPage])

  // Filter params shared by the absent fetch and its export.
  const buildAbsentFilters = useCallback(() => {
    const params = {}
    if (absentDate)           params.date            = absentDate
    if (departmentIds.length) params.department_ids  = departmentIds.join(',')
    if (sectionIds.length)    params.section_ids     = sectionIds.join(',')
    if (userIds.length)       params.user_ids        = userIds.join(',')
    if (search.trim())        params.search          = search.trim()
    return { ...params, ...sortParams(absentSort) }
  }, [absentDate, departmentIds, sectionIds, userIds, search, absentSort])

  const absentReqRef = useRef(0)
  const fetchAbsent = useCallback(async (targetPage) => {
    const reqId = ++absentReqRef.current
    setAbsentLoading(true)
    setAbsentError('')
    try {
      const params = { ...buildAbsentFilters(), page: targetPage, per_page: perPage }
      const res = await api.get('/attendance/absent-today', { params })
      if (reqId !== absentReqRef.current) return
      const pag = res.data.employees
      setAbsentRows(pag?.data ?? [])
      setAbsentLastPage(pag?.last_page ?? 1)
      setAbsentTotal(pag?.total ?? 0)
      setResolvedDate(res.data.date ?? '')
      setAbsentWorkingDay(res.data.working_day ?? true)
    } catch (err) {
      if (reqId === absentReqRef.current) {
        setAbsentRows([]); setAbsentTotal(0); setAbsentLastPage(1)
        setAbsentError(readApiError(err))
      }
    } finally {
      if (reqId === absentReqRef.current) setAbsentLoading(false)
    }
  }, [buildAbsentFilters, perPage])

  // Filter params shared by the approved-leave fetch and its export.
  const buildLeaveFilters = useCallback(() => {
    const params = {}
    if (leaveDate)            params.date            = leaveDate
    if (departmentIds.length) params.department_ids  = departmentIds.join(',')
    if (sectionIds.length)    params.section_ids     = sectionIds.join(',')
    if (userIds.length)       params.user_ids        = userIds.join(',')
    if (search.trim())        params.search          = search.trim()
    return { ...params, ...sortParams(leaveSort) }
  }, [leaveDate, departmentIds, sectionIds, userIds, search, leaveSort])

  const leaveReqRef = useRef(0)
  const fetchLeave = useCallback(async (targetPage) => {
    const reqId = ++leaveReqRef.current
    setLeaveLoading(true)
    setLeaveError('')
    try {
      const params = { ...buildLeaveFilters(), page: targetPage, per_page: perPage }
      const res = await api.get('/attendance/approved-leave-users', { params })
      if (reqId !== leaveReqRef.current) return
      const pag = res.data.users
      setLeaveRows(pag?.data ?? [])
      setLeaveLastPage(pag?.last_page ?? 1)
      setLeaveTotal(pag?.total ?? 0)
      setLeaveResolvedDate(res.data.date ?? '')
      setLeaveWorkingDay(res.data.working_day ?? true)
    } catch (err) {
      if (reqId === leaveReqRef.current) {
        setLeaveRows([]); setLeaveTotal(0); setLeaveLastPage(1)
        setLeaveError(readApiError(err))
      }
    } finally {
      if (reqId === leaveReqRef.current) setLeaveLoading(false)
    }
  }, [buildLeaveFilters, perPage])

  // Reset to page 1 when records filters change, then fetch (skip when range is invalid)
  useEffect(() => {
    if (view !== 'records') return
    if (dateRangeInvalid) {
      requestIdRef.current++ // invalidate any in-flight request
      setRecords([]); setTotal(0); setLastPage(1); setLoading(false)
      return
    }
    setPage(1)
    fetchRecords(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, monthValue, departmentIds, sectionIds, userIds, search,
      type, missingCheckout, isCorrected, whMin, whMax, sort, perPage,
      dateRangeInvalid, view])

  // The selected sections only belong to the selected departments — clear them
  // whenever the departments change so we never send an orphan section_id (422).
  useEffect(() => { setSectionIds([]) }, [departmentIds])

  // Fetch records when page changes (without resetting)
  useEffect(() => { if (view === 'records' && !dateRangeInvalid) fetchRecords(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when the absent filters change, then fetch
  useEffect(() => {
    if (!isAbsent) return
    setAbsentPage(1)
    fetchAbsent(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absentDate, departmentIds, sectionIds, userIds, search, absentSort, perPage, view])

  // Fetch absentees when page changes (without resetting)
  useEffect(() => { if (isAbsent) fetchAbsent(absentPage) }, [absentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when the approved-leave filters change, then fetch
  useEffect(() => {
    if (!isLeave) return
    setLeavePage(1)
    fetchLeave(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveDate, departmentIds, sectionIds, userIds, search, leaveSort, perPage, view])

  // Fetch approved-leave users when page changes (without resetting)
  useEffect(() => { if (isLeave) fetchLeave(leavePage) }, [leavePage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Topbar refresh button — refresh whichever tab is active
  useEffect(() => {
    const handler = () => {
      if (isAbsent) fetchAbsent(absentPage)
      else if (isLeave) fetchLeave(leavePage)
      else if (!dateRangeInvalid) fetchRecords(page)
    }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRecords, fetchAbsent, fetchLeave, page, absentPage, leavePage, dateRangeInvalid, isAbsent, isLeave])

  const hasFilters = Boolean(
    dateFrom || dateTo || monthValue || departmentIds.length || sectionIds.length ||
    userIds.length || search || type || missingCheckout || isCorrected ||
    whMin !== '' || whMax !== ''
  )
  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setMonthValue('')
    setDepartmentIds([]); setSectionIds([]); setUserIds([]); setSearch('')
    setType(''); setMissingCheckout(false); setIsCorrected(false)
    setWhMin(''); setWhMax('')
  }

  // Active-tab view-model so the table/empty/pagination blocks stay tab-agnostic.
  const activeLoading  = isAbsent ? absentLoading  : isLeave ? leaveLoading  : loading
  const activeRows     = isAbsent ? absentRows     : isLeave ? leaveRows     : records
  const activeTotal    = isAbsent ? absentTotal    : isLeave ? leaveTotal    : total
  const activeLastPage = isAbsent ? absentLastPage : isLeave ? leaveLastPage : lastPage
  const activePage     = isAbsent ? absentPage     : isLeave ? leavePage     : page
  const goToPage = (p) => (isAbsent ? setAbsentPage(p) : isLeave ? setLeavePage(p) : setPage(p))
  const activeWorkingDay = isAbsent ? absentWorkingDay : isLeave ? leaveWorkingDay : recordsWorkingDay

  const recordsEmptyMessage = dateRangeInvalid
    ? 'يرجى تصحيح نطاق التاريخ المحدد'
    : recordsWorkingDay === false
      ? 'هذا اليوم يوم عطلة (غير يوم عمل) — لا يُتوقع حضور'
      : hasFilters
        ? (noDateFilter ? 'لا توجد سجلات مطابقة لهذا الموظف اليوم' : 'لا توجد سجلات مطابقة لهذا البحث')
        : 'لا توجد سجلات حضور لهذا اليوم'
  const HOLIDAY_MESSAGE = 'هذا اليوم يوم عطلة (غير يوم عمل) — لا يُتوقع حضور'
  // The "في إجازة" tab ignores working_day: leave doesn't pause on weekends/
  // holidays, so a multi-day leave that spans an off-day must still render. Its
  // empty state is the normal "no one on leave", never the holiday state.
  const emptyMessage = isAbsent
    ? (absentError
        ? absentError
        : absentWorkingDay
          ? 'لا يوجد موظفون غائبون في هذا اليوم'
          : HOLIDAY_MESSAGE)
    : isLeave
      ? (leaveError ? leaveError : 'لا يوجد موظفون في إجازة معتمدة في هذا اليوم')
      : recordsEmptyMessage

  const tabCountLabel = isAbsent
    ? `${activeTotal} غائباً`
    : isLeave
      ? `${activeTotal} في إجازة`
      : `${activeTotal} سجلاً`

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
            { key: 'leave',   label: 'في إجازة',       icon: Plane },
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
              {tabCountLabel}
            </span>
            {isAbsent ? (
              resolvedDate && (
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>ليوم {formatDate(resolvedDate)}</span>
              )
            ) : isLeave ? (
              leaveResolvedDate && (
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>ليوم {formatDate(leaveResolvedDate)}</span>
              )
            ) : (
              noDateFilter && (
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  يُعرض حضور اليوم — حدّد تاريخاً لعرض سجلات أخرى
                </span>
              )
            )}
          </div>

          <div style={{ flex: 1 }} />

          {isAbsent ? (
            <SingleDateFilters
              hasFullAccess={hasFullAccess} departments={departments}
              departmentIds={departmentIds} setDepartmentIds={setDepartmentIds}
              sections={sections} sectionIds={sectionIds} setSectionIds={setSectionIds}
              employees={employees} userIds={userIds} setUserIds={setUserIds}
              search={search} setSearch={setSearch}
              date={absentDate} setDate={setAbsentDate}
            />
          ) : isLeave ? (
            <SingleDateFilters
              hasFullAccess={hasFullAccess} departments={departments}
              departmentIds={departmentIds} setDepartmentIds={setDepartmentIds}
              sections={sections} sectionIds={sectionIds} setSectionIds={setSectionIds}
              employees={employees} userIds={userIds} setUserIds={setUserIds}
              search={search} setSearch={setSearch}
              date={leaveDate} setDate={setLeaveDate}
            />
          ) : (
            <>
              {/* Name/email search */}
              <SearchInput value={search} onChange={setSearch} />

              {/* Department filter — only meaningful for admin / can_view_attendance users */}
              {hasFullAccess && (
                <MultiSelect
                  icon={Building2} label="الإدارة" options={departments}
                  values={departmentIds} onChange={setDepartmentIds}
                />
              )}

              {/* Section filter — dependent on the chosen departments for
                  full-access users; managers/chiefs get their own dept's
                  sections without a department picker */}
              <MultiSelect
                icon={Layers} label="القسم" options={sections}
                values={sectionIds} onChange={setSectionIds}
                disabled={hasFullAccess && !departmentIds.length} disabledTitle="اختر الإدارة أولاً"
              />

              {/* Employee filter (admin users list) */}
              {employees.length > 0 && (
                <MultiSelect
                  icon={UserIcon} label="الموظف" options={employees}
                  values={userIds} onChange={setUserIds}
                />
              )}

              {/* Event type */}
              <select
                value={type} onChange={e => setType(e.target.value)}
                style={{ ...deptSelectStyle, minWidth: 0, color: type ? 'var(--c-text)' : 'var(--c-text-2)' }}
              >
                <option value="">النوع: الكل</option>
                <option value="check_in">تسجيل دخول</option>
                <option value="check_out">تسجيل خروج</option>
              </select>

              {/* Date range */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input type="date" value={dateFrom} onChange={e => changeDateFrom(e.target.value)} style={dateInputStyle} />
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
                <input
                  type="date" value={dateTo} onChange={e => changeDateTo(e.target.value)}
                  style={{
                    ...dateInputStyle,
                    ...(dateRangeInvalid ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}),
                  }}
                />
              </div>

              {/* Calendar-month shorthand (cleared when a date range is set) */}
              <input
                type="month" value={monthValue} onChange={e => changeMonth(e.target.value)}
                title="عرض شهر كامل" style={dateInputStyle}
              />

              {/* Boolean filters */}
              <ToggleChip
                label="خروج غير مسجّل" icon={AlertTriangle}
                active={missingCheckout} onChange={setMissingCheckout}
                title="سجلات الدخول التي أُغلقت تلقائياً بدون انصراف"
              />
              <ToggleChip
                label="سجلات مصحّحة" icon={ShieldCheck}
                active={isCorrected} onChange={setIsCorrected}
                title="سجلات الانصراف التي أنشأها مشرف تصحيحاً"
              />

              {/* Work-hours bounds (check-out rows) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input
                  type="number" min="0" step="0.5" value={whMin} placeholder="ساعات ≥"
                  onChange={e => setWhMin(e.target.value)}
                  style={{ ...dateInputStyle, width: 82, cursor: 'text' }}
                />
                <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
                <input
                  type="number" min="0" step="0.5" value={whMax} placeholder="ساعات ≤"
                  onChange={e => setWhMax(e.target.value)}
                  style={{ ...dateInputStyle, width: 82, cursor: 'text' }}
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

          {/* Page size + Excel export of the active tab's exact query */}
          <PerPageSelect value={perPage} onChange={setPerPage} />
          {isAbsent ? (
            <ExportButton
              url="/attendance/absent-today" params={buildAbsentFilters()}
              filename="absent-today.xlsx"
            />
          ) : isLeave ? (
            <ExportButton
              url="/attendance/approved-leave-users" params={buildLeaveFilters()}
              filename="approved-leave-users.xlsx"
            />
          ) : (
            <ExportButton
              url="/attendance/records" params={buildRecordFilters()}
              filename="attendance-records.xlsx" disabled={dateRangeInvalid}
            />
          )}
        </div>

        {/* Table / Holiday Empty State — gated per tab: the leave tab never
            shows the holiday state (leave spans weekends), only records/absent. */}
        {!activeLoading && !isLeave && activeWorkingDay === false ? (
          <div style={{ padding: '56px 24px', textAlign: 'center' }}>
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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--c-surface)' }}>
                    {(isAbsent ? TABLE_COLS_ABSENT : isLeave ? TABLE_COLS_LEAVE : TABLE_COLS).map(col => (
                      <SortableTh
                        key={col.label} label={col.label} field={col.field}
                        sort={isAbsent ? absentSort : isLeave ? leaveSort : sort}
                        onSort={isAbsent ? setAbsentSort : isLeave ? setLeaveSort : setSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLoading
                    ? [0, 1, 2, 3, 4].map(i => (
                        <SkeletonRow key={i} cells={isAbsent ? SKELETON_CELLS_ABSENT : isLeave ? SKELETON_CELLS_LEAVE : SKELETON_CELLS} />
                      ))
                    : isAbsent
                      ? activeRows.map((u, idx) => <AbsentRow key={u.id} user={u} last={idx === activeRows.length - 1} onExcuse={employee => setExcuseTarget({ employee, date: resolvedDate || absentDate })} />)
                      : isLeave
                        ? activeRows.map((item, idx) => <LeaveRow key={item.id ?? idx} item={item} last={idx === activeRows.length - 1} />)
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
                  : isLeave
                    ? <Plane size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
                    : <Fingerprint size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />}
                <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>
                  {emptyMessage}
                </p>
              </div>
            )}
          </>
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
      {excuseTarget && (
        <ExcuseLeaveModal employee={excuseTarget.employee} date={excuseTarget.date}
          onClose={() => setExcuseTarget(null)} onSubmitted={() => fetchAbsent(absentPage)} />
      )}
    </div>
  )
}
