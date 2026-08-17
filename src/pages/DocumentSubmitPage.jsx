import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import {
  Upload, FileText, X, LayoutTemplate, Search, AlertCircle,
  Paperclip, FileUp, ArrowRight, Hash, UserCheck,
} from 'lucide-react'
import ApproverPicker from '../components/documents/ApproverPicker'
import TemplateFieldForm, { getInitialFieldValues, validateFieldValues } from '../components/documents/TemplateFieldForm'
import { extractErrorMessage } from '../components/documents/shared'

const UPLOAD_EXTS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']
const ATTACHMENT_EXTS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls']

// The two limits are different, and were the same here until now: the primary
// document is capped at 20 MB (`file` → max:20480) while each attachment gets
// 50 MB (`attachments.*` → max:51200). A 30 MB PDF used to reach the server
// and come back as a validation error.
const MAX_DOCUMENT_MB = 20
const MAX_ATTACHMENT_MB = 50
const MAX_DOCUMENT_SIZE = MAX_DOCUMENT_MB * 1024 * 1024
const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_MB * 1024 * 1024
const MAX_ATTACHMENTS = 10

// Stable machine-readable codes the backend promises not to change. Branching
// on these rather than on the Arabic message or the status.
const ERR_GENERATION_DISABLED = 'document_generation_disabled'
const ERR_DUPLICATE_EXPORT    = 'duplicate_export_number'
const ERR_COUNTER_UNINIT      = 'counter_not_initialized'

const WORKFLOW_MODES = [
  { key: 'sequential', label: 'متسلسل', desc: 'يعتمد المعتمدون المستند بالترتيب المحدد، كل واحد بعد الآخر.' },
  { key: 'parallel', label: 'متوازٍ', desc: 'يمكن لجميع المعتمدين الاطلاع على المستند واعتماده في أي وقت.' },
]

const cardStyle = {
  background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
  boxShadow: 'var(--sh-card)', overflow: 'hidden', marginBottom: 20,
}
const cardHeaderStyle = {
  padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
  display: 'flex', alignItems: 'center', gap: 9,
}
const cardBodyStyle = { padding: 20 }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`
  return `${(bytes / 1024 / 1024).toFixed(2)} م.ب`
}

function validateFile(file, allowedExts, maxBytes, maxMb) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !allowedExts.includes(ext)) {
    return `صيغة الملف غير مدعومة (الصيغ المسموحة: ${allowedExts.join('، ')})`
  }
  if (file.size > maxBytes) {
    return `حجم الملف يتجاوز الحد الأقصى المسموح به (${maxMb} ميجابايت)`
  }
  return null
}

/** Recursively appends a (possibly nested) value to FormData using bracket notation. */
function appendFormData(fd, key, value) {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendFormData(fd, `${key}[${i}]`, v))
  } else if (value instanceof File) {
    fd.append(key, value)
  } else if (typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => appendFormData(fd, key ? `${key}[${k}]` : k, v))
  } else {
    fd.append(key, value)
  }
}

// ── Field primitives ──────────────────────────────────────────────────────────

function FieldWrap({ label, required, error, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', error, maxLength }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '0 12px', boxSizing: 'border-box',
    }}>
      <input
        type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent', width: '100%',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: type === 'number' ? 'left' : 'right',
          direction: type === 'number' ? 'ltr' : 'rtl',
        }}
      />
    </div>
  )
}

function TextareaInput({ value, onChange, placeholder, rows = 4, maxLength, error }) {
  return (
    <div style={{
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '10px 12px', boxSizing: 'border-box',
    }}>
      <textarea
        value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows} maxLength={maxLength}
        placeholder={placeholder}
        style={{
          width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'vertical',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function TabButton({ active, icon: Icon, label, onClick, disabled, title }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10,
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'all .14s',
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

// ── Workflow mode radio card ─────────────────────────────────────────────────

function WorkflowModeCard({ mode, active, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        flex: 1, padding: 14, borderRadius: 12, cursor: 'pointer',
        background: active ? 'rgba(34,65,103,0.03)' : '#fff',
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        boxShadow: active ? '0 0 0 3px rgba(34,65,103,0.07)' : 'none',
        transition: 'all .14s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)' }}>{mode.label}</span>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
          background: active ? 'var(--c-primary)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          {active && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>{mode.desc}</div>
    </div>
  )
}

// ── File dropzone (single file — upload tab) ─────────────────────────────────

function FileDropzone({ file, onSelect, onRemove, accept, hint, error }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.[0]) onSelect(e.dataTransfer.files[0])
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1.5px dashed ${error ? 'var(--c-rejected)' : dragOver ? 'var(--c-primary)' : 'var(--c-border)'}`,
          borderRadius: 12, padding: '30px 16px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'var(--c-accent-tint)' : 'var(--c-surface)',
          transition: 'all .14s',
        }}
      >
        <input
          ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = '' }}
        />
        {!file ? (
          <>
            <Upload size={26} style={{ color: 'var(--c-text-3)', marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>اسحب الملف هنا أو انقر للاختيار</div>
            {hint && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 4 }}>{hint}</div>}
          </>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={18} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{file.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{formatFileSize(file.size)}</div>
            </div>
            <button
              type="button" onClick={e => { e.stopPropagation(); onRemove() }}
              style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--c-border)',
                background: '#fff', color: 'var(--c-text-3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 6 }}>{error}</div>}
    </div>
  )
}

// ── Template card (generate tab) ─────────────────────────────────────────────

function TemplateCard({ tpl, active, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, cursor: 'pointer',
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: active ? 'rgba(34,65,103,0.03)' : '#fff',
        boxShadow: active ? '0 0 0 3px rgba(34,65,103,0.07)' : 'none',
        transition: 'all .14s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LayoutTemplate size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tpl.name}
          </div>
          {tpl.type && <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{tpl.type}</div>}
        </div>
      </div>
      {tpl.description && (
        <div style={{
          fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {tpl.description}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentSubmitPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const attachInputRef = useRef(null)

  const [tab, setTab] = useState('upload')

  // Common fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workflowMode, setWorkflowMode] = useState('sequential')
  const [approverIds, setApproverIds] = useState([])

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Template-based generation is behind a server killswitch
  // (config/document.php → generation_enabled, default off) that this client
  // cannot read: there is no capability endpoint, and with the switch off
  // GET /document-templates simply serves an empty list — identical to a
  // deployment that has no active templates. So generation is never assumed to
  // work; it is only ever discovered to be off, by the 403 the POST returns.
  const [generationDisabled, setGenerationDisabled] = useState(false)

  // A rejected approver has to be re-picked and re-confirmed rather than
  // silently resubmitted, so a stale selection can't be sent twice.
  const [approverRefreshKey, setApproverRefreshKey] = useState(0)
  const [staleApproverIds, setStaleApproverIds] = useState([])

  // Upload tab
  const [file, setFile] = useState(null)

  // Generate tab
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateSearch, setTemplateSearch] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [template, setTemplate] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [fieldValues, setFieldValues] = useState({})
  const [counters, setCounters] = useState(null)
  const [exportNumber, setExportNumber] = useState('')
  const [importNumber, setImportNumber] = useState('')
  const [attachments, setAttachments] = useState([])

  // Fetch active templates (debounced search)
  useEffect(() => {
    let active = true
    setTemplatesLoading(true)
    const t = setTimeout(() => {
      api.get('/document-templates', { params: templateSearch ? { search: templateSearch } : {} })
        .then(res => {
          if (!active) return
          const pag = res.data.templates ?? res.data
          const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
          setTemplates(list.filter(t => t.is_active !== false))
        })
        .catch(() => { if (active) setTemplates([]) })
        .finally(() => { if (active) setTemplatesLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [templateSearch])

  // Fetch full template (fields_schema) when one is selected
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplate(null)
      setFieldValues({})
      setErrors(prev => ({ ...prev, field_values: {} }))
      return
    }
    let active = true
    setTemplateLoading(true)
    api.get(`/document-templates/${selectedTemplateId}`)
      .then(res => {
        if (!active) return
        const tpl = res.data.template ?? res.data
        setTemplate(tpl)
        setFieldValues(getInitialFieldValues(tpl.fields_schema))
        setErrors(prev => ({ ...prev, field_values: {}, template: undefined }))
      })
      .catch(() => { if (active) setTemplate(null) })
      .finally(() => { if (active) setTemplateLoading(false) })
    return () => { active = false }
  }, [selectedTemplateId])

  // Fetch export/import counters once for prefilling the generate form
  useEffect(() => {
    api.get('/document-counters/next')
      .then(res => {
        setCounters(res.data)
        if (res.data?.export?.next_number != null) setExportNumber(String(res.data.export.next_number))
        if (res.data?.import?.next_number != null) setImportNumber(String(res.data.import.next_number))
      })
      .catch(() => setCounters(null))
  }, [])

  const showCounters = counters?.department_id != null
  const exportRequired = showCounters && counters?.export?.is_initialized === false

  function handleTabChange(next) {
    if (next === 'generate' && generationDisabled) return
    setTab(next)
    setErrors({})
    setSubmitError('')
  }

  function handleSelectFile(f) {
    const err = validateFile(f, UPLOAD_EXTS, MAX_DOCUMENT_SIZE, MAX_DOCUMENT_MB)
    setFile(f)
    setErrors(prev => ({ ...prev, file: err || undefined }))
  }

  function handleAddAttachments(fileList) {
    const incoming = Array.from(fileList)
    let attachError = ''
    const valid = []
    for (const f of incoming) {
      const err = validateFile(f, ATTACHMENT_EXTS, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENT_MB)
      if (err) { attachError = `${f.name}: ${err}`; continue }
      valid.push(f)
    }
    setAttachments(prev => {
      const combined = [...prev, ...valid]
      if (combined.length > MAX_ATTACHMENTS) {
        attachError = `الحد الأقصى ${MAX_ATTACHMENTS} مرفقات`
        return combined.slice(0, MAX_ATTACHMENTS)
      }
      return combined
    })
    setErrors(prev => ({ ...prev, attachments: attachError || undefined }))
  }

  function removeAttachment(idx) {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  function validateCommon() {
    const errs = {}
    if (!title.trim()) errs.title = 'العنوان مطلوب'
    if (approverIds.length === 0) errs.approver_ids = 'يرجى اختيار معتمد واحد على الأقل'
    return errs
  }

  /** Drops the template selection and returns the form to the upload flow. */
  function resetTemplateState() {
    setSelectedTemplateId(null)
    setTemplate(null)
    setFieldValues({})
    setTemplates([])
    setErrors(prev => ({ ...prev, field_values: {}, template: undefined }))
  }

  function applySubmitError(e) {
    const data = e.response?.data
    const code = data?.error

    // The killswitch. 403 and permanent for as long as the switch is off, with
    // no Retry-After — so the request is not retried and the flow is moved off
    // generation entirely rather than left on a form that cannot submit.
    if (e.response?.status === 403 && code === ERR_GENERATION_DISABLED) {
      const message = data?.message ?? 'إنشاء المستندات من القوالب متوقف حالياً.'
      setGenerationDisabled(true)
      resetTemplateState()
      setTab('upload')
      setSubmitError(message)
      return
    }

    // Counter rules arrive as a bare { message, error } with no `errors` map,
    // so without this they would only ever reach the banner.
    if (code === ERR_DUPLICATE_EXPORT || code === ERR_COUNTER_UNINIT) {
      const message = data?.message ?? 'تعذّر تحديد رقم الصادر.'
      setErrors(prev => ({ ...prev, export_number: message }))
      setSubmitError(message)
      return
    }

    if (e.response?.status === 422 && data?.errors && typeof data.errors === 'object') {
      const flat = {}
      const fieldErrs = {}
      const staleApproverIdx = []
      for (const [key, msgs] of Object.entries(data.errors)) {
        const msg = Array.isArray(msgs) ? msgs[0] : msgs
        if (key.startsWith('field_values.')) {
          const fieldKey = key.slice('field_values.'.length).split('.')[0]
          fieldErrs[fieldKey] = msg
        } else if (key === 'template_id') {
          flat.template = msg
        } else {
          if (key.startsWith('approver_ids.')) {
            const idx = Number(key.split('.')[1])
            if (Number.isInteger(idx)) staleApproverIdx.push(idx)
          }
          flat[key.split('.')[0]] = msg
        }
      }

      // An approver the API refuses — deleted, or no longer a manager/chief —
      // is dropped from the selection and the manager list is re-read, because
      // resending the same id would fail identically.
      if (staleApproverIdx.length) {
        const stale = staleApproverIdx.map(i => approverIds[i]).filter(id => id != null)
        if (stale.length) {
          setStaleApproverIds(stale)
          setApproverIds(prev => prev.filter(id => !stale.includes(id)))
          setApproverRefreshKey(k => k + 1)
        }
      }

      setErrors(prev => ({ ...prev, ...flat, field_values: { ...prev.field_values, ...fieldErrs } }))
      setSubmitError(Object.values(data.errors).flat()[0] ?? 'يرجى مراجعة الحقول المظللة')
      return
    }

    setSubmitError(extractErrorMessage(e, 'حدث خطأ أثناء إرسال المستند.'))
  }

  async function handleSubmitUpload() {
    const errs = validateCommon()
    if (!file) errs.file = 'يرجى اختيار ملف'
    setErrors(errs)
    setSubmitError('')
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      if (description.trim()) fd.append('description', description.trim())
      fd.append('file', file)
      fd.append('workflow_mode', workflowMode)
      approverIds.forEach(id => fd.append('approver_ids[]', id))
      attachments.forEach(f => fd.append('attachments[]', f))
      const res = await api.post('/documents', fd)
      const doc = res.data.document ?? res.data
      toast.success('تم إرسال المستند بنجاح')
      navigate(`/documents/${doc.id}`)
    } catch (e) {
      applySubmitError(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitGenerate() {
    // Discovered to be off — never retried.
    if (generationDisabled) return

    const errs = validateCommon()
    if (!template) errs.template = 'يرجى اختيار قالب'
    if (exportRequired && !exportNumber.trim()) errs.export_number = 'رقم الصادر مطلوب لهذه الإدارة'

    const fieldErrs = template ? validateFieldValues(template.fields_schema, fieldValues) : {}

    setErrors({ ...errs, field_values: fieldErrs })
    setSubmitError('')
    if (Object.keys(errs).length || Object.keys(fieldErrs).length) return

    setSubmitting(true)
    try {
      const payload = {
        template_id: template.id,
        title: title.trim(),
        field_values: fieldValues,
        workflow_mode: workflowMode,
        approver_ids: approverIds,
      }
      if (description.trim()) payload.description = description.trim()
      if (showCounters) {
        if (exportNumber.trim()) payload.export_number = Number(exportNumber)
        if (importNumber.trim()) payload.import_number = Number(importNumber)
      }

      let res
      if (attachments.length > 0) {
        const fd = new FormData()
        appendFormData(fd, '', payload)
        attachments.forEach(f => fd.append('attachments[]', f))
        res = await api.post('/documents/generated', fd)
      } else {
        res = await api.post('/documents/generated', payload)
      }
      const doc = res.data.document ?? res.data
      toast.success('تم إرسال المستند بنجاح')
      navigate(`/documents/${doc.id}`)
    } catch (e) {
      applySubmitError(e)
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit() {
    if (submitDisabled) return
    if (tab === 'upload') handleSubmitUpload()
    else handleSubmitGenerate()
  }

  // Generation can only be submitted with a template actually in hand: with the
  // killswitch on, or with no active templates, there is nothing to generate
  // from and the request would be refused server-side.
  const generateBlocked = tab === 'generate' && (generationDisabled || !template)
  const submitDisabled = submitting || generateBlocked || staleApproverIds.length > 0
  const submitDisabledReason = generationDisabled
    ? 'إنشاء المستندات من القوالب متوقف حالياً من الخادم'
    : generateBlocked
      ? 'اختر قالباً أولاً'
      : staleApproverIds.length > 0
        ? 'يرجى إعادة اختيار المعتمدين بعد إزالة معتمد غير مؤهل'
        : undefined

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 880, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 26 }}>
        <Link to="/documents/sent" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', textDecoration: 'none',
        }}>
          <ArrowRight size={14} />
          العودة للصادر
        </Link>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          مستند جديد
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          ارفع مستنداً جاهزاً أو أنشئ واحداً من قالب، وحدد المعتمدين عليه.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <TabButton active={tab === 'upload'} icon={Upload} label="رفع ملف" onClick={() => handleTabChange('upload')} />
        <TabButton
          active={tab === 'generate'} icon={LayoutTemplate} label="إنشاء من قالب"
          onClick={() => handleTabChange('generate')}
          disabled={generationDisabled}
          title={generationDisabled ? 'إنشاء المستندات من القوالب متوقف حالياً من الخادم' : undefined}
        />
      </div>

      {/* Document info */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <FileText size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>بيانات المستند</span>
        </div>
        <div style={cardBodyStyle}>
          <FieldWrap label="العنوان" required error={errors.title}>
            <TextInput value={title} onChange={setTitle} placeholder="عنوان المستند" maxLength={255} error={errors.title} />
          </FieldWrap>
          <div style={{ marginBottom: 0 }}>
            <FieldWrap label="الوصف (اختياري)">
              <TextareaInput value={description} onChange={setDescription} placeholder="وصف مختصر للمستند..." rows={3} maxLength={2000} />
            </FieldWrap>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'upload' ? (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Upload size={16} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>الملف</span>
          </div>
          <div style={cardBodyStyle}>
            <FileDropzone
              file={file}
              onSelect={handleSelectFile}
              onRemove={() => { setFile(null); setErrors(prev => ({ ...prev, file: undefined })) }}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              hint={`الصيغ المدعومة: PDF, Word, JPG, PNG, WEBP — الحد الأقصى ${MAX_DOCUMENT_MB} ميجابايت`}
              error={errors.file}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Template picker */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <LayoutTemplate size={16} style={{ color: 'var(--c-primary)' }} />
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>القالب</span>
              {template && (
                <>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateId(null)}
                    style={{
                      border: '1px solid var(--c-border)', background: '#fff', borderRadius: 8,
                      padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    تغيير القالب
                  </button>
                </>
              )}
            </div>
            <div style={cardBodyStyle}>
              {!template ? (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 10, padding: '0 12px', height: 40, marginBottom: 16,
                  }}>
                    <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                    <input
                      value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                      placeholder="ابحث عن قالب بالاسم..."
                      style={{
                        flex: 1, border: 0, outline: 0, background: 'transparent',
                        fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
                      }}
                    />
                  </div>

                  {errors.template && (
                    <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginBottom: 10 }}>{errors.template}</div>
                  )}

                  {templatesLoading ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                      ...جارِ التحميل
                    </div>
                  ) : templates.length === 0 ? (
                    /* An empty list is ambiguous by contract: the generation
                       killswitch empties this endpoint, and so does having no
                       active templates. The API exposes nothing that tells the
                       two apart, so the copy covers both and submission stays
                       blocked either way. */
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5, lineHeight: 1.8 }}>
                      لا توجد قوالب متاحة.
                      <br />
                      قد تكون ميزة الإنشاء من قالب موقوفة من الخادم، أو لا توجد قوالب مفعّلة حالياً.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {templates.map(tpl => (
                        <TemplateCard key={tpl.id} tpl={tpl} active={false} onSelect={() => setSelectedTemplateId(tpl.id)} />
                      ))}
                    </div>
                  )}
                </>
              ) : templateLoading ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                  ...جارِ التحميل
                </div>
              ) : (
                <TemplateCard tpl={template} active onSelect={() => {}} />
              )}
            </div>
          </div>

          {/* Dynamic fields */}
          {template && !templateLoading && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <FileText size={16} style={{ color: 'var(--c-primary)' }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>بيانات القالب</span>
              </div>
              <div style={cardBodyStyle}>
                {(template.fields_schema ?? []).length === 0 ? (
                  <div style={{ padding: '8px 0', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                    لا توجد حقول إضافية لهذا القالب
                  </div>
                ) : (
                  <TemplateFieldForm
                    schema={template.fields_schema}
                    value={fieldValues}
                    onChange={setFieldValues}
                    errors={errors.field_values ?? {}}
                  />
                )}
              </div>
            </div>
          )}

          {/* Export / import counters */}
          {showCounters && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Hash size={16} style={{ color: 'var(--c-primary)' }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>أرقام الصادر والوارد</span>
              </div>
              <div style={cardBodyStyle}>
                <FieldWrap
                  label="رقم الصادر" required={exportRequired} error={errors.export_number}
                  hint={exportRequired ? 'لم يتم بعد تحديد بداية ترقيم الصادر لهذه الإدارة، يرجى إدخال الرقم الذي يبدأ منه الترقيم.' : undefined}
                >
                  <TextInput type="number" value={exportNumber} onChange={setExportNumber} placeholder="رقم الصادر" error={errors.export_number} />
                </FieldWrap>
                <div style={{ marginBottom: 0 }}>
                  <FieldWrap label="رقم الوارد (اختياري)">
                    <TextInput type="number" value={importNumber} onChange={setImportNumber} placeholder="رقم الوارد" />
                  </FieldWrap>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Attachments */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Paperclip size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>مرفقات إضافية (اختياري)</span>
        </div>
        <div style={cardBodyStyle}>
          <div
            onClick={() => attachInputRef.current?.click()}
            style={{
              border: '1.5px dashed var(--c-border)', borderRadius: 12, padding: '20px 16px',
              textAlign: 'center', cursor: 'pointer', background: 'var(--c-surface)', marginBottom: 12,
            }}
          >
            <input
              ref={attachInputRef} type="file" multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleAddAttachments(e.target.files); e.target.value = '' }}
            />
            <FileUp size={22} style={{ color: 'var(--c-text-3)', marginBottom: 6 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>انقر لإضافة مرفقات</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 4 }}>
              حتى {MAX_ATTACHMENTS} ملفات — PDF, Word, Excel, صور — {MAX_ATTACHMENT_MB} ميجابايت لكل ملف
            </div>
          </div>

          {errors.attachments && (
            <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginBottom: 10 }}>{errors.attachments}</div>
          )}

          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  border: '1px solid var(--c-border)', borderRadius: 10, background: '#fff',
                }}>
                  <FileText size={16} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{formatFileSize(f.size)}</div>
                  </div>
                  <button
                    type="button" onClick={() => removeAttachment(i)}
                    style={{
                      width: 26, height: 26, borderRadius: 7, border: '1px solid var(--c-border)',
                      background: '#fff', color: 'var(--c-text-3)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workflow & approvers */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <UserCheck size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>سير الاعتماد</span>
        </div>
        <div style={cardBodyStyle}>
          <FieldWrap label="نمط الاعتماد" required>
            <div style={{ display: 'flex', gap: 12 }}>
              {WORKFLOW_MODES.map(mode => (
                <WorkflowModeCard
                  key={mode.key} mode={mode} active={workflowMode === mode.key}
                  onSelect={() => setWorkflowMode(mode.key)}
                />
              ))}
            </div>
          </FieldWrap>

          <div style={{ marginBottom: 0 }}>
            <FieldWrap label="المعتمدون" required error={errors.approver_ids}>
              {staleApproverIds.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--c-pending-bg)', color: 'var(--c-text-2)',
                  fontSize: 11.5, lineHeight: 1.7,
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--c-pending)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    تمت إزالة معتمد لم يعد مؤهلاً (لم يعد مديراً أو رئيساً، أو حُذف حسابه).
                    تم تحديث قائمة المعتمدين — راجع القائمة وأكّدها قبل الإرسال.
                    <div style={{ marginTop: 7 }}>
                      <button
                        type="button" onClick={() => setStaleApproverIds([])}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 8,
                          border: '1px solid var(--c-border)', background: '#fff',
                          fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 700,
                          color: 'var(--c-text)', cursor: 'pointer',
                        }}
                      >
                        تأكيد قائمة المعتمدين الحالية
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <ApproverPicker
                value={approverIds}
                onChange={next => { setApproverIds(next); setStaleApproverIds([]) }}
                workflowMode={workflowMode}
                refreshKey={approverRefreshKey}
              />
            </FieldWrap>
          </div>
        </div>
      </div>

      {/* Submit */}
      {submitError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 10,
          background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 600,
          marginBottom: 16,
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/documents/sent')} disabled={submitting}>
          إلغاء
        </Button>
        <Button
          onClick={handleSubmit} disabled={submitDisabled} title={submitDisabledReason}
          style={submitDisabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        >
          {submitting ? '...جارِ الإرسال' : 'إرسال المستند'}
        </Button>
      </div>
    </div>
  )
}
