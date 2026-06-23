import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import {
  FileText, ExternalLink, Download, Loader2, FileX, Send, CheckCircle2, XCircle,
  Clock, Bell, ArrowRight, AlertCircle, Building2, Layers, FilePlus, Activity,
  Workflow, MessageSquare, Paperclip,
} from 'lucide-react'
import {
  formatDate, formatDateTime, StatusBadge, STATUS_META, OriginTag,
  InitialsAvatar, getApprovalContext, extractErrorMessage, openStampedPdf,
  fetchDocumentFileUrl, fetchAttachmentFileUrl,
} from '../components/documents/shared'

// ── Layout primitives ────────────────────────────────────────────────────────

const cardStyle = {
  background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
  boxShadow: 'var(--sh-card)', overflow: 'hidden', marginBottom: 20,
}

const cardHeaderStyle = {
  padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
  display: 'flex', alignItems: 'center', gap: 9,
}

function formatFileSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`
  return `${(bytes / 1024 / 1024).toFixed(2)} م.ب`
}

function InfoItem({ icon: Icon, label, value, mono }) {
  if (value == null || value === '') return null
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', marginBottom: 4 }}>
        {Icon && <Icon size={11} />}
        {label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--c-text)',
        fontFamily: mono ? "'Courier New', Courier, monospace" : 'var(--font-sans)',
      }}>
        {value}
      </div>
    </div>
  )
}

// ── Header card ───────────────────────────────────────────────────────────────

function HeaderCard({ document }) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 800, color: 'var(--c-text)' }}>
              {document.title || '—'}
            </h1>
            {document.description && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
                {document.description}
              </p>
            )}
          </div>
          <StatusBadge status={document.status} />
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '16px 28px', marginTop: 18,
          paddingTop: 16, borderTop: '1px solid var(--c-border)',
        }}>
          <InfoItem label="رقم المستند" value={document.document_number} mono />
          <InfoItem label="النوع" value={<OriginTag doc={document} />} />
          <InfoItem label="رقم الصادر" value={document.export_number} mono />
          <InfoItem label="رقم الوارد" value={document.import_number} mono />
          <InfoItem icon={Building2} label="الإدارة" value={document.department?.name} />
          <InfoItem icon={Layers} label="القسم" value={document.section?.name} />
          <InfoItem label="مقدّم الطلب" value={document.creator?.name} />
          <InfoItem label="تاريخ الإنشاء" value={formatDateTime(document.created_at)} />
          <InfoItem icon={Workflow} label="آلية الاعتماد" value={document.workflow_mode === 'sequential' ? 'متسلسل' : 'متوازٍ'} />
        </div>
      </div>
    </div>
  )
}

// ── PDF preview card ──────────────────────────────────────────────────────────

function PdfCard({ document, fileMime, hasDecisions }) {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileLoading, setFileLoading] = useState(true)
  const [fileFailed, setFileFailed] = useState(false)
  const filePath = document.stamped_file_path || document.file_path
  const mime = fileMime ?? ''
  const canPreview = mime.includes('pdf') || mime.startsWith('image/')

  useEffect(() => {
    if (!filePath) { setFileLoading(false); return }
    let active = true
    let objectUrl = null
    setFileLoading(true)
    setFileFailed(false)
    fetchDocumentFileUrl(document.id)
      .then(url => {
        if (!active) { URL.revokeObjectURL(url); return }
        objectUrl = url
        setFileUrl(url)
      })
      .catch(() => { if (active) setFileFailed(true) })
      .finally(() => { if (active) setFileLoading(false) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document.id, filePath])

  function openInNewTab() {
    if (fileUrl) window.open(fileUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleStampedDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      await openStampedPdf(document.id)
    } catch (e) {
      toast.error(extractErrorMessage(e, 'تعذّر فتح النسخة المختومة.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <FileText size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>معاينة المستند</span>
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {fileUrl && (
            <button
              onClick={openInNewTab}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
                border: '1px solid var(--c-border)', borderRadius: 9,
                padding: '6px 11px', background: '#fff', cursor: 'pointer',
              }}
            >
              <ExternalLink size={13} />
              فتح في تبويب جديد
            </button>
          )}
          {hasDecisions && (
            <button
              onClick={handleStampedDownload} disabled={downloading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: 'var(--c-primary)',
                border: '1px solid var(--c-primary)', borderRadius: 9,
                padding: '6px 11px', background: '#fff',
                cursor: downloading ? 'default' : 'pointer',
                opacity: downloading ? 0.6 : 1,
              }}
            >
              {downloading
                ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                : <Download size={13} />}
              تنزيل النسخة المختومة
            </button>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--c-surface)' }}>
        {!filePath && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileX size={28} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)' }}>لا يوجد ملف مرفق لهذا المستند</p>
          </div>
        )}
        {filePath && fileLoading && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Loader2 size={26} className="animate-spin" style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)' }}>...جارٍ تحميل الملف</p>
          </div>
        )}
        {filePath && !fileLoading && fileFailed && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileX size={28} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-2)' }}>تعذّر تحميل ملف المستند</p>
          </div>
        )}
        {filePath && !fileLoading && !fileFailed && fileUrl && canPreview && (
          <iframe
            src={fileUrl} title={document.title || 'معاينة المستند'}
            style={{ width: '100%', height: 640, border: 'none', display: 'block' }}
          />
        )}
        {filePath && !fileLoading && !fileFailed && fileUrl && !canPreview && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileText size={28} style={{ color: 'var(--c-text-3)', marginBottom: 10 }} />
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--c-text-2)' }}>
              لا يمكن معاينة هذا النوع من الملفات مباشرة
            </p>
            <button
              onClick={openInNewTab}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 700, color: '#fff',
                background: 'var(--c-primary)', borderRadius: 9,
                padding: '8px 16px', border: 0, cursor: 'pointer',
              }}
            >
              <Download size={13} />
              تنزيل الملف
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Attachments card ──────────────────────────────────────────────────────────

function AttachmentsCard({ documentId, attachments }) {
  const toast = useToast()
  if (!attachments?.length) return null

  async function handleOpen(attachmentId) {
    try {
      const url = await fetchAttachmentFileUrl(documentId, attachmentId)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(extractErrorMessage(e, 'تعذّر فتح المرفق.'))
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <Paperclip size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>مرفقات إضافية</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
          background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
        }}>
          {attachments.length}
        </span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {attachments.map(a => (
          <button
            key={a.id} onClick={() => handleOpen(a.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              border: '1px solid var(--c-border)', borderRadius: 10, background: 'var(--c-surface)',
              width: '100%', textAlign: 'right', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            <FileText size={16} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {a.file_name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                {formatFileSize(a.file_size)}{a.uploader?.name ? ` · ${a.uploader.name}` : ''}
              </div>
            </div>
            <Download size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Comments card ─────────────────────────────────────────────────────────────

function CommentsCard({ docId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const fetchComments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/documents/${docId}/comments`)
      const raw = res.data.comments ?? res.data
      const list = raw?.data ?? (Array.isArray(raw) ? raw : [])
      setComments(list)
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => { fetchComments() }, [fetchComments])

  async function handlePost() {
    const comment = text.trim()
    if (!comment) return
    setPosting(true)
    try {
      await api.post(`/documents/${docId}/comments`, { comment })
      setText('')
      await fetchComments()
    } catch (e) {
      toast.error(extractErrorMessage(e, 'تعذّر إضافة التعليق.'))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <MessageSquare size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>التعليقات</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
          background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
        }}>
          {comments.length}
        </span>
      </div>

      <div style={{ padding: 20 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12.5, color: 'var(--c-text-3)' }}>
            ...جارِ التحميل
          </div>
        )}

        {!loading && comments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12.5, color: 'var(--c-text-3)' }}>
            لا توجد تعليقات بعد
          </div>
        )}

        {!loading && comments.map((c, i) => (
          <div key={c.id ?? i} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <InitialsAvatar name={c.user?.name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{c.user?.name ?? '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{formatDateTime(c.created_at)}</span>
              </div>
              <div style={{
                fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7,
                background: 'var(--c-surface)', borderRadius: 10, padding: '9px 12px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {c.comment}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
          <InitialsAvatar name={user?.name} size={32} />
          <div style={{ flex: 1 }}>
            <div style={{
              background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
              borderRadius: 10, padding: '8px 10px',
            }}>
              <textarea
                value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={2000}
                placeholder="أضف تعليقاً..."
                style={{
                  width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'vertical',
                  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
                  textAlign: 'right', direction: 'rtl',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="primary" disabled={!text.trim() || posting} onClick={handlePost} style={{ height: 36, fontSize: 12.5, opacity: !text.trim() || posting ? 0.6 : 1 }}>
                {posting ? '...' : 'إرسال'}
                <Send size={13} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Pending banner ────────────────────────────────────────────────────────────

function PendingBanner({ users }) {
  if (!users?.length) return null
  return (
    <div style={{
      ...cardStyle, padding: '14px 16px',
      background: 'var(--c-pending-bg)', border: '1px solid var(--c-pending)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Bell size={15} style={{ color: 'var(--c-pending)' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-pending)' }}>بانتظار اعتماد</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {users.map(u => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fff', borderRadius: 999, padding: '4px 10px 4px 4px',
            border: '1px solid var(--c-border)',
          }}>
            <InitialsAvatar name={u.name} size={22} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>{u.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Workflow timeline ─────────────────────────────────────────────────────────

function orderWorkflows(workflows) {
  return (workflows ?? [])
    .map((w, i) => ({ ...w, _idx: i }))
    .sort((a, b) => {
      if (a.role === 'chief' && b.role !== 'chief') return 1
      if (b.role === 'chief' && a.role !== 'chief') return -1
      if (a.order != null && b.order != null) return a.order - b.order
      return a._idx - b._idx
    })
}

function WorkflowStep({ w, isLast, isMe }) {
  const meta = STATUS_META[w.status] ?? STATUS_META.pending
  const Icon = meta.icon
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: meta.bg, color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${meta.color}33`,
        }}>
          <Icon size={14} />
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--c-border)', marginTop: 4, marginBottom: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 18, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{w.user?.name ?? '—'}</span>
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: 'var(--c-text-3)',
            background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 8px',
          }}>
            {w.role === 'chief' ? 'الرئيس الأعلى' : 'مدير'}
          </span>
          {isMe && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-accent)' }}>(أنت)</span>}
        </div>
        <div style={{ marginTop: 6 }}>
          <StatusBadge status={w.status} />
        </div>
        {w.signed_at && (
          <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 6 }}>{formatDateTime(w.signed_at)}</div>
        )}
        {w.note && (
          <div style={{
            marginTop: 8, fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.6,
            background: 'var(--c-surface)', borderRadius: 8, padding: '8px 10px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {w.note}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowTimeline({ document, userId }) {
  const ordered = orderWorkflows(document.workflows)
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <Workflow size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>مسار الاعتماد</span>
      </div>
      <div style={{ padding: 20 }}>
        {ordered.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--c-text-3)' }}>لا يوجد مسار اعتماد</div>
        )}
        {ordered.map((w, i) => (
          <WorkflowStep key={w.id ?? i} w={w} isLast={i === ordered.length - 1} isMe={w.user_id === userId} />
        ))}
      </div>
    </div>
  )
}

// ── Approve / reject card ─────────────────────────────────────────────────────

function mapActionError(e) {
  const code = e?.response?.data?.error
  const map = {
    chief_cannot_act_yet: 'لا يمكن للرئيس الأعلى اتخاذ القرار قبل انتهاء جميع المدراء من اعتماداتهم.',
    not_your_turn: 'لم يحن دورك بعد لاتخاذ قرار بشأن هذا المستند.',
    document_already_finalized: 'تم اتخاذ قرار نهائي بشأن هذا المستند بالفعل.',
    no_pending_action: 'لا يوجد إجراء معلّق بانتظارك على هذا المستند.',
    forbidden: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  }
  return map[code] ?? extractErrorMessage(e, 'تعذّر تنفيذ الإجراء.')
}

function ApprovalCard({ docId, onDone }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(null)

  async function act(action) {
    setSubmitting(action)
    try {
      const body = note.trim() ? { note: note.trim() } : {}
      const res = await api.post(`/documents/${docId}/${action}`, body)
      onDone(res.data)
      toast.success(action === 'approve' ? 'تم اعتماد المستند بنجاح' : 'تم رفض المستند')
    } catch (e) {
      toast.error(mapActionError(e))
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div style={{ ...cardStyle, border: '1px solid var(--c-primary)' }}>
      <div style={cardHeaderStyle}>
        <Bell size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>بانتظار قرارك</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{
          background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
          borderRadius: 10, padding: '8px 10px', marginBottom: 12,
        }}>
          <textarea
            value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000}
            placeholder="ملاحظة (اختياري)..."
            style={{
              width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'vertical',
              fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
              textAlign: 'right', direction: 'rtl',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="primary" style={{ flex: 1, background: 'var(--c-approved)' }}
            disabled={!!submitting} onClick={() => act('approve')}
          >
            {submitting === 'approve' ? '...' : 'موافقة'}
            <CheckCircle2 size={15} />
          </Button>
          <Button
            variant="danger" style={{ flex: 1 }}
            disabled={!!submitting} onClick={() => act('reject')}
          >
            {submitting === 'reject' ? '...' : 'رفض'}
            <XCircle size={15} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Activity log ──────────────────────────────────────────────────────────────

const LOG_META = {
  created:  { label: 'تم إنشاء المستند',  icon: FilePlus,     color: 'var(--c-text-2)' },
  sent:     { label: 'تم إرساله للاعتماد', icon: Send,         color: 'var(--c-text-2)' },
  approved: { label: 'تمت الموافقة',       icon: CheckCircle2, color: 'var(--c-approved)' },
  rejected: { label: 'تم الرفض',           icon: XCircle,      color: 'var(--c-rejected)' },
}

function ActivityLog({ logs }) {
  const list = logs ?? []
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <Activity size={16} style={{ color: 'var(--c-primary)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text)' }}>سجل النشاط</span>
      </div>
      <div style={{ padding: 20 }}>
        {list.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--c-text-3)' }}>لا يوجد نشاط مسجّل</div>
        )}
        {list.map((log, i) => {
          const meta = LOG_META[log.action] ?? { label: log.action, icon: Activity, color: 'var(--c-text-2)' }
          const Icon = meta.icon
          return (
            <div key={log.id ?? i} style={{ display: 'flex', gap: 10, marginBottom: i === list.length - 1 ? 0 : 14 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'var(--c-surface-2)', color: meta.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={12} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{meta.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>
                  {log.done_by?.name ?? '—'} · {formatDateTime(log.created_at)}
                </div>
                {log.note && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.6 }}>{log.note}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorStatus, setErrorStatus] = useState(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setErrorStatus(null)
    try {
      const res = await api.get(`/documents/${id}`)
      setData(res.data)
    } catch (e) {
      setErrorStatus(e.response?.status ?? 500)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  useEffect(() => {
    const handler = () => fetchDetail()
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchDetail])

  useEffect(() => {
    const title = data?.document?.title ?? ''
    window.dispatchEvent(new CustomEvent('topbar:detail-title', { detail: { title } }))
    return () => {
      window.dispatchEvent(new CustomEvent('topbar:detail-title', { detail: { title: '' } }))
    }
  }, [data?.document?.title])

  if (loading) {
    return (
      <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0', gap: 10 }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />
          <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>...جارِ التحميل</span>
        </div>
      </div>
    )
  }

  if (errorStatus || !data?.document) {
    const message = errorStatus === 404
      ? 'هذا المستند غير موجود.'
      : errorStatus === 403
        ? 'ليس لديك صلاحية لعرض هذا المستند.'
        : 'حدث خطأ أثناء تحميل المستند.'
    return (
      <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ ...cardStyle, padding: '60px 20px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
          <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--c-text-2)' }}>{message}</p>
          <Link
            to="/documents/inbox"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700, color: 'var(--c-primary)', textDecoration: 'none',
            }}
          >
            <ArrowRight size={15} />
            العودة للوارد
          </Link>
        </div>
      </div>
    )
  }

  const { document, file_mime, next_pending_users } = data
  const { isMyTurn } = getApprovalContext(document, user?.id)
  const hasDecisions = (document.workflows ?? []).some(w => w.signed_at)

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>

        {/* Main column */}
        <div style={{ flex: '1 1 600px', minWidth: 0 }}>
          <HeaderCard document={document} />
          <PdfCard document={document} fileMime={file_mime} hasDecisions={hasDecisions} />
          <AttachmentsCard documentId={document.id} attachments={document.attachments} />
          <CommentsCard docId={document.id} />
        </div>

        {/* Side column */}
        <div style={{ flex: '0 1 360px', minWidth: 280 }}>
          {document.status === 'pending' && <PendingBanner users={next_pending_users} />}
          {isMyTurn && (
            <ApprovalCard
              docId={document.id}
              onDone={({ document: updated, next_pending_users: npu }) => {
                setData(prev => ({ ...prev, document: updated, next_pending_users: npu ?? prev.next_pending_users }))
              }}
            />
          )}
          <WorkflowTimeline document={document} userId={user?.id} />
          <ActivityLog logs={document.logs} />
        </div>
      </div>
    </div>
  )
}
