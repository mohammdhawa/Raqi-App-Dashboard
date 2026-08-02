import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, RefreshCw, Check, X, Loader2, CameraOff, SwitchCamera } from 'lucide-react'
import {
  captureFromVideo, hasCameraApi, isSecureContextOk, CAPTURE_REQUEST_EDGE,
} from '../../utils/attendanceCapture'

// Arabic for the getUserMedia rejection names. Each one has a different fix, so
// they must not collapse into one generic message.
const CAMERA_ERRORS = {
  NotAllowedError:      'تم رفض إذن الكاميرا. اسمح بالوصول إلى الكاميرا من إعدادات المتصفح ثم أعد المحاولة.',
  PermissionDeniedError:'تم رفض إذن الكاميرا. اسمح بالوصول إلى الكاميرا من إعدادات المتصفح ثم أعد المحاولة.',
  NotFoundError:        'لم يتم العثور على كاميرا في هذا الجهاز.',
  DevicesNotFoundError: 'لم يتم العثور على كاميرا في هذا الجهاز.',
  NotReadableError:     'الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى ثم أعد المحاولة.',
  TrackStartError:      'الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى ثم أعد المحاولة.',
  OverconstrainedError: 'لا تدعم كاميرا هذا الجهاز الإعدادات المطلوبة.',
  SecurityError:        'حجب المتصفح الوصول إلى الكاميرا لأسباب أمنية.',
}

const btnBase = {
  height: 42, padding: '0 18px', borderRadius: 11,
  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  cursor: 'pointer', border: 'none',
}

function videoConstraints(facingMode) {
  return {
    video: {
      // A plain string is an *ideal* constraint, not an exact one, so a device
      // that can't honour the request still returns its default camera instead
      // of throwing. Only the deliberate switch treats a failure as meaningful.
      facingMode,
      // Requested above the 1600 compression cap so the downscale is what
      // decides the final size — see CAPTURE_REQUEST_EDGE. Asking for less
      // would silently produce a lower-detail selfie than the app's.
      width: { ideal: CAPTURE_REQUEST_EDGE },
      height: { ideal: CAPTURE_REQUEST_EDGE },
    },
    audio: false,
  }
}

/**
 * Live camera capture — the browser counterpart of the app's image_picker step.
 *
 * Deliberately camera-only: there is no file picker and no way to supply a
 * stored image. The selfie is identity evidence attached to an attendance
 * record, so it must be taken now, at the recorded location — letting someone
 * upload a saved photo would make the whole verification decorative.
 *
 * `onConfirm(blob)` may be async — the modal stays mounted and disabled while
 * it runs so the upload can't be double-fired, and the parent unmounts on
 * success. A rejection is surfaced inline and the shot is kept for a retry.
 */
export default function SelfieCaptureModal({ title, hint, onCancel, onConfirm }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  // Camera unusable (no API / insecure origin / denied). With the upload
  // fallback gone this is a hard stop, so it offers a retry rather than a
  // consolation path that would have accepted an unverifiable photo.
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [shot, setShot] = useState(null)        // { blob, url }
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)       // encoding the frame

  const [facing, setFacing] = useState('user')  // 'user' | 'environment'
  const [canSwitch, setCanSwitch] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // `cancelledRef` lets the cleanup abort a getUserMedia promise that is still
  // in flight — otherwise a permission prompt answered after the modal closed
  // (or after a camera switch superseded it) would leave a live stream, and its
  // indicator light, running.
  const cancelledRef = useRef(false)

  const startCamera = useCallback(async (facingMode) => {
    setReady(false)
    setError('')

    if (!isSecureContextOk()) {
      setError('التقاط الصورة يتطلب اتصالاً آمناً (HTTPS). افتح النظام عبر رابط https ثم أعد المحاولة.')
      setCameraBlocked(true)
      return
    }
    if (!hasCameraApi()) {
      setError('متصفحك لا يدعم التقاط الصور من الكاميرا مباشرة. استخدم متصفحاً حديثاً أو تطبيق الهاتف.')
      setCameraBlocked(true)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(videoConstraints(facingMode))
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Safari needs the explicit play(); it can reject if the element was
        // torn down mid-await, which is harmless here.
        videoRef.current.play().catch(() => {})
      }
      setCameraBlocked(false)
      setReady(true)

      // Device labels/kinds are only trustworthy once permission is granted,
      // so the switch button is decided here rather than on mount — no dead
      // control on a laptop with a single webcam.
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          if (cancelledRef.current) return
          setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1)
        })
        .catch(() => {})
    } catch (err) {
      if (cancelledRef.current) return
      // A failed *switch* shouldn't kill a working session: fall back to the
      // front camera, which is the one we know opened a moment ago.
      if (facingMode !== 'user') {
        setError('تعذّر التبديل إلى هذه الكاميرا.')
        setFacing('user')
        return
      }
      setError(CAMERA_ERRORS[err?.name] ?? 'تعذّر تشغيل الكاميرا، حاول مرة أخرى.')
      setCameraBlocked(true)
    }
  }, [])

  // Restarts on every `facing` change — the cleanup stops the old stream first,
  // so switching never leaves two cameras open.
  useEffect(() => {
    cancelledRef.current = false
    const startTimer = window.setTimeout(() => startCamera(facing), 0)
    return () => {
      window.clearTimeout(startTimer)
      cancelledRef.current = true
      stopStream()
    }
  }, [startCamera, stopStream, facing])

  // Revoke the object URL of a discarded shot so retakes don't leak blobs.
  useEffect(() => {
    if (!shot?.url) return undefined
    return () => URL.revokeObjectURL(shot.url)
  }, [shot])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const take = async () => {
    setBusy(true)
    setError('')
    try {
      const blob = await captureFromVideo(videoRef.current)
      setShot({ blob, url: URL.createObjectURL(blob) })
      stopStream() // preview is frozen now; free the camera light immediately
      setReady(false)
    } catch (err) {
      setError(err?.message ?? 'تعذّر التقاط الصورة، حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  const retake = () => {
    setShot(null)
    startCamera(facing)
  }

  const confirm = async () => {
    if (!shot || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(shot.blob)
      // Success → the parent unmounts this modal.
    } catch (err) {
      setError(err?.message ?? 'تعذّر إرسال التسجيل، حاول مرة أخرى.')
      setSubmitting(false)
    }
  }

  // Only the front camera gets mirrored: people expect a mirror of themselves,
  // but a mirrored rear view of a room reads as broken. The *stored* frame is
  // never mirrored either way (see drawScaled).
  const mirrored = facing === 'user'

  return (
    <div
      onClick={() => !submitting && onCancel()}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,32,50,0.55)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', background: '#fff', borderRadius: 16,
          overflow: 'hidden', boxShadow: 'var(--sh-card-lg)', direction: 'rtl',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>{title}</div>
            {hint && (
              <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 3 }}>{hint}</div>
            )}
          </div>
          <button
            onClick={onCancel} disabled={submitting} title="إلغاء"
            style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.5 : 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Viewport */}
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#101A28', overflow: 'hidden' }}>
          {/* `contain`, not `cover`: the stored frame is never cropped, so a
              cropped preview would frame the face differently from the photo
              that actually gets saved. Letterboxing here is the honest view. */}
          {shot ? (
            <img
              src={shot.url} alt="الصورة الملتقطة"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <video
              ref={videoRef} playsInline muted autoPlay
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                transform: mirrored ? 'scaleX(-1)' : 'none',
                opacity: ready ? 1 : 0, transition: 'opacity .2s',
              }}
            />
          )}

          {/* Camera switch — live preview only, and only on multi-camera devices */}
          {!shot && canSwitch && !cameraBlocked && (
            <button
              onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
              disabled={!ready || busy}
              title={facing === 'user' ? 'التبديل إلى الكاميرا الخلفية' : 'التبديل إلى الكاميرا الأمامية'}
              style={{
                position: 'absolute', top: 12, insetInlineStart: 12,
                width: 42, height: 42, borderRadius: '50%', border: 'none',
                background: 'rgba(16,26,40,0.55)', color: '#fff',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: !ready || busy ? 'default' : 'pointer',
                opacity: !ready || busy ? 0.5 : 1, transition: 'opacity .15s',
              }}
            >
              <SwitchCamera size={19} />
            </button>
          )}

          {!shot && !ready && !cameraBlocked && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,0.75)',
            }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12.5 }}>جارٍ تشغيل الكاميرا…</span>
            </div>
          )}

          {!shot && cameraBlocked && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24,
              color: 'rgba(255,255,255,0.8)', textAlign: 'center',
            }}>
              <CameraOff size={30} />
              <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                لا يمكن تسجيل الحضور بدون التقاط صورة من الكاميرا
              </span>
            </div>
          )}

          {submitting && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(16,26,40,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, color: '#fff',
            }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>جارٍ إرسال التسجيل…</span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            margin: '12px 18px 0', padding: '10px 12px', borderRadius: 10,
            background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
            fontSize: 12.5, fontWeight: 700, lineHeight: 1.7,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {shot ? (
            <>
              <button
                onClick={confirm} disabled={submitting}
                style={{
                  ...btnBase, flex: 1, minWidth: 150,
                  background: 'var(--c-approved)', color: '#fff',
                  cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Check size={15} />}
                تأكيد وإرسال
              </button>
              <button
                onClick={retake} disabled={submitting}
                style={{
                  ...btnBase, background: 'transparent', color: 'var(--c-text-2)',
                  border: '1px solid var(--c-border)',
                  cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.5 : 1,
                }}
              >
                <RefreshCw size={15} />
                إعادة الالتقاط
              </button>
            </>
          ) : cameraBlocked ? (
            <button
              onClick={() => startCamera(facing)}
              style={{ ...btnBase, flex: 1, minWidth: 150, background: 'var(--c-primary)', color: '#fff' }}
            >
              <RefreshCw size={15} />
              أعد المحاولة
            </button>
          ) : (
            <button
              onClick={take} disabled={!ready || busy}
              style={{
                ...btnBase, flex: 1, minWidth: 150,
                background: 'var(--c-primary)', color: '#fff',
                cursor: !ready || busy ? 'default' : 'pointer', opacity: !ready || busy ? 0.6 : 1,
              }}
            >
              {busy
                ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                : <Camera size={15} />}
              التقاط الصورة
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
