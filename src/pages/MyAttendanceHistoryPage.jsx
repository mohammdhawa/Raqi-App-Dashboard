import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  LogIn, LogOut, MapPin, Calendar, X, Fingerprint, ArrowRight,
  ImageOff, AlertTriangle, ShieldAlert,
} from 'lucide-react'
import api from '../services/api'
import {
  damascusToday, formatTime, formatDate, parseApiDate, readAttendanceError, ATT_TZ,
} from '../utils/attendanceCapture'

function pickPage(data, keys) {
  for (const k of keys) {
    const v = data?.[k]
    if (v && Array.isArray(v.data)) return v
  }
  if (data && Array.isArray(data.data)) return data
  if (Array.isArray(data)) return { data, current_page: 1, last_page: 1, total: data.length }
  return { data: [], current_page: 1, last_page: 1, total: 0 }
}

const TYPE_META = {
  check_in:  { label: 'تسجيل حضور',  icon: LogIn,  color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  check_out: { label: 'تسجيل انصراف', icon: LogOut, color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
}

const dateInputStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

/** YYYY-MM-DD bucket key in Damascus time, so a record never lands on the
 *  viewer's local day instead of the day it was actually recorded. */
function dayKey(value) {
  const d = parseApiDate(value)
  if (!d) return 'unknown'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function groupByDay(records) {
  const groups = []
  const index = new Map()
  for (const r of records) {
    const key = dayKey(r.recorded_at)
    if (!index.has(key)) {
      const group = { key, records: [] }
      index.set(key, group)
      groups.push(group)
    }
    index.get(key).records.push(r)
  }
  return groups
}

function dayHeading(key, today, yesterday) {
  if (key === today) return 'اليوم'
  if (key === yesterday) return 'أمس'
  return formatDate(key)
}

// ── Selfie thumbnail ────────────────────────────────────────────────────────

function SelfieThumb({ url }) {
  const [failed, setFailed] = useState(false)
  const box = {
    width: 42, height: 42, borderRadius: 11, flexShrink: 0, overflow: 'hidden',
    background: 'var(--c-surface-2)', color: 'var(--c-text-3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  if (!url || failed) {
    return <div style={box}><ImageOff size={16} /></div>
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={box} title="عرض الصورة">
      <img
        src={url} alt="صورة التسجيل" onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </a>
  )
}

function RecordRow({ record, last }) {
  const meta = TYPE_META[record.type]
  const Icon = meta?.icon ?? Fingerprint
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
      borderBottom: last ? 'none' : '1px solid var(--c-border)',
    }}>
      <SelfieThumb url={record.selfie_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 700, color: meta?.color ?? 'var(--c-text)',
        }}>
          <Icon size={13} />
          {meta?.label ?? record.type}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 3 }}>
          {record.type === 'check_out' && record.work_hours != null
            ? `ساعات العمل: ${record.work_hours}`
            : record.type === 'check_in' && record.missing_checkout
              ? 'بدون انصراف'
              : formatDate(record.recorded_at)}
        </div>
      </div>
      {record.latitude != null && record.longitude != null && (
        <a
          href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
          target="_blank" rel="noopener noreferrer" title="عرض الموقع"
          style={{ color: 'var(--c-text-3)', display: 'inline-flex', flexShrink: 0 }}
        >
          <MapPin size={14} />
        </a>
      )}
      <div style={{
        fontSize: 13, fontWeight: 800, color: 'var(--c-text)',
        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}>
        {formatTime(record.recorded_at)}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MyAttendanceHistoryPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const reqRef = useRef(0)

  const [{ today, yesterday }] = useState(() => {
    const now = new Date()
    const previousDay = new Date(now)
    previousDay.setDate(previousDay.getDate() - 1)
    return { today: damascusToday(now), yesterday: damascusToday(previousDay) }
  })
  const rangeInvalid = Boolean(from && to && to < from)

  const fetchRecords = useCallback(async (targetPage) => {
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    setForbidden(false)
    try {
      const params = { page: targetPage }
      if (from) params.from = from
      if (to) params.to = to
      const res = await api.get('/attendance/my-records', { params })
      if (reqId !== reqRef.current) return
      const pag = pickPage(res.data, ['records'])
      setRecords(pag.data ?? [])
      setLastPage(pag.last_page ?? 1)
      setTotal(pag.total ?? (pag.data?.length ?? 0))
    } catch (err) {
      if (reqId !== reqRef.current) return
      setRecords([]); setTotal(0); setLastPage(1)
      if (err?.response?.status === 403) setForbidden(true)
      else setError(readAttendanceError(err, 'تعذّر تحميل سجلاتك، حاول مرة أخرى.'))
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [from, to])

  // Fetch whenever the page or range changes. Input handlers reset the page,
  // which keeps this effect single-purpose and avoids duplicate requests.
  useEffect(() => {
    const fetchTimer = window.setTimeout(() => {
      if (rangeInvalid) {
        reqRef.current++ // invalidate any in-flight request
        setRecords([]); setTotal(0); setLastPage(1); setLoading(false)
        return
      }
      fetchRecords(page)
    }, 0)
    return () => window.clearTimeout(fetchTimer)
  }, [fetchRecords, page, rangeInvalid])

  useEffect(() => {
    const handler = () => { if (!rangeInvalid) fetchRecords(page) }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchRecords, page, rangeInvalid])

  const groups = groupByDay(records)
  const hasRange = Boolean(from || to)

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 620, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        marginBottom: 20, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
            سجل حضوري
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            جميع عمليات تسجيل الحضور والانصراف الخاصة بك.
          </p>
        </div>
        <Link
          to="/attendance"
          style={{
            height: 38, padding: '0 14px', borderRadius: 10, flexShrink: 0,
            background: '#fff', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
            fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}
        >
          <ArrowRight size={15} />
          تسجيل الحضور
        </Link>
      </div>

      {/* Card */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Filter bar */}
        <div style={{
          padding: '13px 18px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
            background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
          }}>
            {total} سجلاً
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input type="date" value={from} max={today} onChange={e => { setPage(1); setFrom(e.target.value) }} style={dateInputStyle} />
            <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
            <input
              type="date" value={to} max={today} onChange={e => { setPage(1); setTo(e.target.value) }}
              style={{
                ...dateInputStyle,
                ...(rangeInvalid ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}),
              }}
            />
          </div>
          {hasRange && (
            <button
              onClick={() => { setPage(1); setFrom(''); setTo('') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 12px', borderRadius: 10,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                color: 'var(--c-text-2)', cursor: 'pointer',
              }}
            >
              <X size={13} />
              مسح
            </button>
          )}
        </div>

        {rangeInvalid && (
          <div style={{
            padding: '12px 18px', fontSize: 12, fontWeight: 700, color: 'var(--c-rejected)',
            background: 'var(--c-rejected-bg)',
          }}>
            تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                height: 42, borderRadius: 11, background: 'var(--c-surface-2)',
                animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s`,
              }} />
            ))}
          </div>
        ) : forbidden ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <ShieldAlert size={30} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>غير مصرح</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
              ليس لديك صلاحية عرض سجلات الحضور. راجع الموارد البشرية.
            </p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <AlertTriangle size={30} style={{ color: 'var(--c-rejected)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--c-text-2)' }}>{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Fingerprint size={30} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
              {hasRange ? 'لا توجد سجلات في هذه الفترة' : 'لا توجد سجلات حضور بعد'}
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.key}>
              <div style={{
                padding: '9px 18px', background: 'var(--c-surface)',
                borderBottom: '1px solid var(--c-border)',
                fontSize: 11.5, fontWeight: 800, color: 'var(--c-text-2)',
              }}>
                {dayHeading(group.key, today, yesterday)}
              </div>
              {group.records.map((r, idx) => (
                <RecordRow key={r.id ?? idx} record={r} last={idx === group.records.length - 1} />
              ))}
            </div>
          ))
        )}

        {/* Pagination */}
        {lastPage > 1 && !loading && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{
                height: 34, padding: '0 14px', borderRadius: 9,
                border: '1px solid var(--c-border)', background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
                color: page <= 1 ? 'var(--c-text-3)' : 'var(--c-text-2)',
                cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              السابق
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>
              {page} / {lastPage}
            </span>
            <button
              onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
              style={{
                height: 34, padding: '0 14px', borderRadius: 9,
                border: '1px solid var(--c-border)', background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
                color: page >= lastPage ? 'var(--c-text-3)' : 'var(--c-text-2)',
                cursor: page >= lastPage ? 'default' : 'pointer', opacity: page >= lastPage ? 0.5 : 1,
              }}
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
