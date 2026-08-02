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

const MAX_SELFIE_EDGE = 1600 // matches the app's image_picker maxWidth/maxHeight
const SELFIE_QUALITY = 0.85  // matches imageQuality: 85

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
  const scale = Math.min(1, MAX_SELFIE_EDGE / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const ctx = canvas.getContext('2d')
  // The live preview is mirrored for comfort (CSS), but the stored frame must
  // not be — it's a verification photo that a reviewer compares to a face.
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

/**
 * Same normalisation for the <input capture> fallback used when getUserMedia
 * is unavailable (older iOS in-app browsers, locked-down enterprise policies).
 * Re-encoding also strips the EXIF payload the phone camera attaches.
 */
export async function selfieFromFile(file) {
  if (!file) throw new Error('لم يتم اختيار صورة.')
  if (!file.type?.startsWith('image/')) throw new Error('الملف المختار ليس صورة.')

  if (typeof createImageBitmap === 'function') {
    // imageOrientation honours EXIF rotation where supported; browsers that
    // ignore the option simply behave as they did before.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
    try {
      return await canvasToJpeg(drawScaled(bitmap, bitmap.width, bitmap.height))
    } finally {
      bitmap.close?.()
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('تعذّر قراءة الصورة المختارة.'))
      el.src = url
    })
    return await canvasToJpeg(drawScaled(img, img.naturalWidth, img.naturalHeight))
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
 */
export function readDayStatus(records) {
  const ordered = [...(records ?? [])]
    .filter(r => r?.recorded_at)
    .sort((a, b) => (parseApiDate(a.recorded_at) ?? 0) - (parseApiDate(b.recorded_at) ?? 0))

  const lastCheckIn = [...ordered].reverse().find(r => r.type === 'check_in') ?? null
  const hasCheckOut = ordered.some(r => r.type === 'check_out')
  const last = ordered[ordered.length - 1] ?? null

  return {
    ordered,
    last,
    lastCheckIn,
    hasCheckOut,
    // What the big button would do next: null once the day's shift is closed.
    nextType: hasCheckOut ? null : lastCheckIn ? 'check_out' : 'check_in',
  }
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
