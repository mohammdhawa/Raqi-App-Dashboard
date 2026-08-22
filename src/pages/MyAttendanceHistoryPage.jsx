import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  LogIn, LogOut, MapPin, Calendar, X, Fingerprint, ArrowRight,
  ImageOff, AlertTriangle, ShieldAlert, ShieldX, Clock,
} from 'lucide-react'
import api from '../services/api'
import {
  damascusToday, formatTime, formatDate, parseApiDate, readAttendanceError,
  readRejectionMessage, ATT_TZ,
} from '../utils/attendanceCapture'
import { isRejected, readRejection, REJECTION_COPY } from '../utils/attendanceRejection'
import { ToggleChip } from '../components/attendance/controls'

/** A `Y-m-d` query param, or '' — never trust a URL into a date input. */
function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : ''
}

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

/**
 * The day's counted work hours, refused rows excluded.
 *
 * The backend counts none of a refused event — refusing a check-in refuses that
 * day's check-out with it — so summing every row here would show the employee
 * hours no report will ever agree with.
 */
function countedHours(records) {
  const total = records
    .filter(r => !isRejected(r) && r.type === 'check_out' && r.work_hours != null)
    .reduce((sum, r) => sum + Number(r.work_hours), 0)
  if (!total) return null
  const mins = Math.round(total * 60)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
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
  // A refused attempt still belongs in the history — the employee was notified
  // about it and has to be able to find it — but it must never look like a
  // record that stands, so it loses the type's colour and is struck through.
  const rejected = isRejected(record)
  const rejection = rejected ? readRejection(record) : null
  const Icon = rejected ? ShieldX : (meta?.icon ?? Fingerprint)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px',
      borderBottom: last ? 'none' : '1px solid var(--c-border)',
      background: rejected ? 'rgba(192,57,43,0.04)' : 'transparent',
    }}>
      <SelfieThumb url={record.selfie_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 700,
            color: rejected ? 'var(--c-text-3)' : (meta?.color ?? 'var(--c-text)'),
            textDecoration: rejected ? 'line-through' : 'none',
          }}>
            <Icon size={13} />
            {meta?.label ?? record.type}
          </span>
          {rejected && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              fontSize: 10.5, fontWeight: 800, lineHeight: 1.5, whiteSpace: 'nowrap',
              color: 'var(--c-rejected)', background: 'var(--c-rejected-bg)',
              border: '1px solid rgba(192,57,43,0.22)',
            }}>
              {REJECTION_COPY.badge}
            </span>
          )}
        </div>
        {rejected ? (
          <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 3, lineHeight: 1.6 }}>
            {readRejectionMessage(record)}
            {rejection?.at && (
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--c-text-3)', marginTop: 2 }}>
                {REJECTION_COPY.badge} — {formatDate(rejection.at)}
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 3 }}>
            {record.type === 'check_out' && record.work_hours != null
              ? `ساعات العمل: ${record.work_hours_formatted ?? record.work_hours}`
              : record.type === 'check_in' && record.missing_checkout
                ? 'بدون انصراف'
                : formatDate(record.recorded_at)}
          </div>
        )}
      </div>
      {record.latitude != null && record.longitude != null && (
        <a
          href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
          target="_blank" rel="noopener noreferrer" title="عرض الموقع"
          style={{ color: 'var(--c-text-3)', display: 'inline-flex', flexShrink: 0, marginTop: 4 }}
        >
          <MapPin size={14} />
        </a>
      )}
      <div style={{
        fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 2,
        color: rejected ? 'var(--c-text-3)' : 'var(--c-text)',
        textDecoration: rejected ? 'line-through' : 'none',
        fontVariantNumeric: 'tabular-nums',
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
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)

  // The query string is the single source of truth for every filter, not just
  // the initial one. An `attendance_rejected` notification deep-links here with
  // ?from=&to= set to the refused day, and React Router keeps this page mounted
  // when only the query changes — so reading these into state once would leave a
  // second notification showing the first one's date. Deriving them also means
  // clearing the filters clears the URL instead of stranding a stale query.
  const [urlParams, setUrlParams] = useSearchParams()
  const from = isoDate(urlParams.get('from'))
  const to = isoDate(urlParams.get('to'))
  // /my-records takes `rejected` only — narrowing by ground is an HR filter.
  const rejectedOnly = urlParams.get('rejected') === '1'
  // Paginating with the filters keeps the whole view in one place; a deep link
  // carries no `page`, so it always lands on the first page of its day.
  const page = Math.max(1, Number(urlParams.get('page')) || 1)

  // Filters are replaced rather than pushed: `back` should leave the history,
  // not walk every filter the employee tried. Any change but paging returns to
  // page 1, since the old page number rarely exists in the new result set.
  const updateQuery = (changes, { resetPage = true } = {}) => {
    const next = new URLSearchParams(urlParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (resetPage) next.delete('page')
    setUrlParams(next, { replace: true })
  }

  const setPage = p => updateQuery({ page: p > 1 ? String(p) : '' }, { resetPage: false })

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
      if (rejectedOnly) params.rejected = 1
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
  }, [from, to, rejectedOnly])

  // Fetch whenever the page or the filters change — both now live in the query
  // string, so an in-app deep link to a different day re-runs this the same way
  // a filter edit does. `updateQuery` resets the page, which keeps this effect
  // single-purpose and avoids duplicate requests.
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
  const hasFilters = hasRange || rejectedOnly

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
            جميع عمليات تسجيل الحضور والانصراف الخاصة بك، بما فيها ما لم تُقبل تسجيله وسبب الرفض.
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
          <ToggleChip
            label={REJECTION_COPY.onlyRejected} icon={ShieldX}
            active={rejectedOnly} onChange={v => updateQuery({ rejected: v ? '1' : '' })}
            title="التسجيلات التي لم تُقبل — راجع سبب الرفض ثم أعد تسجيل يومها"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input type="date" value={from} max={today} onChange={e => updateQuery({ from: e.target.value })} style={dateInputStyle} />
            <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
            <input
              type="date" value={to} max={today} onChange={e => updateQuery({ to: e.target.value })}
              style={{
                ...dateInputStyle,
                ...(rangeInvalid ? { border: '1px solid var(--c-rejected)', color: 'var(--c-rejected)' } : {}),
              }}
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => updateQuery({ from: '', to: '', rejected: '' })}
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
              {rejectedOnly
                ? 'لا توجد تسجيلات مرفوضة'
                : hasRange ? 'لا توجد سجلات في هذه الفترة' : 'لا توجد سجلات حضور بعد'}
            </p>
          </div>
        ) : (
          groups.map(group => {
            const hours = countedHours(group.records)
            return (
            <div key={group.key}>
              <div style={{
                padding: '9px 18px', background: 'var(--c-surface)',
                borderBottom: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11.5, fontWeight: 800, color: 'var(--c-text-2)',
              }}>
                {dayHeading(group.key, today, yesterday)}
                {/* Refused rows are excluded — the server counts none of them,
                    so a total that included them would agree with no report. */}
                {hours && (
                  <span style={{
                    marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    <Clock size={11} />
                    {hours}
                  </span>
                )}
              </div>
              {group.records.map((r, idx) => (
                <RecordRow key={r.id ?? idx} record={r} last={idx === group.records.length - 1} />
              ))}
            </div>
            )
          })
        )}

        {/* Pagination */}
        {lastPage > 1 && !loading && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
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
              onClick={() => setPage(Math.min(lastPage, page + 1))} disabled={page >= lastPage}
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
