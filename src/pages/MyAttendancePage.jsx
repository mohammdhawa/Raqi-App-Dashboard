import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  LogIn, LogOut, MapPin, MapPinOff, RotateCw, Clock, History, Loader2, CalendarOff,
  CheckCircle2, AlertTriangle, Fingerprint, ShieldAlert, Camera, ServerCrash,
} from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import SelfieCaptureModal from '../components/attendance/SelfieCaptureModal'
import {
  damascusToday, formatTime, readDayStatus, checkoutWaitMs, formatCountdown,
  getPosition, submitAttendance, readAttendanceError, watchGeoPermission,
  isBlockedByPermissionsPolicy, MIN_CHECKOUT_GAP_MINUTES, isSecureContextOk,
} from '../utils/attendanceCapture'
import { getLeaveStart, getLeaveEnd, leaveTypeLabel, getLeaveType } from '../utils/leave'

// Laravel paginators arrive under different wrapper keys depending on the
// resource; read the common ones and fall back to a flat array.
function pickRows(data, keys) {
  for (const k of keys) {
    const v = data?.[k]
    if (Array.isArray(v)) return v
    if (Array.isArray(v?.data)) return v.data
  }
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data)) return data
  return []
}

const TYPE_META = {
  check_in:  { label: 'تسجيل حضور',  icon: LogIn,  color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  check_out: { label: 'تسجيل انصراف', icon: LogOut, color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
}

// ── Status card ─────────────────────────────────────────────────────────────

const STATUS_VIEWS = {
  check_in: {
    title: 'أنت الآن في العمل',
    sub: 'تم تسجيل حضورك لهذا اليوم. لا تنسَ تسجيل الانصراف عند انتهاء الدوام.',
    color: 'var(--c-approved)', bg: 'var(--c-approved-bg)', icon: CheckCircle2,
  },
  check_out: {
    title: 'أنت الآن خارج العمل',
    sub: 'اكتمل دوامك لهذا اليوم.',
    color: 'var(--c-text-2)', bg: 'var(--c-surface-2)', icon: LogOut,
  },
  none: {
    title: 'لم تُسجّل أي حضور بعد',
    sub: 'سجّل حضورك لبدء دوام اليوم.',
    color: 'var(--c-pending)', bg: 'var(--c-pending-bg)', icon: AlertTriangle,
  },
}

function StatusCard({ status, loading }) {
  if (loading) {
    return (
      <div style={{
        height: 96, borderRadius: 16, marginBottom: 16,
        background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite',
      }} />
    )
  }
  const key = status.hasCheckOut ? 'check_out' : status.lastCheckIn ? 'check_in' : 'none'
  const v = STATUS_VIEWS[key]
  const Icon = v.icon
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
      padding: '18px 20px', borderRadius: 16,
      background: '#fff', border: '1px solid var(--c-border)', boxShadow: 'var(--sh-card)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: v.bg, color: v.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={23} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: v.color }}>{v.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', marginTop: 3, lineHeight: 1.6 }}>{v.sub}</div>
      </div>
    </div>
  )
}

// ── Notice strip ────────────────────────────────────────────────────────────

function Notice({ icon: Icon, tone = 'warn', children }) {
  const tones = {
    warn:   { bg: 'var(--c-pending-bg)',  color: '#8A6A23',            border: 'var(--c-accent-soft)' },
    error:  { bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',  border: 'rgba(192,57,43,0.22)' },
    info:   { bg: 'var(--c-primary-light)', color: 'var(--c-primary)', border: 'rgba(34,65,103,0.16)' },
  }
  const t = tones[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14,
      padding: '12px 14px', borderRadius: 12,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color,
    }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.7, minWidth: 0 }}>{children}</div>
    </div>
  )
}

// ── Location permission recovery ────────────────────────────────────────────

// Once an origin is blocked the browser never prompts again, and there is no
// API that can re-open the dialog — the only route back is the site-settings
// panel. Telling someone to "enable it in settings" is useless on a phone, so
// spell out the exact taps per browser family and detect which one they're on.
function detectBrowserFamily() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // Every iOS browser is WebKit underneath, so the recovery path is Safari's
  // regardless of which one is installed.
  if (isIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

const PERMISSION_STEPS = {
  android: [
    'اضغط على الأيقونة يسار عنوان الموقع في شريط المتصفح.',
    'اختر «الأذونات» أو «إعدادات الموقع».',
    'اضبط «الموقع الجغرافي» على «السماح».',
    'تأكد أيضاً من تفعيل خدمة الموقع (GPS) في إعدادات الهاتف، ومن السماح للمتصفح باستخدام الموقع.',
  ],
  ios: [
    'اضغط على أيقونة «ﺃﺍ» يسار شريط العنوان.',
    'اختر «إعدادات الموقع الإلكتروني».',
    'اضبط «الموقع الجغرافي» على «السماح».',
    'تأكد أيضاً من تفعيل خدمات الموقع للمتصفح من: الإعدادات ← الخصوصية ← خدمات الموقع.',
  ],
  desktop: [
    'اضغط على أيقونة القفل بجانب عنوان الموقع.',
    'اختر «إعدادات الموقع» أو «الأذونات».',
    'اضبط «الموقع الجغرافي» على «السماح».',
    'أعد تحميل الصفحة بعد التغيير.',
  ],
}

// Disabled by a `Permissions-Policy` response header. Nothing the employee can
// do — so this says so plainly and gives IT the exact header to change, rather
// than sending people into settings that will never help.
function ServerPolicyPanel({ features }) {
  return (
    <div style={{
      marginBottom: 16, padding: '16px 18px', borderRadius: 14,
      background: 'var(--c-rejected-bg)', border: '1px solid rgba(192,57,43,0.22)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10,
        color: 'var(--c-rejected)', fontSize: 14, fontWeight: 800,
      }}>
        <ServerCrash size={17} style={{ flexShrink: 0 }} />
        {features.join(' و')} معطّل على مستوى الخادم
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.9 }}>
        إعدادات المتصفح لن تحلّ هذه المشكلة — الخادم يرسل ترويسة
        {' '}<code style={{
          fontFamily: 'monospace', fontSize: 11.5, direction: 'ltr', display: 'inline-block',
          background: 'var(--c-surface-2)', borderRadius: 5, padding: '1px 5px',
        }}>Permissions-Policy</code>{' '}
        تمنع استخدام الموقع والكاميرا في هذه الصفحة.
        <br />
        يرجى إبلاغ قسم تقنية المعلومات لتعديل الترويسة والسماح لنطاق الموقع نفسه.
      </p>
    </div>
  )
}

function LocationBlockedPanel({ onRetry }) {
  const steps = PERMISSION_STEPS[detectBrowserFamily()]
  return (
    <div style={{
      marginBottom: 16, padding: '16px 18px', borderRadius: 14,
      background: 'var(--c-rejected-bg)', border: '1px solid rgba(192,57,43,0.22)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10,
        color: 'var(--c-rejected)', fontSize: 14, fontWeight: 800,
      }}>
        <MapPinOff size={17} style={{ flexShrink: 0 }} />
        إذن الموقع محظور لهذا الموقع
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
        لهذا لم يظهر لك طلب السماح بالموقع. لتفعيله:
      </p>
      <ol style={{ margin: '0 0 14px', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ fontSize: 12.5, color: 'var(--c-text)', lineHeight: 1.7 }}>{step}</li>
        ))}
      </ol>
      <button
        onClick={onRetry}
        style={{
          height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
          background: 'var(--c-rejected)', color: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        }}
      >
        <RotateCw size={14} />
        تحققت من الإعداد — أعد المحاولة
      </button>
    </div>
  )
}

// ── Today's record tile ─────────────────────────────────────────────────────

function RecordTile({ record, last }) {
  const meta = TYPE_META[record.type]
  const Icon = meta?.icon ?? Fingerprint
  const hours = record.work_hours
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
      borderBottom: last ? 'none' : '1px solid var(--c-border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: meta?.bg ?? 'var(--c-surface-2)', color: meta?.color ?? 'var(--c-text-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>
          {meta?.label ?? record.type}
        </div>
        {hours != null && record.type === 'check_out' && (
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>
            ساعات العمل: {hours}
          </div>
        )}
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

export default function MyAttendancePage() {
  const { user, canViewAttendance } = useAuth()
  const toast = useToast()

  const [dateKey] = useState(() => damascusToday())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [leaveToday, setLeaveToday] = useState(null)

  // 'idle' | 'locating' — the capture modal owns the rest of the flow.
  const [phase, setPhase] = useState('idle')
  const [pending, setPending] = useState(null) // { type, position }
  const [actionError, setActionError] = useState('')

  const [now, setNow] = useState(() => Date.now())

  // 'granted' | 'prompt' | 'denied' | 'unknown' — read without prompting, so a
  // blocked origin is surfaced before the employee taps and hits a silent
  // rejection. `retryKey` re-runs the probe after they say they fixed it,
  // covering browsers that don't fire the permission `change` event.
  const [geoPermission, setGeoPermission] = useState('unknown')
  const [retryKey, setRetryKey] = useState(0)
  // Set when getCurrentPosition itself reports PERMISSION_DENIED — the only
  // signal available on browsers that don't implement navigator.permissions.
  const [geoDeniedByError, setGeoDeniedByError] = useState(false)

  const reqRef = useRef(0)

  const status = readDayStatus(records)
  const nextType = status.nextType
  const waitMs = nextType === 'check_out' ? checkoutWaitMs(status.lastCheckIn, now) : 0

  const fetchToday = useCallback(async () => {
    const reqId = ++reqRef.current
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.get('/attendance/my-records', { params: { date: dateKey } })
      if (reqId !== reqRef.current) return
      setRecords(pickRows(res.data, ['records']))
    } catch (err) {
      if (reqId !== reqRef.current) return
      setRecords([])
      setLoadError(readAttendanceError(err, 'تعذّر تحميل سجلات اليوم، حاول مرة أخرى.'))
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [dateKey])

  // Approved leave covering today. The endpoint filters by overlap, but the
  // range is re-checked locally so a looser server-side interpretation can't
  // grey out the button on a day the employee is actually expected in.
  const fetchLeave = useCallback(async () => {
    try {
      const res = await api.get('/attendance/leave-requests', {
        params: { statuses: 'approved', date_from: dateKey, date_to: dateKey },
      })
      const rows = pickRows(res.data, ['leave_requests', 'requests'])
      const covering = rows.find(item => {
        const start = getLeaveStart(item)
        const end = getLeaveEnd(item) ?? start
        return start && String(start).slice(0, 10) <= dateKey && dateKey <= String(end).slice(0, 10)
      })
      setLeaveToday(covering ?? null)
    } catch {
      // Non-fatal: the leave banner is advisory, the server enforces the rule.
      setLeaveToday(null)
    }
  }, [dateKey])

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { fetchToday(); fetchLeave() }, 0)
    return () => window.clearTimeout(initialFetch)
  }, [fetchToday, fetchLeave])

  useEffect(() => watchGeoPermission(setGeoPermission), [retryKey])

  // Tick only while a countdown is actually on screen.
  useEffect(() => {
    if (waitMs <= 0) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [waitMs])

  useEffect(() => {
    const handler = () => { fetchToday(); fetchLeave() }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchToday, fetchLeave])

  // ── Pre-flight gates ──────────────────────────────────────────────────────
  // Mirrors the app's client-side checks so a doomed round-trip (and a wasted
  // selfie) is avoided. The server still has the final say on all of them.
  let blockedReason = null
  if (!isSecureContextOk()) {
    blockedReason = 'تسجيل الحضور يتطلب فتح النظام عبر اتصال آمن (HTTPS). راجع قسم تقنية المعلومات.'
  } else if (nextType === null) {
    blockedReason = 'لقد أكملت دوام اليوم — لا يمكن تسجيل حضور آخر في نفس اليوم.'
  } else if (nextType === 'check_in' && leaveToday) {
    // Only blocks a *new* shift: someone already checked in must still be able
    // to close their day, whatever leave was approved afterwards.
    blockedReason = 'لديك إجازة معتمدة اليوم — لا حاجة لتسجيل الحضور.'
  } else if (waitMs > 0) {
    blockedReason = `يمكنك تسجيل الانصراف بعد ${formatCountdown(waitMs)} (الحد الأدنى ${MIN_CHECKOUT_GAP_MINUTES} دقيقة من وقت الحضور).`
  }

  // A blocked origin can't be un-blocked from JS, so this drives the recovery
  // panel rather than disabling the button — tapping it again is how the user
  // confirms they fixed the setting on browsers with no `change` event.
  const geoBlocked = geoPermission === 'denied' || geoDeniedByError

  // A Permissions-Policy header looks identical to a user denial from JS, but
  // has the opposite fix, so it's checked first and wins. Both features are
  // reported together: the camera is disabled by the same header and would fail
  // one step later, and sending someone to IT twice is one time too many.
  const policyBlocked = [
    isBlockedByPermissionsPolicy('geolocation') && 'الموقع',
    isBlockedByPermissionsPolicy('camera') && 'الكاميرا',
  ].filter(Boolean)

  const disabled = loading || Boolean(blockedReason) || phase !== 'idle'

  // ── Capture flow ──────────────────────────────────────────────────────────
  // GPS first, then the camera — same order as the app, and it keeps the two
  // permission prompts from stacking on top of each other.
  const startCapture = async () => {
    if (disabled || !nextType) return
    setActionError('')
    setPhase('locating')
    try {
      const position = await getPosition()
      setGeoDeniedByError(false)
      setPending({ type: nextType, position })
    } catch (err) {
      // code 1 = PERMISSION_DENIED → the recovery panel, not a toast-style error.
      if (err?.code === 1) setGeoDeniedByError(true)
      setActionError(err?.message ?? 'تعذّر تحديد موقعك الحالي.')
    } finally {
      setPhase('idle')
    }
  }

  // Throws on failure so the modal can show the message and offer a retry
  // without losing the shot the employee already took.
  const submit = async (selfie) => {
    if (!pending) return
    try {
      await submitAttendance({
        type: pending.type,
        latitude: pending.position.latitude,
        longitude: pending.position.longitude,
        recordedAt: new Date().toISOString(),
        selfie,
      })
    } catch (err) {
      throw new Error(readAttendanceError(err), { cause: err })
    }
    setPending(null)
    toast.success(pending.type === 'check_in' ? 'تم تسجيل حضورك بنجاح' : 'تم تسجيل انصرافك بنجاح')
    fetchToday()
  }

  const actionMeta = nextType ? TYPE_META[nextType] : null
  const ActionIcon = actionMeta?.icon ?? Fingerprint

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 620, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        marginBottom: 22, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
            تسجيل الحضور
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            {user?.name ? `${user.name} — ` : ''}سجّل حضورك وانصرافك من المتصفح عند تعذّر استخدام التطبيق.
          </p>
        </div>
        {canViewAttendance && (
          <Link
            to="/attendance/history"
            style={{
              height: 38, padding: '0 14px', borderRadius: 10, flexShrink: 0,
              background: '#fff', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
              fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}
          >
            <History size={15} />
            سجلّي
          </Link>
        )}
      </div>

      <StatusCard status={status} loading={loading} />

      {/* Approved leave today */}
      {leaveToday && (
        <Notice icon={CalendarOff} tone="info">
          لديك إجازة معتمدة اليوم
          {getLeaveType(leaveToday) ? ` (${leaveTypeLabel(getLeaveType(leaveToday))})` : ''}.
        </Notice>
      )}

      {/* Blocked / errors */}
      {!loading && blockedReason && (
        <Notice icon={ShieldAlert} tone="warn">{blockedReason}</Notice>
      )}
      {loadError && <Notice icon={AlertTriangle} tone="error">{loadError}</Notice>}

      {/* A blocked origin never prompts again, so the recovery steps replace the
          one-line error rather than sitting next to it. Server policy wins over
          the browser-settings panel — its instructions would be a dead end. */}
      {policyBlocked.length > 0 ? (
        <ServerPolicyPanel features={policyBlocked} />
      ) : geoBlocked ? (
        <LocationBlockedPanel
          onRetry={() => {
            setActionError('')
            setGeoDeniedByError(false)
            setRetryKey(k => k + 1) // re-probe navigator.permissions
          }}
        />
      ) : (
        actionError && <Notice icon={AlertTriangle} tone="error">{actionError}</Notice>
      )}

      {/* Action button */}
      <button
        onClick={startCapture} disabled={disabled}
        style={{
          width: '100%', height: 72, borderRadius: 18, border: 'none', marginBottom: 22,
          background: disabled
            ? 'var(--c-surface-2)'
            : nextType === 'check_out' ? 'var(--c-rejected)' : 'var(--c-approved)',
          color: disabled ? 'var(--c-text-3)' : '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          cursor: disabled ? 'default' : 'pointer',
          boxShadow: disabled ? 'none' : 'var(--sh-card-lg)',
          transition: 'background .15s, box-shadow .15s',
        }}
      >
        {phase === 'locating' ? (
          <>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            جارٍ تحديد الموقع…
          </>
        ) : loading ? (
          <>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            جارٍ التحميل…
          </>
        ) : (
          <>
            <ActionIcon size={20} />
            {actionMeta?.label ?? 'اكتمل دوام اليوم'}
          </>
        )}
      </button>

      {/* Set expectations before the prompts fire. Dismissing the dialog is what
          gets an origin permanently blocked, so when we know a prompt is coming
          the copy asks for «السماح» outright instead of just listing needs. */}
      {!disabled && !geoBlocked && policyBlocked.length === 0 && (
        <div style={{
          marginTop: -12, marginBottom: 22, textAlign: 'center',
          fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600, lineHeight: 1.8,
        }}>
          {geoPermission === 'prompt' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
              <MapPin size={12} />
              سيطلب المتصفح إذن الموقع ثم الكاميرا — اضغط «السماح» في كل مرة
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={12} /> يتطلب إذن الموقع
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Camera size={12} /> يتطلب إذن الكاميرا
              </span>
            </span>
          )}
        </div>
      )}

      {/* Today's records */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>
        <div style={{
          padding: '13px 18px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Clock size={15} style={{ color: 'var(--c-text-3)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)' }}>سجلات اليوم</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {dateKey}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                height: 36, borderRadius: 10, background: 'var(--c-surface-2)',
                animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s`,
              }} />
            ))}
          </div>
        ) : status.ordered.length === 0 ? (
          <div style={{ padding: '42px 20px', textAlign: 'center' }}>
            <Fingerprint size={30} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
              لا توجد سجلات حضور لهذا اليوم بعد
            </p>
          </div>
        ) : (
          status.ordered.map((r, idx) => (
            <RecordTile key={r.id ?? idx} record={r} last={idx === status.ordered.length - 1} />
          ))
        )}
      </div>

      {pending && (
        <SelfieCaptureModal
          title={pending.type === 'check_in' ? 'صورة تسجيل الحضور' : 'صورة تسجيل الانصراف'}
          hint={`تم تحديد الموقع بدقة ${Math.round(pending.position.accuracy ?? 0)} متر`}
          onCancel={() => setPending(null)}
          onConfirm={submit}
        />
      )}
    </div>
  )
}
