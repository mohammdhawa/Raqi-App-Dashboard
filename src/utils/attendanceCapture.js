// Browser-side equivalent of the mobile app's capture pipeline (geolocator +
// image_picker + the multipart upload). This is the fallback path employees use
// when the app misbehaves, so every failure mode gets its own Arabic message —
// a generic "حدث خطأ" here would just send people back to the app they already
// couldn't use.
//
// Deliberately *not* offline-first like the app: a browser tab has no durable
// queue we can trust across a refresh, so a record is either accepted by the
// server or reported as failed. Nothing is silently held.

import api from '../services/api'

// Single-timezone system (see AttendancePage) — "today" must be Damascus's
// today, not the viewer's, or someone browsing from another timezone would
// check in against the wrong day.
export const ATT_TZ = 'Asia/Damascus'

// Mirrors the backend's attendance.min_checkout_gap_minutes, same as the app's
// attendance_window.dart. Client-side only — the server still has final say.
export const MIN_CHECKOUT_GAP_MINUTES = 60

// ── Selfie compression — must stay identical to the mobile app ──────────────
// The app runs image_picker with maxWidth/maxHeight 1600 and imageQuality 85,
// then uploads the result without recompressing. Matching those numbers here
// keeps a web-recorded selfie indistinguishable from an app-recorded one:
//
//   • max 1600 × 1600 — the image is scaled to *fit inside* that box
//   • JPEG quality 85%
//   • aspect ratio preserved, never cropped, never upscaled
//   • no second encode pass between here and the upload
//
// There is no target file size; the output depends on image content.
export const MAX_SELFIE_EDGE = 1600
export const SELFIE_QUALITY = 0.85

// What we ask the camera for. It must exceed MAX_SELFIE_EDGE, otherwise the
// 1600 cap never binds and the selfie ends up smaller than the app's — the
// resize is where nearly all the size reduction comes from, so capturing below
// the cap loses facial detail without saving anything. Browsers treat this as
// ideal, so a camera that can't reach it just returns its best mode.
export const CAPTURE_REQUEST_EDGE = 1920

// ── Environment probes ──────────────────────────────────────────────────────

// getUserMedia and geolocation both exist on http:// origins but always reject
// there. Detect it up front so the user gets an actionable message instead of a
// permission error no browser setting can fix.
export function isSecureContextOk() {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

export function hasCameraApi() {
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export function hasGeolocationApi() {
  return Boolean(navigator.geolocation)
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** Today's date in Asia/Damascus as YYYY-MM-DD (en-CA formats ISO-style). */
export function damascusToday(base = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(base)
}

/** Parse an API timestamp ("2026-08-01 07:12:00" or ISO) into a Date, or null. */
export function parseApiDate(value) {
  if (!value) return null
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(value) {
  const d = parseApiDate(value)
  if (!d) return ''
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: ATT_TZ })
}

export function formatDate(value) {
  const d = parseApiDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ATT_TZ })
}

// ── Geolocation ─────────────────────────────────────────────────────────────

const GEO_ERRORS = {
  // Code 1 deliberately says nothing about *how* to fix it — once the origin is
  // blocked the browser stops prompting entirely, and the page shows a proper
  // step-by-step recovery panel instead of a one-line "go to settings".
  1: 'تم حظر إذن الموقع لهذا الموقع، لذلك لم يظهر طلب الإذن.',
  2: 'تعذّر تحديد موقعك الحالي. تأكد من تفعيل خدمة الموقع (GPS) في الجهاز ثم أعد المحاولة.',
  3: 'انتهت مهلة تحديد الموقع. تأكد من إشارة الموقع وأعد المحاولة.',
}

/**
 * Whether a `Permissions-Policy` response header has disabled a feature for
 * this document (e.g. `Permissions-Policy: geolocation=()`).
 *
 * This case is indistinguishable from a user-denied permission through the
 * normal APIs — both give an instant PERMISSION_DENIED with no prompt and both
 * report 'denied' from navigator.permissions — but the fix is the opposite:
 * nothing the employee changes on their device can help, only the header can.
 * Telling them to open site settings here wastes their time, so the page checks
 * this first and points at the server instead.
 *
 * Returns false when the API is unavailable: "can't tell" must not masquerade
 * as "server misconfigured".
 */
export function isBlockedByPermissionsPolicy(feature) {
  const policy = document.featurePolicy ?? document.permissionsPolicy
  if (!policy?.allowsFeature) return false
  try {
    return !policy.allowsFeature(feature)
  } catch {
    return false
  }
}

/**
 * Watch the geolocation permission without triggering a prompt, reporting
 * 'granted' | 'prompt' | 'denied' | 'unknown' immediately and on every change.
 *
 * This is what makes the page able to warn *before* the button is tapped: a
 * blocked origin makes getCurrentPosition reject instantly with no dialog, so
 * without this the first sign of trouble is a failure the user can't explain.
 * The change event also lets the page recover on its own the moment the
 * permission is granted in another tab or in the browser's site settings.
 *
 * Permissions.query is missing on some older WebKit builds — 'unknown' there
 * means "just try it", which is the pre-existing behaviour.
 */
export function watchGeoPermission(onChange) {
  if (!navigator.permissions?.query) {
    onChange('unknown')
    return () => {}
  }
  let status = null
  let cancelled = false
  const handler = () => { if (!cancelled && status) onChange(status.state) }

  navigator.permissions.query({ name: 'geolocation' })
    .then(st => {
      if (cancelled) return
      status = st
      onChange(st.state)
      st.addEventListener('change', handler)
    })
    .catch(() => { if (!cancelled) onChange('unknown') })

  return () => {
    cancelled = true
    status?.removeEventListener('change', handler)
  }
}

/**
 * High-accuracy fix, same contract as the app: no coordinates → no record.
 * Rejects with an Error whose `message` is already user-facing Arabic.
 */
export function getPosition({ timeout = 20000 } = {}) {
  if (!isSecureContextOk()) {
    return Promise.reject(new Error('تحديد الموقع يتطلب اتصالاً آمناً (HTTPS). افتح النظام عبر رابط https ثم أعد المحاولة.'))
  }
  if (!hasGeolocationApi()) {
    return Promise.reject(new Error('متصفحك لا يدعم تحديد الموقع. استخدم متصفحاً حديثاً أو تطبيق الهاتف.'))
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      err => {
        const wrapped = new Error(GEO_ERRORS[err?.code] ?? 'تعذّر تحديد موقعك الحالي، حاول مرة أخرى.', { cause: err })
        // Carry the numeric code through: code 1 (PERMISSION_DENIED) is the one
        // the page turns into the recovery panel, and it's also the only way to
        // detect a block on browsers without navigator.permissions.
        wrapped.code = err?.code
        reject(wrapped)
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    )
  })
}

// ── Selfie encoding ─────────────────────────────────────────────────────────

function drawScaled(source, sourceWidth, sourceHeight) {
  // min(1, 1600/max(w,h)) === min(1, 1600/w, 1600/h): the whole frame fits
  // inside 1600×1600 with its aspect ratio intact. Clamping at 1 means a
  // camera below the cap is left alone rather than upscaled into fake detail.
  const scale = Math.min(1, MAX_SELFIE_EDGE / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))

  const ctx = canvas.getContext('2d')
  // Canvas defaults to a cheap filter that leaves downscaled faces noticeably
  // softer than the app's native resize; this costs nothing at these sizes.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Drawn at full frame — no crop, matching the app. The live preview is
  // mirrored for comfort (CSS only); the stored frame must not be, since a
  // reviewer compares it against a real face.
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('تعذّر معالجة الصورة، حاول مرة أخرى.'))),
      'image/jpeg',
      SELFIE_QUALITY,
    )
  })
}

/** Grab the current frame of a playing <video> as a downscaled JPEG blob. */
export function captureFromVideo(video) {
  const w = video?.videoWidth ?? 0
  const h = video?.videoHeight ?? 0
  if (!w || !h) return Promise.reject(new Error('الكاميرا لم تجهز بعد، انتظر لحظة ثم أعد المحاولة.'))
  return canvasToJpeg(drawScaled(video, w, h))
}

// NOTE: there is deliberately no file-to-selfie helper here. The selfie is
// identity evidence bound to a location and a timestamp, so it must come from
// a live camera frame — captureFromVideo above is the only way in. Anything
// that accepts a stored image (a file picker, drag-drop, <input capture>)
// makes the verification decorative and must not be reintroduced.

// ── Upload ──────────────────────────────────────────────────────────────────

/** A record the server accepted the request for but rejected on business rules. */
export class AttendanceRejection extends Error {
  constructor(message) {
    super(message)
    this.name = 'AttendanceRejection'
  }
}

function buildRecordForm({ type, latitude, longitude, recordedAt, selfie }) {
  const form = new FormData()
  form.append('type', type)
  form.append('latitude', String(latitude))
  form.append('longitude', String(longitude))
  form.append('recorded_at', recordedAt)
  form.append('selfie', selfie, `selfie-${Date.now()}.jpg`)
  return form
}

// /attendance/sync takes an index-aligned batch. The web only ever sends one
// record, so index 0 is the whole payload and failed[0].error is its reason.
async function submitViaSync({ type, latitude, longitude, recordedAt, selfie }) {
  const form = new FormData()
  form.append('records[0][type]', type)
  form.append('records[0][latitude]', String(latitude))
  form.append('records[0][longitude]', String(longitude))
  form.append('records[0][recorded_at]', recordedAt)
  form.append('selfies[0]', selfie, `selfie-${Date.now()}.jpg`)

  const res = await api.post('/attendance/sync', form)
  const failed = res.data?.failed
  if (Array.isArray(failed) && failed.length > 0) {
    throw new AttendanceRejection(failed[0]?.error || 'رفض الخادم تسجيل الحضور.')
  }
  return res.data
}

/**
 * Record one check-in / check-out.
 *
 * Posts to /attendance/record (the purpose-built single-record route) and falls
 * back to a one-record /attendance/sync batch when that route isn't deployed —
 * the app funnels everything through /sync, so /sync is the upload path proven
 * in production and this page must not fail on a route that was never exercised.
 * The fallback is scoped to 404/405 only: a 400/422 business rejection is a real
 * answer and must surface as-is.
 */
export async function submitAttendance(payload) {
  try {
    const res = await api.post('/attendance/record', buildRecordForm(payload))
    return res.data
  } catch (err) {
    const status = err?.response?.status
    if (status !== 404 && status !== 405) throw err
    return submitViaSync(payload)
  }
}

/** Arabic message for anything the capture/upload flow can throw. */
export function readAttendanceError(err, fallback = 'تعذّر تسجيل الحضور، حاول مرة أخرى.') {
  if (err instanceof AttendanceRejection) return err.message

  const res = err?.response
  if (res) {
    const data = res.data
    if (data?.errors && typeof data.errors === 'object') {
      return Object.values(data.errors).flat().join('، ')
    }
    if (data?.message) return data.message
    if (res.status === 403) return 'ليس لديك صلاحية تسجيل الحضور. راجع الموارد البشرية.'
    if (res.status === 413) return 'حجم الصورة كبير جداً، أعد الالتقاط ثم حاول مرة أخرى.'
    if (res.status >= 500) return 'الخادم غير متاح حالياً، حاول بعد قليل.'
    return fallback
  }

  // No response at all → the request never reached the API.
  if (err?.code === 'ERR_NETWORK') return 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.'
  return err?.message || fallback
}

// ── Today's status ──────────────────────────────────────────────────────────

/**
 * Reduce a day's records to what the button needs. The app treats a day as one
 * shift: check-in then check-out, no second round.
 *
 * A record HR refused (`is_rejected`) is **not** attendance. The backend looks
 * straight through it — the day counts as absent, and the employee is expected
 * to record it again — so counting one here would offer "check out" against a
 * check-in the server no longer sees, and every tap would come back 422. The
 * refused rows are still returned separately so the page can say what happened.
 *
 * `is_rejected` is absent on older backends, where `!undefined` keeps the
 * record: an API that predates refusals had none to hide.
 */
export function readDayStatus(records) {
  const all = [...(records ?? [])]
    .filter(r => r?.recorded_at)
    .sort((a, b) => (parseApiDate(a.recorded_at) ?? 0) - (parseApiDate(b.recorded_at) ?? 0))

  const ordered = all.filter(r => !r.is_rejected)
  const rejected = all.filter(r => r.is_rejected)

  const lastCheckIn = [...ordered].reverse().find(r => r.type === 'check_in') ?? null
  const hasCheckOut = ordered.some(r => r.type === 'check_out')
  const last = ordered[ordered.length - 1] ?? null

  return {
    // Only the records that still stand — what the status card and the button
    // reason about.
    ordered,
    // Every record for the day, refused ones included, for the history list.
    all,
    rejected,
    // The most recent refusal, which is the one worth explaining.
    lastRejected: rejected[rejected.length - 1] ?? null,
    last,
    lastCheckIn,
    hasCheckOut,
    // What the big button would do next: null once the day's shift is closed.
    // After a refusal this correctly falls back to 'check_in'.
    nextType: hasCheckOut ? null : lastCheckIn ? 'check_out' : 'check_in',
  }
}

/** Arabic reason labels, mirroring AttendanceRecord::REJECTION_REASON_LABELS. */
export const REJECTION_REASONS = {
  location: 'الموقع المسجَّل لا يطابق موقع العمل',
  selfie: 'الصورة الشخصية غير صحيحة أو غير واضحة',
  other: 'مخالفة تعليمات تسجيل الحضور',
}

/** One sentence explaining a refused record, or '' when it isn't refused. */
export function readRejectionMessage(record) {
  if (!record?.is_rejected) return ''

  const what = record.type === 'check_out' ? 'انصرافك' : 'حضورك'
  const why = REJECTION_REASONS[record.rejection_reason]
    ?? 'مخالفة تعليمات تسجيل الحضور'
  const note = record.rejection_note ? ` ملاحظة: ${record.rejection_note}` : ''

  return `لم تُقبل محاولة تسجيل ${what} الساعة ${formatTime(record.recorded_at)}: ${why}.${note}`
}

/** Milliseconds still to wait before a check-out is allowed (0 when it is). */
export function checkoutWaitMs(lastCheckIn, now = Date.now()) {
  const at = parseApiDate(lastCheckIn?.recorded_at)
  if (!at) return 0
  return Math.max(0, at.getTime() + MIN_CHECKOUT_GAP_MINUTES * 60000 - now)
}

/** "٥٩:٠٤" style mm:ss countdown for the disabled-button hint. */
export function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
