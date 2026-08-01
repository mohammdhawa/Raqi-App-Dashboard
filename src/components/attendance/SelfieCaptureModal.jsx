import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, RefreshCw, Check, X, Loader2, CameraOff, Upload } from 'lucide-react'
import {
  captureFromVideo, selfieFromFile, hasCameraApi, isSecureContextOk,
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

/**
 * Front-camera selfie capture, the browser counterpart of the app's
 * image_picker step. Shows a live preview, one shot, then confirm/retake.
 *
 * `onConfirm(blob)` may be async — the modal stays mounted and disabled while
 * it runs so the upload can't be double-fired, and the parent unmounts on
 * success. A rejection is surfaced inline and the shot is kept for a retry.
 */
export default function SelfieCaptureModal({ title, hint, onCancel, onConfirm }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  // Camera is unusable (no API / insecure origin / permission) → offer the
  // native file+capture fallback rather than dead-ending the employee.
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [shot, setShot] = useState(null)        // { blob, url }
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)       // encoding a frame or a picked file

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // `cancelledRef` lets the unmount cleanup abort a getUserMedia promise that is
  // still in flight — otherwise a permission prompt answered after the modal
  // closed would leave a live camera stream (and its indicator light) behind.
  const cancelledRef = useRef(false)

  const startCamera = useCallback(async () => {
    if (!isSecureContextOk()) {
      setError('التقاط الصورة يتطلب اتصالاً آمناً (HTTPS). افتح النظام عبر رابط https ثم أعد المحاولة.')
      setCameraBlocked(true)
      return
    }
    if (!hasCameraApi()) {
      setError('متصفحك لا يدعم التقاط الصور مباشرة.')
      setCameraBlocked(true)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Safari needs the explicit play(); it can reject if the element was
        // torn down mid-await, which is harmless here.
        videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch (err) {
      if (cancelledRef.current) return
      setError(CAMERA_ERRORS[err?.name] ?? 'تعذّر تشغيل الكاميرا، حاول مرة أخرى.')
      setCameraBlocked(true)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    const startTimer = window.setTimeout(startCamera, 0)
    return () => {
      window.clearTimeout(startTimer)
      cancelledRef.current = true
      stopStream()
    }
  }, [startCamera, stopStream])

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

  const pickFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be re-picked after a retake
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const blob = await selfieFromFile(file)
      setShot({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(err?.message ?? 'تعذّر قراءة الصورة المختارة.')
    } finally {
      setBusy(false)
    }
  }

  const retake = () => {
    setShot(null)
    setError('')
    // The shot froze the preview and released the camera; bring it back unless
    // this device never had one (the file fallback stays available either way).
    if (!cameraBlocked) startCamera()
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
          {shot ? (
            <img
              src={shot.url} alt="الصورة الملتقطة"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <video
              ref={videoRef} playsInline muted autoPlay
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                // Mirror the *preview* only — people expect a mirror. The stored
                // frame stays unmirrored (see drawScaled).
                transform: 'scaleX(-1)',
                opacity: ready ? 1 : 0, transition: 'opacity .2s',
              }}
            />
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
                يمكنك اختيار صورة من الكاميرا عبر الزر بالأسفل
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
          <input
            ref={fileInputRef} type="file" accept="image/*" capture="user"
            onChange={pickFile} style={{ display: 'none' }}
          />

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
          ) : (
            <>
              {!cameraBlocked && (
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
              <button
                onClick={() => fileInputRef.current?.click()} disabled={busy}
                style={{
                  ...btnBase, flex: cameraBlocked ? 1 : undefined,
                  background: cameraBlocked ? 'var(--c-primary)' : 'transparent',
                  color: cameraBlocked ? '#fff' : 'var(--c-text-2)',
                  border: cameraBlocked ? 'none' : '1px solid var(--c-border)',
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                }}
              >
                <Upload size={15} />
                {cameraBlocked ? 'التقاط عبر كاميرا الجهاز' : 'رفع صورة'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
